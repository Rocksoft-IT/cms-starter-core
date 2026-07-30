import type { Block } from '../types/blocks'
import { MOCK_MODE } from '../core/mock'
import {
  getMockPages,
  getMockPage,
  getMockBranding,
  getMockMenu,
  getMockEnabledSections,
  getMockCtaBanner,
  getMockFooter,
  getMockLocales,
  getMockSiteSettings,
  getMockCookieConsent,
} from '~site/fixtures'

/** A resolved media item for social sharing, as serialized by the CMS's MediaUrls.for(). */
export interface SeoImage {
  /** The "best" variant the CMS picked — prefers WebP, which social scrapers decode
   *  unreliably, so `conversions.og` (a JPG) must win for og:image when present. */
  url: string
  original?: string | null
  /** Named conversions, each an object: `{ og: { url } }`. `og` is the fixed 1200×630 JPG
   *  social crop. A bare string is tolerated for hand-written fixtures/older payloads. */
  conversions?: Record<string, { url: string } | string> | null
  /** Dimensions of the ORIGINAL upload — NOT of the `og` crop (which is always 1200×630). */
  width?: number | null
  height?: number | null
  alt?: string | null
}

/** The `og` conversion's URL (the 1200×630 JPG), or null when it hasn't been generated. */
export function ogConversionUrl(image?: SeoImage | null): string | null {
  const og = image?.conversions?.og
  if (typeof og === 'string') return og
  if (og && typeof og.url === 'string') return og.url
  return null
}

/**
 * Derived Open Graph / social-share metadata for a page or item — a top-level, cross-cutting
 * object the API builds per response (sibling to `hreflang`, not merged into content fields).
 * Every field is resolved server-side (share-image fallback chain, canonical URL, site name),
 * so the frontend renders it verbatim without re-deriving anything. Optional end-to-end: absent
 * until the backend ships it (diligently-dashboard #469), and individual fields may be null —
 * the <Seo> component degrades gracefully to page.name / page.seo_description in that case.
 */
export interface PageSeo {
  title?: string | null // seo_title, falling back to the content's name (resolved server-side)
  description?: string | null // seo_description, or null
  image?: SeoImage | null // resolved share image (explicit → cover → client default → null)
  url?: string | null // canonical, current-locale absolute URL
  type?: 'article' | 'website' | string | null
  site_name?: string | null
  /** Per-page "exclude from search engines" toggle. Absent on an API that predates it, which
   *  reads as false — a page is only hidden when the CMS explicitly says so. */
  noindex?: boolean | null
}

export interface PageApiItem {
  id: number
  type: string
  // Structural role of the type (singleton | standalone | collection | item), emitted by
  // the API from Page::kind(). Drives routing so the frontend doesn't re-hardcode the taxonomy.
  kind?: string
  slug: string
  name: string
  path?: string | null // computed URL path, e.g. '/blog/my-post'; null for singletons
  collection?: string | null // parent collection type, e.g. 'blog' for posts; null for others
  seo_description?: string | null
  // Derived social-share metadata (og:*, canonical). Present once the backend ships #469;
  // the <Seo> renderer falls back to name/seo_description while it's absent.
  seo?: PageSeo | null
  hero_heading?: string | null
  hero_paragraph?: string | null
  /** The page's rich-text body (sanitized HTML) — posts and bare standalone pages keep their
   *  copy here, not in blocks; the default renderers show it below the blocks. */
  content?: string | null
  /** A collection item's publish date (raw ISO string, e.g. a post's) — format via
   *  core/format's formatDate, never verbatim. */
  date?: string | null
  /** Whether the CMS marked this page as "featured" (a blog post's star toggle). Absent on
   *  an API that predates it, which reads as false — a page is featured only when the CMS
   *  explicitly says so. The blog listing highlights featured items and sorts them first. */
  featured?: boolean | null
  blocks?: Block[]
  // Section-defined custom fields (diligently-dashboard #600/#601): extra fields a Super Admin
  // declares on a CMS section at runtime, shipped inline with their schema so the frontend can
  // render a field it did not know at build time. `label` and the translatable values (text,
  // list, a select's option label) arrive already resolved for the requested locale — no lookup
  // here. A `select` value is `{ key, label }`; the stable `key` is never shown to the user.
  // Rendered generically by core/CustomFields.astro; absent on an API that predates them.
  custom_fields?: Array<{
    key: string
    type: 'text' | 'select' | 'date' | 'list'
    label: string
    value: unknown
  }>
  translations?: Array<{ locale: string; slug: string | null; path: string; url?: string }>
  [key: string]: unknown
}

