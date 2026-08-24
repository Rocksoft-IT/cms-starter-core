// The client's brand font, self-hosted by the build (dashboard #1485, finishing #114).
//
// Why this exists: core resolves its display face from one CSS variable —
// `'font-brand': '[font-family:var(--font-primary,inherit)]'` in uno.core.ts — and nothing ever
// defined it. The build emitted colour tokens at `:root` and no font token at all, so every
// section heading, FAQ heading, CTA heading and features step number rendered in whatever the
// site's own `global.css` put on `body`. A client wanting its own brand face had exactly two
// routes: a PR against its repo, or a `custom_html` block carrying a `<style>` — the second being
// the anti-pattern #1451 / #1455 set out to remove.
//
// SELF-HOSTED, NOT LINKED. Astro's Fonts API downloads the files at build time into
// `_astro/fonts` and serves them from the site's own origin. A `<link>` to fonts.googleapis.com
// would hand the visitor's IP to Google on every page view — which, on a fleet that ships a
// consent system and has German-language clients, makes the FONT a third-party request to
// consent-gate, and a gated font means text reflowing after the visitor accepts. Self-hosting
// removes the request and the question with it.
//
// Plain .mjs, not .ts, and deliberately NOT part of lib/api.ts: `fonts` is an `astro.config`
// option, so the family has to be known before Vite exists. Same constraint, same shape and the
// same failure discipline as core/redirects.mjs — read that file's header for the reasoning; this
// one only notes where the two differ.
//
// HOW THIS CANNOT TAKE A DEPLOY DOWN — three layers, in the order they act:
//
//   1. Here: the family is preflighted against Google with a bounded timeout, and is registered
//      only if that answers. A firewalled build host, a DNS failure, a family the CMS knows and
//      Google does not — all end as a warning and a site that builds exactly as it does today.
//   2. Astro: it creates its unifont resolver with `throwOnError: false`, so a provider that
//      fails to init or resolve degrades to zero font faces plus a warning, not a thrown build.
//      `--font-primary` is then emitted carrying only the fallback stack.
//   3. core/BrandFont.astro: `<Font>` THROWS on a cssVariable no family registered, so the
//      component renders it only when `fontData` says the config side got that far.
//
// The one window left is a font file that 404s or times out mid-build, after the metadata
// resolved: Astro fails the build there, and deploy.sh leaves the previous release live. Astro
// caches the downloaded files in its `cacheDir`, which survives between deploys (the client
// checkout is updated in place), so only the first build after a font change reaches Google.

import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

/** Where a mock build reads branding from, relative to the Astro project root. */
const MOCK_FIXTURE = 'src/fixtures/data/branding.json'

/**
 * The CSS variable core's `font-brand` shortcut reads. Hard-coded rather than configurable: it is
 * one half of a contract whose other half is a string in uno.core.ts, and a site that renamed it
 * here would silently stop theming anything.
 */
export const BRAND_FONT_CSS_VARIABLE = '--font-primary'

/**
 * Character sets to download. `latin-ext` is not optional on this fleet — it is what carries ą, ć,
 * ę, ł, ń, ó, ś, ż, ź and the German umlauts; without it Polish text falls back mid-word, one
 * glyph at a time. Every family in the CMS catalog is published with both.
 */
const SUBSETS = ['latin', 'latin-ext']

/** How long Google gets to answer the preflight before the build gives up on the font. */
const TIMEOUT_MS = 10_000

/** The commands that need fonts: a build downloads them, dev serves them. See redirects.mjs. */
const NEEDS_FONTS = new Set(['build', 'dev'])

/**
 * The CMS's `fonts.primary` payload as an Astro font family, or `[]` when there is nothing to
 * register — which is the state every client is in until it picks one, and the reason this whole
 * feature is additive.
 *
 * Every rejection here is a build the CMS's data cannot break. The backend validates against a
 * closed catalog, so a bad shape means an older/newer panel or a hand-edited fixture, not an
 * editor's typo — and neither is worth a failed deploy.
 *
 * `provider` is passed in rather than imported so the pure shape can be asserted without Astro's
 * config module, and so a second provider later is a caller's decision, not a rewrite here.
 *
 * @param {unknown} raw the `data` of GET /api/branding
 * @param {unknown} provider an Astro font provider (fontProviders.google())
 * @returns {Array<Record<string, unknown>>}
 */
