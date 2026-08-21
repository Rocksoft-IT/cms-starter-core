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

import { mkdir, writeFile } from 'node:fs/promises'
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

async function main() {
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
    console.log('[sitemap] search_visible is false — this client is not public yet, writing no sitemap.')
    return
  }

  const indexXml = await fetchText(`${base}/api/${INDEX_FILE}`)
  const locs = parseSitemapIndex(indexXml)

  if (locs.length === 0) {
    throw new Error('the sitemap index lists no locale files — refusing to ship an empty sitemap.')
  }

  await mkdir(OUT_DIR, { recursive: true })
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
