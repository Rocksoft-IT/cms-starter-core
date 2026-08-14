// The CMS's old -> new route map, turned into Astro redirects at build time (dashboard #1084).
//
// Why this exists: the CMS's redirect contract used to be request-time only. `GET /api/pages/
// {path}` answers a vacated path with 301 + `{ redirect }`, and `lib/api.ts`'s getPage()
// implements the client half — but a static build never calls it. It builds its routes from
// getPages(), which lists only pages that exist, so nothing ever asks about a path that no
// longer resolves and the old URL is simply a route the build did not emit: a hard 404, no
// matter how correct the row in the CMS is. `GET /api/redirects` hands over the whole set up
// front instead, and Astro emits one redirect per entry.
//
// Plain .mjs, not .ts, and deliberately NOT part of lib/api.ts: this module is loaded by
// astro.config.mjs, i.e. by Node before the Vite pipeline exists. `lib/api.ts` reads
// `import.meta.env` at module scope (see core/mock.ts) and imports `~site/fixtures` through a
// Vite alias — both undefined here. Same reason lib/smoke.mjs is a .mjs.
//
// What a static build emits per entry is an HTML file with `<meta http-equiv="refresh">`,
// `<meta name="robots" content="noindex">` and a canonical pointing at the destination. Not a
// 301 at the edge — that needs host config this build cannot write (the client sites are static
// files behind nginx) — but a redirect every crawler and browser follows, which is what the old
// URL needs and did not have. An adapter that understands redirects (Netlify, Vercel,
// Cloudflare) upgrades the same config to real 301s with no change here.

import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

/** Where a mock build reads the map from, relative to the Astro project root. */
const MOCK_FIXTURE = 'src/fixtures/data/redirects.json'

/**
 * How long the CMS gets to answer before the build gives up on redirects.
 *
 * Node's fetch has no default timeout, and this call sits on the build's startup path — an
 * unresponsive backend (as opposed to a failing one) would hang `astro:config:setup` forever,
 * before a single route is collected. That is the one way this module could take a deploy down,
 * which its whole error handling exists to prevent, so the wait is bounded and the abort lands in
 * the same catch as any other failure.
 */
const TIMEOUT_MS = 15_000

/**
 * The commands that actually need the map: a build emits the redirect pages, and dev serves them,
 * so a link followed locally behaves as it will in production. `sync` and `preview` emit no routes
 * — and `astro check` runs a sync, which is why this matters: without the guard, type-checking in
 * CI would make a live call to the CMS.
 */
const NEEDS_REDIRECTS = new Set(['build', 'dev'])

/**
 * A path as Astro wants it on both sides of a redirect: leading and trailing slash.
 *
 * The API already emits this shape, so this is a normalizer, not a translator — it exists
 * because the fixture a mock build reads is hand-written. `trailingSlash: 'always'` in the site
 * config is what makes the trailing half matter: without it the destination costs a second hop
 * on the way to the real page.
 *
 * Exported so the site layer's fixture accessor can look a path up in that same file without
 * writing its own copy of the rule (see src/fixtures/index.ts). One definition per side of the
 * process boundary — the CMS's is Redirect::publicPath().
 */
export function publicPath(value) {
  const trimmed = String(value)
    .trim()
    .replace(/^\/+|\/+$/g, '')
  return trimmed === '' ? '/' : `/${trimmed}/`
}

/** An absolute destination (another origin) passes through untouched — Astro supports those. */
function isExternal(value) {
  return /^https?:\/\//i.test(value)
}

/**
 * The API payload as an Astro `redirects` map: normalized, and with anything Astro would choke
 * on or emit uselessly dropped.
 *
 * Every drop here is a build the CMS's data cannot break. Astro parses each key as a route
 * pattern, so a `[` in a path would be read as a dynamic segment and throw during route
 * collection — a content row would take the whole deploy down. A self-redirect would emit a
 * page that refreshes to itself.
 *
 * @param {unknown} raw
 * @returns {Record<string, string>}
 */
export function toAstroRedirects(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {}

  const map = {}

  for (const [from, to] of Object.entries(raw)) {
    if (typeof to !== 'string') continue
    if (from.trim() === '' || to.trim() === '') continue
    if (/[[\]]/.test(from) || /[[\]]/.test(to)) continue

    const source = publicPath(from)
    const destination = isExternal(to) ? to : publicPath(to)
    if (source === destination) continue

    map[source] = destination
  }

  return map
}

/**
 * Make sure the site's own `.env` is in `process.env` before we read credentials from it.
 *
 * An integration's `astro:config:setup` runs BEFORE Astro loads `.env` (it does that from a Vite
 * plugin's buildStart, which is later), so `process.env.ASTRO_API_URL` is empty here on a plain
 * `astro build` — even though every other part of the build reads it fine through
 * `import.meta.env`. This does the same population Astro does, only early enough to be useful;
 * a variable already set in the real environment wins, as it does everywhere else.
 */
