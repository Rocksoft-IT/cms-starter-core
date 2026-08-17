// The one rule for "what is this site's public origin", shared by the two places that have to
// answer it — and that used to answer it differently (dashboard #1090).
//
// `core/site.ts`'s siteUrl() runs inside the Vite pipeline and reads `import.meta.env`.
// `astro.config.mjs`'s `site` is evaluated by the config loader, before that pipeline exists, and
// used to read `process.env` — which Astro does not populate from `.env` until a Vite plugin's
// buildStart, i.e. long after. It also had no fallback to `cmsConfig.seo.siteUrl`, which at the time
// was the source every real client site actually used, since nothing populated ASTRO_SITE_URL. So
// one surface could resolve an absolute origin while the other resolved nothing, in the same build.
// (The panel's deploy now writes ASTRO_SITE_URL from the client's default domain — dashboard
// #1107 — so the first candidate is real; the config one remains the fallback.)
//
// Plain .mjs, not .ts, for the same reason core/redirects.mjs is: astro.config.mjs loads it, and
// anything reading `import.meta.env` or importing through the `~site` alias is unavailable there.
// Both callers pass their own candidates in, so this file reads no environment of its own.

/**
 * The first usable origin among `candidates`, normalized — or `null` when there is none.
 *
 * Order is the caller's statement of precedence, not this function's: pass the per-environment
 * source first (`ASTRO_SITE_URL`, so a staging deploy does not advertise production URLs), the
 * per-project default second (`cmsConfig.seo.siteUrl`).
 *
 * Trailing slashes are stripped so callers can concatenate a path without doubling the separator,
 * and whitespace is trimmed because these values arrive from a `.env` line or a hand-edited config
 * — a stray space would make Astro reject `site` as an invalid URL at config validation.
 *
 * Returns null rather than inventing an origin: every caller degrades instead (<Seo> keeps its
 * build-URL fallback, robots.txt omits the Sitemap line, Astro emits relative URLs). A wrong
 * absolute URL is worse than an absent one — it is the address crawlers would index.
 *
 * @param {...(string | undefined | null)} candidates
 * @returns {string | null}
 */
export function resolveSiteOrigin(...candidates) {
  for (const candidate of candidates) {
    if (typeof candidate !== 'string') continue

    const origin = candidate.trim().replace(/\/+$/, '')
    if (origin !== '') return origin
  }

  return null
}