export function toFontFamilies(raw, provider) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return []

  const primary = /** @type {Record<string, any>} */ (raw).fonts?.primary
  if (!primary || typeof primary !== 'object') return []

  const name = typeof primary.family === 'string' ? primary.family.trim() : ''
  if (name === '') return []

  // The backend names the provider explicitly (see BrandFonts::resolve). An unknown one must not
  // resolve through Google's by accident — that is how a future self-hosted-upload provider would
  // silently fetch a same-named Google family instead.
  if (primary.provider !== undefined && primary.provider !== 'google') return []

  const weights = Array.isArray(primary.weights)
    ? [...new Set(primary.weights.map(Number).filter((w) => Number.isInteger(w) && w >= 1 && w <= 1000))].sort(
        (a, b) => a - b,
      )
    : []

  const fallbacks = Array.isArray(primary.fallbacks)
    ? primary.fallbacks.filter((f) => typeof f === 'string' && f.trim() !== '')
    : []

  return [
    {
      provider,
      name,
      cssVariable: BRAND_FONT_CSS_VARIABLE,
      // Astro's own defaults are `[400]` and `['sans-serif']`. Falling back to them rather than to
      // nothing keeps a payload from a panel older than this feature's weight/fallback fields
      // building — with a plain regular face and a generic stack, which is a worse font, not a
      // broken site.
      weights: weights.length > 0 ? weights : [400],
      ...(fallbacks.length > 0 ? { fallbacks } : {}),
      subsets: SUBSETS,
      // Astro's default is `['normal', 'italic']`, which DOUBLES the download — two subsets times
      // two styles times every weight, so a plain 400/700 family ships eight files instead of
      // four. `font-brand` styles headings (section, FAQ, CTA, the features step numbers); an
      // italic one is close to nonexistent, and where a heading does carry an <em> the browser
      // synthesizes an oblique. Half the bytes for a distinction this face is never asked to make.
      styles: ['normal'],
    },
  ]
}

/**
 * Google's stylesheet endpoint for a family, which is also the cheapest existence check there is:
 * it answers 400 for a family it does not publish and for a weight it does not have.
 *
 * @param {string} name
 * @param {number[]} weights
 */
function css2Url(name, weights) {
  const spec = `${name.replace(/\s+/g, '+')}:wght@${[...weights].sort((a, b) => a - b).join(';')}`
  return `https://fonts.googleapis.com/css2?family=${spec}&display=swap`
}

/**
 * Whether Google will actually serve this family, asked before the family is registered.
 *
 * This is the layer that turns "the build host cannot reach Google" — a firewalled VPS, a DNS
 * outage, a proxy — from a failed deploy into a site that renders in its fallback stack. It costs
 * one small request per build, and it cannot promise anything about the seconds that follow: a
 * network that dies between here and the font download still fails the build. That is the same
 * exposure every other build-time fetch has, and the deploy script's answer to it is to leave the
 * previous release live.
 *
 * @param {string} name
 * @param {number[]} weights
 */