const BASE = import.meta.env.ASTRO_API_URL
const TOKEN = import.meta.env.ASTRO_API_TOKEN

async function apiFetch(path: string): Promise<{ success: boolean; data: unknown }> {
  const res = await fetch(`${BASE}${path}`, {
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      Accept: 'application/json',
    },
  })
  if (!res.ok) throw new Error(`API ${res.status}: ${path}`)
  return res.json() as Promise<{ success: boolean; data: unknown }>
}

// Memoize the page tree per locale: every static route (and Navbar) needs it, so fetch it
// once per build. A rejected fetch is evicted so one transient failure isn't cached for all
// callers (they .catch to [], which would otherwise silently empty the whole build).
const pagesByLocale = new Map<string, Promise<PageApiItem[]>>()

export function getPages(locale = 'en'): Promise<PageApiItem[]> {
  let pages = pagesByLocale.get(locale)
  if (!pages) {
    pages = MOCK_MODE
      ? getMockPages(locale)
      : apiFetch(`/api/pages?locale=${locale}`).then((json) => json.data as PageApiItem[])
    pagesByLocale.set(locale, pages)
    pages.catch(() => pagesByLocale.delete(locale))
  }
  return pages
}

/**
 * The outcome of resolving one URL path: the page, or the redirect a moved/renamed page
 * left behind. `null` (from getPage) means genuinely not found.
 */
export type PageResult = { page: PageApiItem } | { redirect: string }

/**
 * Resolve a single page by its URL path, honouring the CMS redirect contract.
 *
 * The default static build never calls this — it renders every live page from getPages().
 * It's the seam for per-path / SSR / hybrid consumers: `GET /api/pages/{path}` answers a
 * stale URL (a section slug renamed or re-parented, #327) with a **301 `{ redirect }`**
 * payload instead of a 404, so a migrated Webflow link keeps working. Discriminate the
 * result and, in SSR, forward it:
 *
 *   const r = await getPage(uri)
 *   if (r === null) return new Response(null, { status: 404 })
 *   if ('redirect' in r) return Astro.redirect(r.redirect, 301)
 *   // …render r.page
 */
export async function getPage(path: string, locale = 'en'): Promise<PageResult | null> {
  const clean = path.replace(/^\/+/, '')
  if (MOCK_MODE) return getMockPage(clean, locale)

  const res = await fetch(`${BASE}/api/pages/${clean}?locale=${encodeURIComponent(locale)}`, {
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      Accept: 'application/json',
    },
  })
  if (res.status === 404) return null

  // A moved path answers 301 with a JSON `{ redirect }` body and NO Location header — so
  // fetch does not auto-follow it. Read the body and honour the redirect explicitly rather
  // than letting the non-2xx status surface as a build error / 404.
  const json = (await res.json()) as { success: boolean; data?: PageApiItem; redirect?: string }
  if (typeof json.redirect === 'string') return { redirect: json.redirect }
  if (json.data) return { page: json.data }
  return null
}

