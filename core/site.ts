import { cmsConfig } from '~site/cms.config'
import { getSiteSettings } from '../lib/api'
import { resolveSiteOrigin } from './siteOrigin.mjs'

/**
 * The site's public origin, without a trailing slash - the single source of truth for every
 * absolute URL the build emits: the canonical/og:url in <Seo>, and the `Sitemap:` line in
 * robots.txt.
 *
 * Order: `ASTRO_SITE_URL` (per-environment, so a staging deploy doesn't advertise production
 * URLs), then the CMS's own `site_settings.frontend_url`, then `cmsConfig.seo.siteUrl`
 * (per-project default). The middle candidate is what makes the panel the source of truth for a
 * domain (dashboard #1195): a test/staging domain gets attached there routinely, and before this
 * the only way it could reach a build was a hand-edited repo value that then outlived it.
 *
 * Before #514 these surfaces read different things - `astro.config.mjs` had no `site` at all and
 * <Seo> fell back to `Astro.url.href`, i.e. the BUILD host - so a canonical could point at
 * localhost while the sitemap pointed at the real domain. The normalization itself therefore lives
 * in `./siteOrigin.mjs`, which `astro.config.mjs` also calls: #1090 found a SECOND implementation
 * of the rule there that read `process.env` (empty at config-evaluation time, so `.env` was
 * invisible) and had no config fallback at all.
 *
 * `astro.config.mjs` keeps its own TWO-candidate call, deliberately and permanently: it is
 * evaluated before Vite exists, so it can neither await nor fetch, and `site_settings.frontend_url`
 * is unreachable from there at any cost. The two surfaces therefore agree except when a client has
 * a CMS domain and no ASTRO_SITE_URL - a case the panel's own deploy does not produce, since it
 * writes ASTRO_SITE_URL from that same domain (#1107).
 *
 * ASYNC since the #1195 seam: a client repo moving its core pin past that release must add `await`
 * at BOTH call sites it owns - `src/components/Seo.astro` and `src/pages/robots.txt.ts`. The first
 * is a compile error under `astro check` (canonicalUrl takes `string | null`); the second is NOT -
 * a Promise is truthy, so an un-awaited call silently writes `Sitemap: [object Promise]`.
 *
 * Returns null when nothing is set, and every caller degrades rather than inventing an origin:
 * <Seo> keeps its build-URL fallback, robots.txt omits the Sitemap line. A wrong absolute URL is
 * worse than an absent one - it is the address crawlers would index.
 */
export async function siteUrl(): Promise<string | null> {
  // getSiteSettings resolves to a safe default rather than rejecting, so a CMS that is down or
  // 404ing degrades to the env/config candidates instead of failing the build.
  const settings = await getSiteSettings()

  return resolveSiteOrigin(import.meta.env.ASTRO_SITE_URL, settings.frontend_url, cmsConfig.seo?.siteUrl)
}
