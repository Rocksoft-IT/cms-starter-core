import type { APIRoute } from 'astro'
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
 * Lives in core since dashboard #1195 step 8: nothing here is per-site, so a client's own
 * `src/pages/robots.txt.ts` is a one-line re-export of this handler and a fix arrives with a core
 * pin bump. The file still has to EXIST there — Astro builds routes from files under src/pages/
 * and does not scan node_modules.
 */
export const GET: APIRoute = async () => {
  // `await` is load-bearing and TypeScript will NOT catch its absence here: a Promise is truthy,
  // so an un-awaited call passes the `if` below and interpolates as `Sitemap: [object Promise]`.
  const base = await siteUrl()
  const lines = ['User-agent: *', 'Allow: /']

  if (base) lines.push('', `Sitemap: ${base}/sitemap-index.xml`)

  return new Response(lines.join('\n') + '\n', {
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  })
}
