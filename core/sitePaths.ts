// The whole `getStaticPaths` body a site's catch-all route used to spell out for itself
// (dashboard #1195 step 8). A client repo's `src/pages/[...uri].astro` must exist — Astro builds
// routes from files under src/pages/ and does not scan node_modules — but nothing in it needs to
// be per-site except the two registries, so everything else lives here and reaches a client by a
// core pin bump instead of a per-repo edit.
//
// Deliberately NOT folded into ./routing.ts: that module is pure (data in, routes out) and takes
// every input as a parameter, which is what makes buildStaticPaths straightforward to reason
// about and to test. This one does I/O — it is the orchestration layer above it — so keeping the
// two apart preserves that property rather than giving routing.ts a hidden network dependency.

import { getPages, getBranding, getCtaBanner, getEnabledSections, getLocales } from '../lib/api'
import type { CmsConfig } from './config'
import { getEffectiveConfig } from './effectiveConfig'
import { buildStaticPaths } from './routing'

/** What `getStaticPaths` must return: one entry per route, params + props. */
export type SitePath = { params: { uri?: string }; props: Record<string, unknown> }

/**
 * Every route this site builds, across every locale the CMS has enabled.
 *
 * The locales come from the CMS, never from project config: they are per client, and the sitemap
 * publishes one file per enabled locale. Building fewer trees than the sitemap advertises is how
 * every non-default URL came to 404 (#559). Which of them is DEFAULT comes from the effective-config
 * seam (#1195 step 1), so it is the same answer every other consumer reads.
 *
 * `config` is the site's own `cmsConfig`: only `pageTypes` and `extraRoutes` are read, and both are
 * genuinely per-site (a registry of lazy component loaders, and the site's derived-route rules).
 * They are passed in rather than imported from `~site` here so this module stays callable with any
 * config — the catch-all route supplies its own.
 */
export async function getSitePaths(config: CmsConfig): Promise<SitePath[]> {
  const [locales, branding, enabledSections, effective] = await Promise.all([
    getLocales(),
    getBranding(),
    getEnabledSections(),
    getEffectiveConfig(),
  ])

  const { defaultLocale } = effective
  const codes = locales.length > 0 ? locales.map((l) => l.code) : [defaultLocale]

  const perLocale = await Promise.all(
    codes.map(async (locale) => {
      const [pages, cta] = await Promise.all([getPages(locale).catch(() => []), getCtaBanner(locale)])
      return buildStaticPaths(
        config.pageTypes ?? {},
        config.extraRoutes ?? [],
        pages,
        branding,
        cta,
        enabledSections,
        locale,
        defaultLocale,
      )
    }),
  )

  return perLocale.flat()
}