export interface BrandingData {
  favicon: {
    '32': string | null
    '180': string | null
    '192': string | null
    '512': string | null
  } | null
  logo: string | null
  logo_dark: string | null
  // Optional header wordmark next to the logo (dashboard #837): line 1 (brand_name) + an
  // optional line 2 (brand_subtitle). When present the Navbar renders a real logo lockup;
  // null/absent → the logo image stands alone.
  brand_name?: string | null
  brand_subtitle?: string | null
  // Optional brand colors (e.g. per-client, from CMS settings). When present, Layout injects
  // each as the matching `--color-*` CSS var at build time, overriding the token default.
  primary_color?: string | null
  accent_color?: string | null
  secondary_color?: string | null
  text_primary_color?: string | null
  text_secondary_color?: string | null
  button_primary_color?: string | null
  button_primary_text_color?: string | null
  button_secondary_color?: string | null
  button_secondary_text_color?: string | null
  // Brand button border + fill style (dashboard PR #632). Layout emits the border colors as
  // `--color-button-*-border` and stamps `data-btn-{primary,secondary}="outline"` on <html>
  // when a button's brand style is outline; global.css switches the rendering on those.
  button_primary_border_color?: string | null
  button_secondary_border_color?: string | null
  button_primary_style?: 'solid' | 'outline' | null
  button_secondary_style?: 'solid' | 'outline' | null
}

// Memoize branding (fetched by every route's getStaticPaths). It resolves to a default on
// failure (never rejects), so caching the promise needs no eviction.
let brandingMemo: Promise<BrandingData> | undefined

export function getBranding(): Promise<BrandingData> {
  brandingMemo ??= MOCK_MODE
    ? getMockBranding()
    : apiFetch('/api/branding')
        .then((json) => json.data as BrandingData)
        .catch(() => ({ favicon: null, logo: null, logo_dark: null }))
  return brandingMemo
}

export interface MenuLink {
  label: string
  href: string | null
  target: 'page' | 'url' | 'group'
  children: MenuLink[]
}

/**
 * A menu, or `null` when it isn't configured. The API answers a missing menu with **404**
 * and an active one with **200** — even when it currently has no items (`data: []`). Callers
 * gate UI on activeness (`menu !== null`), which an empty-array-on-error contract couldn't
 * express, so this distinguishes "not configured" (null) from "active but empty" ([]).
 */
export async function getMenu(key: string, locale?: string): Promise<MenuLink[] | null> {
  if (MOCK_MODE) return getMockMenu(key)
  // Pass the locale through: a Page-target item's href is that page's public path for the
  // requested locale, prefix included (MenuApiController::pageHref). Omitting it renders the
  // default locale's URLs inside a translated page — links that leave the locale on click.
  const query = locale ? `?locale=${encodeURIComponent(locale)}` : ''
  const res = await fetch(`${BASE}/api/menus/${key}${query}`, {
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      Accept: 'application/json',
    },
  })
  if (res.status === 404) return null
  if (!res.ok) throw new Error(`API ${res.status}: /api/menus/${key}`)
  const json = (await res.json()) as { success: boolean; data: MenuLink[] }
  return json.data ?? []
}

export interface CtaBannerData {
  eyebrow?: string
  heading?: string
  body?: string
  cta_label?: string
  cta_href?: string
}

export async function getEnabledSections(): Promise<string[] | null> {
  if (MOCK_MODE) return getMockEnabledSections()
  return apiFetch('/api/sections')
    .then((json) => (json.data as { enabled: string[] }).enabled ?? null)
    .catch(() => null)
}

export interface LocaleApiItem {
  code: string
  name?: string
  native_name?: string
  flag?: string | null
  is_default?: boolean
}

/**
 * The content locales enabled for THIS client, in the client's own order.
 *
 * The build must read them from the CMS, not from project config: they are per client and
 * change without the frontend knowing, and the sitemap publishes one file per enabled locale.
 * A frontend working from a stale list builds fewer route trees than the sitemap advertises —
 * which is exactly the 404-publishing failure this endpoint exists to prevent.
 *
 * Deliberately NOT caught into a default-locale fallback: swallowing the error would ship a
 * green build serving only one locale while the sitemap still lists the rest. A failed fetch
 * must fail the build (the same rule the sitemap fetch script follows).
 */
