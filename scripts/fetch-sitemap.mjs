// Fetch the CMS's sitemaps into public/ before `astro build` copies public/ into dist/.
//
// The backend owns sitemap generation (diligently-dashboard#510/#513): it already owns URL
// shape, so a frontend that generated its own XML would be a second implementation of the same
// rule — and the first byte the two disagreed on would be a <loc> pointing at a 404.
//
// This script therefore does exactly three things: fetch the index, DISCOVER the locale files
// from it, and write them out. It never decides which locales exist — that is per client and
// changes without the frontend knowing.
//
// Ordering matters: this must run BEFORE `astro build`, never as a postbuild hook. A postbuild
// hook writes into public/ after the build has already copied it, so the files land one run
// late — the deploy that follows serves the PREVIOUS build's sitemap.
//
// Lives in core since dashboard #1324, for the same reason robots.ts did in v0.20.0: a client
// repo's copy is a one-line wrapper, so a fix arrives with a pin bump. It had already drifted —
// diligently.pl carried an env fix the starter never got back.
//
// ENV: this is a plain Node script, so unlike `astro build` it reads NOTHING from `.env` by
// itself, and the deploy script does not export the values either (RunCloud writes the file;
// Astro reads it). Missing them, the script throws and — running as `fetch-sitemap && astro
// build` under `set -e` — aborts the deploy before Astro ever starts: public_html never flips
// and the panel's build job polls until its timeout. The fix belongs at the INVOCATION, not in
// here: every caller must pass `node --env-file-if-exists=.env` (Node >= 20.12). Real env vars
// still win, so CI can override without a file. diligently.pl solved this in-script with vite's
// loadEnv instead; that variant is retired by the move, since core must not reach for a
// bundler at build-script time.

import { mkdir, readdir, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'

const API_URL = process.env.ASTRO_API_URL
const API_TOKEN = process.env.ASTRO_API_TOKEN
const MOCK_MODE = process.env.ASTRO_API_MOCK === '1'
const OUT_DIR = path.resolve('public')
const INDEX_FILE = 'sitemap-index.xml'

/**
 * The `<loc>` values of a sitemap index, in document order.
 *
 * Exported so it can be tested directly: the whole point of this script is that the locale
 * list comes from the CMS, and that claim lives entirely in this function.
 */
export function parseSitemapIndex(xml) {
  return [...xml.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/g)].map((m) => m[1])
}

/** The file name a discovered sitemap URL should be written under, e.g. `sitemap-pl.xml`. */
export function fileNameFor(loc) {
  const name = new URL(loc).pathname.split('/').pop()
  if (!name || !/^[\w.-]+\.xml$/.test(name)) {
    throw new Error(`Refusing to write a sitemap from a suspicious <loc>: ${loc}`)
  }
  return name
}

async function fetchText(url) {
  let res
  try {
    res = await fetch(url, {
      headers: { Authorization: `Bearer ${API_TOKEN}`, Accept: 'application/xml' },
    })
  } catch (cause) {
    // A bare `fetch failed` names neither the host nor the reason, which is useless in CI logs
    // — and this error is the whole point of the script, so it has to be readable.
    throw new Error(`could not reach ${url} (${cause.cause?.code ?? cause.message})`, { cause })
  }
  if (!res.ok) throw new Error(`${res.status} ${res.statusText} — ${url}`)
  return res.text()
}

/**
 * Whether this client may be indexed at all — `search_visible` from GET /api/site-settings.
 *
 * Exported so the default can be asserted directly: "absent means visible" is the whole safety
 * argument, and it is invisible from the outside once it is buried in a `??`.
 */
export function isSearchVisible(settings) {
  return settings?.data?.search_visible ?? true
}

async function searchVisible(base) {
  return isSearchVisible(JSON.parse(await fetchText(`${base}/api/site-settings`)))
}

/**
 * Whether a name in `public/` is one of this script's own outputs — `sitemap-index.xml` and the
 * per-locale `sitemap-<code>.xml` files.
 *
 * Narrow on purpose. This decides what gets DELETED from a directory the site also uses for
 * hand-placed assets, so it matches the exact shape written below and nothing else: a
 * `sitemap.xml` somebody put there deliberately is not ours to remove.
 */
export function isSitemapArtifact(name) {
  return /^sitemap-[\w.-]+\.xml$/.test(name)
}

/**
 * The two names in `public/` that SHADOW a CMS-generated document, given the directory's entries.
 *
 * `public/` is copied over the built output, so a file placed there wins against the page the app
 * generates — silently, and only on the live site. Two names can do that here:
 *
 * - `robots.txt` shadows `src/pages/robots.txt.ts` (core/robots.ts), the route that advertises the
 *   sitemap index;
 * - `sitemap.xml` shadows nothing this script writes (it writes `sitemap-index.xml` and
 *   `sitemap-<code>.xml`) but is what a crawler looks for by convention, so a stale hand-written
 *   copy there outranks the CMS's in practice.
 *
 * Measured, not hypothetical: kaffemaskin-til-bedrift carried both from 2026-08-19, so its live
 * robots.txt advertised `https://www.kaffemaskin-til-bedrift.no/sitemap.xml` — a host that does
 * not resolve — while the CMS's own `sitemap-index.xml` was served correctly and never mentioned.
 *
 * Pure and exported so the rule can be asserted without a filesystem: it takes names, not a path.
 */
export function shadowingFiles(names) {
  const shadows = ['robots.txt', 'sitemap.xml']

  return names.filter((name) => shadows.includes(name))
}

