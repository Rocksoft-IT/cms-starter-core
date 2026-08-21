import type { APIRoute } from 'astro'
import { getEffectiveConfig } from './effectiveConfig'
import { siteUrl } from './site'

/**
 * robots.txt, advertising the sitemap INDEX only.
 *
 * The per-locale files are discovered through the index, by crawlers exactly as by
 * scripts/fetch-sitemap.mjs — listing them here would be a second, hand-maintained copy of the
 * client's locale set, and the copy that goes stale first (diligently-dashboard#514).
 *
 * No `Disallow` rules: what must stay out of the index is decided per page by the CMS's
 * `noindex` toggle (#511), which renders as <meta name="robots">. A path-based rule here would
 * be a second, conflicting source of truth — and a `Disallow`ed page cannot even be crawled to
 * discover its `noindex`.
 *
 * That last clause is why a client that is NOT PUBLIC YET (`search_visible` false, dashboard
 * #1169) does not get a blanket `Disallow: /` here either, tempting as it looks. Its pages
 * already say `noindex` — see core/Seo.astro — and a crawler has to be allowed in to read that.
 * Disallowing would prevent indexing a staging copy Google has not seen yet, but for one it HAS
 * seen it would freeze those URLs in the index with no way to withdraw them. Staying crawlable
 * is the option that works in both cases. What the flag does change here is the `Sitemap:`
 * line: a site that is not public has no business handing crawlers a complete list of its URLs,
 * and the build writes no sitemap files for it anyway (scripts/fetch-sitemap.mjs).
 *
 * Lives in core since dashboard #1195 step 8: nothing here is per-site, so a client's own
 * `src/pages/robots.txt.ts` is a one-line re-export of this handler and a fix arrives with a core
 * pin bump. The file still has to EXIST there — Astro builds routes from files under src/pages/
 * and does not scan node_modules.
 */
/**
 * The file's body, as lines. Pure and exported so the one rule that varies — when the `Sitemap:`
 * line appears — can be asserted without mocking a fetch or running a build. A mock build cannot
 * cover it either way: it resolves no origin, so the line is absent there for the wrong reason.
 */
export function robotsLines(base: string | null, searchVisible: boolean): string[] {
  const lines = ['User-agent: *', 'Allow: /']

  if (base && searchVisible) lines.push('', `Sitemap: ${base}/sitemap-index.xml`)

  return lines
}

export const GET: APIRoute = async () => {
  // `await` is load-bearing and TypeScript will NOT catch its absence here: a Promise is truthy,
  // so an un-awaited call passes the check in robotsLines and interpolates as
  // `Sitemap: [object Promise]`.
  const base = await siteUrl()
  const { searchVisible } = await getEffectiveConfig()

  return new Response(robotsLines(base, searchVisible).join('\n') + '\n', {
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  })
}
