// The one seam where CMS-owned values meet the repo's own `cms.config.ts` (dashboard #1195).
//
// The governing rule of that epic: the repo declares only what the backend cannot know - code and
// design decisions. Anything the CMS already stores is READ, not repeated. Four values used to be
// hand-written in every client's config and could silently disagree with the panel:
//
//   defaultLocale      <- GET /api/locales, the entry flagged `is_default`
//   seo.siteName       <- GET /api/site-settings, `site_name`
//   seo.defaultImage   <- GET /api/site-settings, `default_og_image`
//   seo.siteUrl        <- ASTRO_SITE_URL, then `frontend_url` (see core/site.ts)
//
// Every one keeps its `cms.config.ts` value as an explicit fallback, which is what an offline or
// mock build runs on (the fixtures answer /api/locales but leave the site-settings fields unset).
// So this is additive: a site that declares nothing new behaves exactly as it did.
//
// `menus` is here for a different reason - the CMS has no "which menu key does this site use"
// setting to read, so this only supplies the defaults ('header' / 'footer') that every site was
// writing out by hand anyway.
//
// One module, fetched once per build, rather than a fallback chain re-written at each call site:
// the whole point is that there is a single answer to "what is this site's default locale", and N
// copies of the precedence rule is how they stop agreeing.

import { cmsConfig } from '~site/cms.config'
import { getLocales, getSiteSettings, type LocaleApiItem, type SiteSettingsData } from '../lib/api'
import type { CmsConfig } from './config'
import { siteUrl } from './site'

export interface EffectiveConfig {
  /** The locale that routes at the site root, unprefixed. */
  defaultLocale: string
  seo: {
    /** og:site_name, or undefined to emit no such tag. */
    siteName: string | undefined
    /** Last-resort share image, or undefined when nothing resolved one. */
    defaultImage: string | undefined
    /** Absolute origin without a trailing slash, or null when nothing configured one. */
    siteUrl: string | null
  }
  menus: {
    header: string
    footer: string
  }
}

/** The subset of a site's config this seam reads. Exported so the tests assert against THIS
 *  declaration rather than a copy that would keep compiling after the seam started reading
 *  another field. */
export type ConfigInput = Pick<CmsConfig, 'defaultLocale' | 'menus' | 'seo'>

/**
 * Merge CMS data over a site's own config - pure, so the precedence rule can be tested without a
 * build or a network. `siteOrigin` arrives already resolved (core/site.ts owns that chain, which
 * has three candidates of its own rather than two).
 *
 * A null/absent CMS value is "the client has not set this", never "the client wants it empty", so
 * it falls through to the repo value. Neither siteName nor defaultImage gets a built-in default:
 * with nothing to say, <Seo> must omit og:site_name and og:image entirely rather than advertise a
 * placeholder - the starter's own name on a client's site would be worse than no tag at all.
 */
export function resolveEffectiveConfig(input: {
  locales: LocaleApiItem[]
  settings: SiteSettingsData
  siteOrigin: string | null
  config: ConfigInput
}): EffectiveConfig {
  const { locales, settings, siteOrigin, config } = input

  return {
    // The CMS decides which locale is default; the config value covers the mock build and any
    // payload where no entry carries the flag.
    defaultLocale: locales.find((l) => l.is_default)?.code ?? config.defaultLocale,
    seo: {
      siteName: settings.site_name ?? config.seo?.siteName,
      defaultImage: settings.default_og_image ?? config.seo?.defaultImage,
      siteUrl: siteOrigin,
    },
    menus: {
      header: config.menus?.header ?? 'header',
      footer: config.menus?.footer ?? 'footer',
    },
  }
}

// Memoized like getBranding/getSiteSettings: every route asks for this, so the two fetches behind
// it happen once per build. Evicted on rejection so one transient failure is not cached for the
// whole build - getLocales deliberately does NOT swallow its error (a build serving fewer locales
// than the sitemap advertises is the #559 failure), so a rejection here is a failed build by
// design, not a degraded one.
let memo: Promise<EffectiveConfig> | undefined

export function getEffectiveConfig(): Promise<EffectiveConfig> {
  memo ??= Promise.all([getLocales(), getSiteSettings(), siteUrl()]).then(([locales, settings, siteOrigin]) =>
    resolveEffectiveConfig({ locales, settings, siteOrigin, config: cmsConfig }),
  )
  memo.catch(() => {
    memo = undefined
  })
  return memo
}