async function isServable(name, weights) {
  const url = css2Url(name, weights)

  let res
  try {
    res = await fetch(url, {
      // Google serves modern woff2 @font-face blocks only to a browser-shaped UA; without one it
      // answers with truetype URLs. The preflight only reads the status code, but asking as the
      // build's own font fetcher will ask keeps the two from disagreeing about what exists.
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; cms-starter-core font preflight)' },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    })
  } catch (cause) {
    // A bare `fetch failed` names neither the host nor the reason, and the warning this ends up in
    // is the only trace the deploy leaves. Same reasoning as core/redirects.mjs.
    throw new Error(`could not reach ${url} (${cause.cause?.code ?? cause.message})`, { cause })
  }

  if (!res.ok) throw new Error(`${res.status} ${res.statusText} — ${url}`)

  return true
}

/**
 * Make sure the site's own `.env` is in `process.env` before we read credentials from it. Verbatim
 * counterpart of core/redirects.mjs's loadSiteEnv — see the reasoning there.
 */
function loadSiteEnv(root) {
  if (process.env.ASTRO_API_URL && process.env.ASTRO_API_TOKEN) return

  try {
    process.loadEnvFile(path.join(root, '.env'))
  } catch {
    // No .env — a CI run or a container passing the real environment. Nothing to load.
  }
}

async function fetchBranding(baseUrl, token) {
  const url = `${baseUrl.replace(/\/$/, '')}/api/branding`

  let res
  try {
    res = await fetch(url, {
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    })
  } catch (cause) {
    throw new Error(`could not reach ${url} (${cause.cause?.code ?? cause.message})`, { cause })
  }

  // A backend older than #1485 answers this route without a `fonts` key, which toFontFamilies
  // reads as "no font" — the two do not have to be deployed in step.
  if (!res.ok) throw new Error(`${res.status} ${res.statusText} — ${url}`)

  const json = await res.json()
  return json?.data ?? {}
}

async function readMockBranding(root) {
  const file = path.join(root, MOCK_FIXTURE)

  let raw
  try {
    raw = await readFile(file, 'utf8')
  } catch {
    return {} // No fixture: a site with no branding at all, not a failure.
  }

  // Deliberately NOT caught — a fixture that exists but does not parse is worth the caller's
  // warning, exactly as in readMockRedirects.
  return JSON.parse(raw)
}

/**
 * Astro integration: register the client's brand font so the build self-hosts it and emits
 * `--font-primary`.
 *
 * Add it to `integrations` in astro.config.mjs, next to cmsRedirects(), and render core's
 * `<BrandFont />` in the layout head — the component is what turns a registered family into the
 * `@font-face` rules and the `:root` variable:
 *
 *   import { fontProviders } from 'astro/config'
 *   import { cmsFonts } from '@rocksoft/cms-starter-core/core/fonts.mjs'
 *   integrations: [UnoCSS(), cmsRedirects(), cmsFonts()]
 *
 * `baseUrl` / `token` default to `ASTRO_API_URL` / `ASTRO_API_TOKEN`, as in cmsRedirects().
 * `provider` defaults to Astro's Google provider; it is injectable so a test — or a future
 * self-hosted-upload provider — does not have to reach the network to exercise the hook.
 *
 * A failure warns and continues rather than failing the build: a site rendering in its fallback
 * stack is the state it was in before this existed, and taking a content deploy down over the
 * typeface would be the worse trade. Identical bet, and identical wording, to cmsRedirects().
 */
export function cmsFonts({ baseUrl, token, provider } = {}) {
  return {
    name: '@rocksoft/cms-starter-core:fonts',
    hooks: {
      'astro:config:setup': async ({ config, command, updateConfig, logger }) => {
        if (!NEEDS_FONTS.has(command)) return

        const root = fileURLToPath(config.root)
        let raw = {}

        try {
          if (process.env.ASTRO_API_MOCK === '1') {
            raw = await readMockBranding(root)
          } else {
            if (!baseUrl || !token) loadSiteEnv(root)

            const url = baseUrl ?? process.env.ASTRO_API_URL
            const key = token ?? process.env.ASTRO_API_TOKEN

            if (url && key) {
              raw = await fetchBranding(url, key)
            } else {
              logger.warn('ASTRO_API_URL / ASTRO_API_TOKEN are not set — building without a CMS brand font.')
            }
          }
        } catch (error) {
          logger.warn(`${error.message} — building without a CMS brand font.`)
          return
        }

        // Resolved late so the provider is only constructed when there is something to register:
        // it is a live import of Astro's config module, and a mock build has no reason to pay for
        // one it will not use.
        const resolvedProvider = provider ?? (await import('astro/config')).fontProviders.google()
        const fonts = toFontFamilies(raw, resolvedProvider)

        if (fonts.length === 0) return

        const [family] = fonts

        try {
          await isServable(family.name, family.weights)
        } catch (error) {
          logger.warn(`${error.message} — building without the "${family.name}" brand font.`)
          return
        }

        // Appended, not assigned — `updateConfig` concatenates arrays, so a site's own `fonts`
        // entries are kept and this one lands after them. Astro resolves the LAST registration for
        // a cssVariable, so the CMS wins over a site that also declared `--font-primary`: the same
        // precedence every other brand value in this stack has (/api/branding over
        // `cmsConfig.brand.colors` over core's defaults). Astro logs that the two did not merge,
        // which is worth seeing — it names a site-level declaration the panel is now overriding.
        updateConfig({ fonts })
        logger.info(`Brand font from the CMS: ${family.name} (${family.weights.join(', ')}).`)
      },
    },
  }
}
