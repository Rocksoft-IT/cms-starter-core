import { cmsConfig } from '~site/cms.config'
import { resolveSiteOrigin } from './siteOrigin.mjs'

/**
 * The site's public origin, without a trailing slash — the single source of truth for every
 * absolute URL the build emits: the canonical/og:url in <Seo>, and the `Sitemap:` line in
 * robots.txt.
 *
 * Order: `ASTRO_SITE_URL` (per-environment, so a staging deploy doesn't advertise production
 * URLs) then `cmsConfig.seo.siteUrl` (per-project default). Before #514 these two surfaces read
 * different things — `astro.config.mjs` had no `site` at all and `<Seo>` fell back to
 * `Astro.url.href`, i.e. the BUILD host — so a canonical could point at localhost while the
 * sitemap pointed at the real domain.
 *
 * The resolution itself lives in `./siteOrigin.mjs`, which `astro.config.mjs` also calls with the
 * same two candidates in the same order. That is deliberate: #514 gave `site` a value, and #1090
 * found it was still a SECOND implementation of this rule that disagreed with this one — it read
 * `process.env` (empty at config-evaluation time, so `.env` was invisible) and had no
 * `cmsConfig.seo.siteUrl` fallback at all. One function, called twice, cannot drift that way.
 *
 * Returns null when neither is set, and every caller degrades rather than inventing an origin:
 * <Seo> keeps its build-URL fallback, robots.txt omits the Sitemap line. A wrong absolute URL
 * is worse than an absent one — it is the address crawlers would index.
 */
export function siteUrl(): string | null {
  return resolveSiteOrigin(import.meta.env.ASTRO_SITE_URL, cmsConfig.seo?.siteUrl)
}