function loadSiteEnv(root) {
  if (process.env.ASTRO_API_URL && process.env.ASTRO_API_TOKEN) return

  try {
    process.loadEnvFile(path.join(root, '.env'))
  } catch {
    // No .env — a CI run or a container passing the real environment. Nothing to load.
  }
}

async function fetchRedirects(baseUrl, token) {
  const url = `${baseUrl.replace(/\/$/, '')}/api/redirects`

  let res
  try {
    res = await fetch(url, {
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    })
  } catch (cause) {
    // A bare `fetch failed` names neither the host nor the reason, and the warning this ends up
    // in is the only trace the deploy leaves. Same reasoning as scripts/fetch-sitemap.mjs.
    throw new Error(`could not reach ${url} (${cause.cause?.code ?? cause.message})`, { cause })
  }

  // A backend older than dashboard #1084 has no such route. That is not an error: it is the
  // state every client was in before this shipped, and the build must not depend on the two
  // being deployed in step.
  if (res.status === 404) return {}
  if (!res.ok) throw new Error(`${res.status} ${res.statusText} — ${url}`)

  const json = await res.json()
  return json?.data ?? {}
}

async function readMockRedirects(root) {
  const file = path.join(root, MOCK_FIXTURE)

  let raw
  try {
    raw = await readFile(file, 'utf8')
  } catch {
    return {} // No fixture: a site that has never recorded a redirect, not a failure.
  }

  // Deliberately NOT caught — a fixture that exists but does not parse is worth the caller's
  // warning, or a mock build silently drops the contract it exists to exercise.
  return JSON.parse(raw)
}

/**
 * Astro integration: fetch the CMS's redirect map and merge it into `config.redirects`.
 *
 * Add it to `integrations` in astro.config.mjs, next to UnoCSS:
 *
 *   import { cmsRedirects } from '@rocksoft/cms-starter-core/core/redirects.mjs'
 *   integrations: [UnoCSS(), cmsRedirects()]
 *
 * It runs in `astro:config:setup` because that is the last hook before Astro collects routes
 * from `config.redirects` — `astro:config:done` is already too late to add one.
 *
 * `baseUrl` / `token` default to `ASTRO_API_URL` / `ASTRO_API_TOKEN`, read from the environment
 * or from the site's `.env` (see loadSiteEnv). Pass them explicitly when the site resolves its
 * credentials some other way — a `.env.production` cascade, a secrets manager — rather than
 * teaching core about a layout it cannot see.
 *
 * A failure warns and continues rather than failing the build, unlike the sitemap fetch. The two
 * are not the same bet: a stale sitemap actively advertises wrong URLs to crawlers, while no
 * redirects is exactly the state the site was in before this existed. Taking a content deploy
 * down over a secondary feature would be the worse trade — and a backend that is genuinely
 * unreachable fails the build a moment later anyway, in getPages().
 */
export function cmsRedirects({ baseUrl, token } = {}) {
  return {
    name: '@rocksoft/cms-starter-core:redirects',
    hooks: {
      'astro:config:setup': async ({ config, command, updateConfig, logger }) => {
        if (!NEEDS_REDIRECTS.has(command)) return

        const root = fileURLToPath(config.root)
        let raw = {}

        try {
          // Checked before the env is touched: a mock build has no backend by definition, so
          // there are no credentials to look for and no .env probe to pay for.
          if (process.env.ASTRO_API_MOCK === '1') {
            raw = await readMockRedirects(root)
          } else {
            // Only when we are the ones who have to find the credentials: a caller that passed
            // both did not ask us to touch its environment.
            if (!baseUrl || !token) loadSiteEnv(root)

            const url = baseUrl ?? process.env.ASTRO_API_URL
            const key = token ?? process.env.ASTRO_API_TOKEN

            if (url && key) {
              raw = await fetchRedirects(url, key)
            } else {
              logger.warn('ASTRO_API_URL / ASTRO_API_TOKEN are not set — building without CMS redirects.')
            }
          }
        } catch (error) {
          // Named, not swallowed: this is the only trace a deploy leaves of the old URLs
          // silently going back to 404ing.
          logger.warn(`${error.message} — building without CMS redirects.`)
        }

        const redirects = toAstroRedirects(raw)
        const count = Object.keys(redirects).length

        if (count === 0) return

        // Merged, not assigned: a site may declare redirects of its own in astro.config.mjs.
        updateConfig({ redirects })
        logger.info(`${count} redirect(s) from the CMS.`)
      },
    },
  }
}