/**
 * Refuse the build when `public/` shadows a CMS document.
 *
 * A refusal, not a warning, and BEFORE `astro build`: the previous release stays live (same shape
 * as verify-block-coverage), and the repo owner has to delete the file — the build cannot, because
 * `public/` is where a site legitimately keeps its own assets and deleting from it would be this
 * script reaching past its own outputs (see isSitemapArtifact).
 */
async function assertNothingShadowsTheCms() {
  let names
  try {
    names = await readdir(OUT_DIR)
  } catch {
    return // no public/ at all
  }

  const shadowing = shadowingFiles(names)

  if (shadowing.length > 0) {
    throw new Error(
      `public/${shadowing.join(' and public/')} shadows the CMS-generated one. `
      + '`public/` is copied over the built output, so this file wins against the route the app '
      + 'generates and the site serves a hand-written copy instead — robots.txt would advertise '
      + 'whatever sitemap URL it happens to contain. Delete it from the repo; the CMS builds both.',
    )
  }
}

/**
 * Delete this script's previous outputs from `public/`.
 *
 * `public/` is a build INPUT that survives between deploys, so writing nothing is not the same
 * as publishing nothing: a client that was visible and is now hidden kept serving the sitemap it
 * had been given, from a file no later build touched (dashboard #1324). Skipping the fetch was
 * never going to be enough on its own.
 *
 * Also run before writing a fresh set, which fixes the same leak for a locale that gets
 * disabled: its `sitemap-<code>.xml` would otherwise linger and stay advertised by nothing,
 * reachable by anything that guessed the address.
 */
async function removeStaleSitemaps() {
  let names
  try {
    names = await readdir(OUT_DIR)
  } catch {
    return 0 // no public/ yet - nothing was ever written
  }

  const stale = names.filter(isSitemapArtifact)
  await Promise.all(stale.map((name) => rm(path.join(OUT_DIR, name), { force: true })))

  return stale.length
}

async function main() {
  // First, and in mock mode too: a shadowing file is a repo defect that has nothing to do with
  // the backend, and a mock build is exactly where a starter change would introduce one.
  await assertNothingShadowsTheCms()

  // A mock build has no backend by definition; it also publishes nothing, so there is no
  // sitemap to be stale. Every other build must produce real files or fail.
  if (MOCK_MODE) {
    console.log('[sitemap] ASTRO_API_MOCK=1 — skipping sitemap fetch (offline build).')
    return
  }

  if (!API_URL || !API_TOKEN) {
    throw new Error('ASTRO_API_URL and ASTRO_API_TOKEN must be set to fetch sitemaps.')
  }

  const base = API_URL.replace(/\/$/, '')

  // A client that is not public yet publishes no sitemap at all (dashboard #1169). Its pages
  // already carry `noindex` and robots.txt advertises nothing, so a sitemap here would be the
  // one artefact still handing crawlers a complete list of URLs to visit.
  //
  // Absent or unreadable resolves to VISIBLE, matching core/effectiveConfig.ts: the flag is
  // missing on an older panel, and a build must not silently stop publishing a live site's
  // sitemap because one request came back odd. `fetchText` throws on a non-2xx, which stays
  // fatal — this reads the value, it does not soften the endpoint's failure.
  if (!(await searchVisible(base))) {
    const removed = await removeStaleSitemaps()
    console.log(
      `[sitemap] search_visible is false — this client is not public yet, writing no sitemap`
      + (removed > 0 ? ` (removed ${removed} stale file(s) from a previous build).` : '.'),
    )

    return
  }

  const indexXml = await fetchText(`${base}/api/${INDEX_FILE}`)
  const locs = parseSitemapIndex(indexXml)

  if (locs.length === 0) {
    throw new Error('the sitemap index lists no locale files — refusing to ship an empty sitemap.')
  }

  await mkdir(OUT_DIR, { recursive: true })
  // Clear the previous set before writing this one, so a locale that has since been disabled
  // does not leave its file behind to be served forever.
  await removeStaleSitemaps()
  await writeFile(path.join(OUT_DIR, INDEX_FILE), indexXml, 'utf8')

  // The index points at the FRONTEND's copies (that is where crawlers fetch them), so each
  // locale file is fetched from the API by name rather than from the <loc> URL itself — which
  // is this very site, and is not serving them yet at build time.
  for (const loc of locs) {
    const file = fileNameFor(loc)
    const xml = await fetchText(`${base}/api/${file}`)
    await writeFile(path.join(OUT_DIR, file), xml, 'utf8')
    console.log(`[sitemap] wrote public/${file}`)
  }

  console.log(`[sitemap] wrote public/${INDEX_FILE} + ${locs.length} locale file(s).`)
}

/**
 * Run the fetch as a build step, exiting non-zero on any failure.
 *
 * This module deliberately does NOT self-execute on import. The site-level wrapper is named
 * `fetch-sitemap.mjs` too, so the old "argv[1] ends with fetch-sitemap.mjs" guard would fire on
 * the wrapper's import AND on the wrapper's own call — running the whole fetch twice.
 * Exporting the entry point instead makes the caller the single trigger.
 *
 * Any failure fails the build. A caught-and-warned error would ship a green build serving the
 * PREVIOUS deploy's sitemap — stale URLs advertised to crawlers, with nothing to notice it.
 */
export function run() {
  return main().catch((error) => {
    console.error(`[sitemap] ${error.message}`)
    process.exit(1)
  })
}