export function getLocales(): Promise<LocaleApiItem[]> {
  localesMemo ??= MOCK_MODE ? getMockLocales() : apiFetch('/api/locales').then((json) => json.data as LocaleApiItem[])
  localesMemo.catch(() => {
    localesMemo = undefined
  })
  return localesMemo
}

let localesMemo: Promise<LocaleApiItem[]> | undefined

export async function getCtaBanner(locale = 'en'): Promise<CtaBannerData | null> {
  if (MOCK_MODE) return getMockCtaBanner(locale)
  return apiFetch(`/api/components/cta_default?locale=${locale}`)
    .then((json) => json.data as CtaBannerData)
    .catch(() => null)
}

/** One footer link. `column` is the heading the link sits under — the frontend groups rows by
 *  it (first-seen order), which is the explicit-column model that replaces the old "pair
 *  consecutive footer menu groups two-by-two" heuristic. */
export interface FooterLink {
  column?: string
  label?: string
  href?: string
}

/** The `footer` global component (GET /api/components/footer). `company_text` and `footer_links`
 *  are translatable (per-locale, resolved with default-locale fallback); social URLs and `logo`
 *  are shared across locales. `company_text` is sanitized HTML — render it through RichText. */
export interface FooterData {
  name?: string
  company_text?: string
  footer_links?: FooterLink[]
  facebook_url?: string
  linkedin_url?: string
  instagram_url?: string
  logo?: SeoImage | null
  component_type?: string
}

export async function getFooter(locale = 'en'): Promise<FooterData | null> {
  if (MOCK_MODE) return getMockFooter(locale)
  return apiFetch(`/api/components/footer?locale=${locale}`)
    .then((json) => json.data as FooterData)
    .catch(() => null) // 404 (no active footer) / offline → no footer; the renderer self-gates
}

/** Site-wide settings (GET /api/site-settings). Only the fields the frontend consumes are typed
 *  here; `integrations` is provider => key => value of the build-embeddable third-party ids
 *  (e.g. `google_tag.container_id`, `ga4.measurement_id`), `cookie_consent` is the per-client
 *  consent switch (#521). `[key: string]` keeps the other server fields (contact, og image)
 *  accessible without retyping them. */
export interface SiteSettingsData {
  cookie_consent?: { enabled?: boolean; privacy_page_id?: number | null }
  integrations?: Record<string, Record<string, string>>
  [key: string]: unknown
}

// Memoized like branding: every route + the consent components read it, so fetch once per build.
// Resolves to a safe "everything off" default on failure (never rejects), so no eviction is needed
// and a transient error can never accidentally ship analytics.
let siteSettingsMemo: Promise<SiteSettingsData> | undefined

export function getSiteSettings(): Promise<SiteSettingsData> {
  siteSettingsMemo ??= MOCK_MODE
    ? getMockSiteSettings()
    : apiFetch('/api/site-settings')
        .then((json) => json.data as SiteSettingsData)
        .catch(() => ({ cookie_consent: { enabled: false, privacy_page_id: null }, integrations: {} }))
  return siteSettingsMemo
}

/** The `cookie_consent` global component (GET /api/components/cookie_consent) — the banner's
 *  translatable copy, resolved per-locale with default-locale fallback. `null` when no active
 *  record exists (404); the renderer then falls back to built-in default copy. */
export interface CookieConsentData {
  message?: string
  accept_label?: string
  reject_label?: string
  manage_label?: string
  component_type?: string
}

export async function getCookieConsent(locale = 'en'): Promise<CookieConsentData | null> {
  if (MOCK_MODE) return getMockCookieConsent(locale)
  return apiFetch(`/api/components/cookie_consent?locale=${locale}`)
    .then((json) => json.data as CookieConsentData)
    .catch(() => null) // 404 (copy not authored) / offline → built-in defaults in the renderer
}
