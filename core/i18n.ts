import { cmsConfig } from '~site/cms.config'
import type { PageApiItem } from '../lib/api'

/**
 * The default locale as this REPO declares it - the offline/local value only.
 *
 * Prefer the resolved one wherever it is available: the CMS decides which locale routes at the
 * root (`is_default` on GET /api/locales), and core/effectiveConfig.ts is where the two are
 * reconciled. This constant is what that resolution falls back to, and it stays a plain
 * synchronous export on purpose - it is read by modules that cannot await (and by every caller
 * that has no resolved value to hand), so making it async would push a network dependency into
 * module evaluation across the package.
 *
 * The three functions below therefore take the resolved locale as an optional parameter,
 * defaulting to this value: a caller that knows better says so, and one that does not keeps
 * today's behaviour.
 */
export const defaultLocale: string = cmsConfig.defaultLocale

/**
 * The URL path a page has in one locale, or null when it has no address there.
 *
 * Read from the API's `translations[]` rather than re-derived from `path` + a prefix. The CMS
 * assembles that value with `Page::assemblePath()` — the single source of truth for URL shape
 * (dashboard #541) — and the sitemap publishes exactly it. Re-deriving here would be a second
 * implementation of the same rule, and the first byte it disagreed on (a trailing slash, a
 * section prefix) would be a 404 that the sitemap actively advertises to crawlers.
 *
 * `translations[]` covers EVERY enabled locale, translated or not: an untranslated page still
 * has an address in that locale, built from the default-locale slug (dashboard SitemapApiTest
 * pins `/pl/about/` for a page with no Polish slug). Content falls back per field, so it
 * renders; a missing translation is a data problem the panel surfaces, not a missing route.
 *
 * The fallback to `path`/`slug` covers the single-locale case and mock fixtures written before
 * `translations[]` existed — in the default locale those are the same string.
 *
 * `fallbackLocale` is the locale that routes unprefixed, and it must be the CMS-resolved one
 * wherever the caller has it (see core/effectiveConfig.ts). It is a parameter rather than a read
 * of the module constant because `buildStaticPaths` already knows the resolved value and had no
 * way to say so: with a panel whose default locale disagreed with `cms.config.ts`, this decided
 * "has no address here" against the wrong locale and dropped pages from the build.
 */
export function pathForLocale(page: PageApiItem, locale: string, fallbackLocale: string = defaultLocale): string | null {
  const entry = page.translations?.find((t) => t.locale === locale)
  if (entry) return entry.path ?? null

  if (locale !== fallbackLocale) return null

  return (page.path as string | null) ?? (page.slug ? `/${page.slug}/` : null)
}

export interface HreflangLink {
  hreflang: string
  href: string
}

/**
 * The `<link rel="alternate" hreflang>` set for a page: one entry per locale that has an
 * address, plus `x-default` pointing at the default locale's.
 *
 * hreflang requires ABSOLUTE urls — a relative href is silently ignored by crawlers, which is
 * worse than emitting nothing, because the page then looks like it declared its alternates and
 * they were all invalid. So when neither the API (`url`, present only once the client has a
 * frontend_url) nor a configured origin can produce one, this returns [] and the caller emits
 * no block at all rather than a broken one.
 *
 * The set must also be reciprocal — every locale's page lists every locale, itself included.
 * A one-way alternate is ignored by Google, so a page that listed only the *other* locales
 * would advertise a relationship none of them confirm.
 */
export function hreflangLinks(
  translations: PageApiItem['translations'],
  origin: string | null,
  fallbackLocale: string = defaultLocale,
): HreflangLink[] {
  const absolute = (t: { path: string | null; url?: string }): string | null =>
    t.url ?? (origin && t.path ? `${origin}${t.path}` : null)

  const links: HreflangLink[] = []
  let xDefault: string | null = null

  for (const t of translations ?? []) {
    const href = absolute(t)
    if (!href) continue

    links.push({ hreflang: t.locale, href })
    if (t.locale === fallbackLocale) xDefault = href
  }

  // x-default names the page a crawler should serve when no declared locale matches the user.
  // Only meaningful alongside real alternates, hence the length check rather than emitting it
  // for a single-locale site.
  if (xDefault && links.length > 1) links.push({ hreflang: 'x-default', href: xDefault })

  return links
}

/** `''` for the default locale, `'/xx'` for any other — matching `Page::assemblePath()`. */
export function localePrefix(locale: string, fallbackLocale: string = defaultLocale): string {
  return locale === fallbackLocale ? '' : `/${locale}`
}

/**
 * A URL path as Astro's rest-route param: no leading slash, and `undefined` (never `''`) for
 * the site root — `[...uri]` matches `/` only when the param is undefined.
 */
export function uriFromPath(path: string | null | undefined): string | undefined {
  if (path == null) return undefined
  return path.replace(/^\//, '') || undefined
}
