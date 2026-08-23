import type { Block, ResponsiveImageMeta } from '../types/blocks'
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
  // The page's DEFAULT-locale address, slash-wrapped (e.g. '/blog/my-post/'); null when it has
  // none there — including a page translated only into another locale. Never use it to decide
  // whether a page is routable in THIS locale: that is `pathForLocale()`, off `translations[]`.
  path?: string | null
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

const AUTH_HEADERS = { Authorization: `Bearer ${TOKEN}`, Accept: 'application/json' } as const

// The CMS now serves most image fields as a Spatie MediaLibrary object
// ({ url, original, width, height, alt, conversions, focal_point, ... }) instead of a plain URL
// string, while every block/template still consumes image fields as `string | null` (ImageBlock's
// `src`, CaseStudy's `cover`, BrandingData's `logo`, ...) — that mismatch is why `<img src>` was
// rendering "[object Object]" (e.g. diligently.pl's portfolio covers going missing).
export function isMediaObject(value: unknown): value is { url: string } & Record<string, unknown> {
  if (typeof value !== 'object' || value === null) return false
  const obj = value as Record<string, unknown>
  return typeof obj.url === 'string' && ('conversions' in obj || 'focal_point' in obj)
}

/**
 * The three responsive attributes carried by a media object, in the shape `responsiveImageAttrs`
 * (lib/image.ts) reads — the same shape an in-block `image` field's `<key>_meta` sibling has.
 */
function responsiveMetaOf(media: Record<string, unknown>): ResponsiveImageMeta | undefined {
  // Checked, not cast: the payload is untyped JSON, and a cast would let a stringly-typed width
  // through as a number — a wrong `<img width>` rather than an absent one.
  const num = (v: unknown): number | null => (typeof v === 'number' ? v : null)
  const meta = {
    width: num(media.width),
    height: num(media.height),
    srcset: typeof media.srcset === 'string' ? media.srcset : null,
  }

  // All three null is what an unmeasured, unconverted image looks like — a sibling saying only
  // "nothing is known" is noise on every payload, and `responsiveImageAttrs` emits nothing for it
  // anyway. Absent and all-null mean the same thing to the renderer, so prefer absent.
  return meta.width === null && meta.height === null && meta.srcset === null ? undefined : meta
}

/**
 * The `<key>_meta` sibling for a media-bearing property, or undefined when the value is not media.
 *
 * A page-level media field (a case study's `cover`, a post's `thumbnail`) arrives as the WHOLE
 * media object, `srcset`/`width`/`height` included, whereas a BLOCK's image arrives already flat
 * with those three in an explicit `<key>_meta` sibling (the CMS's BlockResolver). Flattening the
 * object to its URL therefore threw the responsive attributes away for page-level fields only —
 * so an `<img>` built from `cover` had no `srcset` to choose from and always fetched the full-size
 * variant, however many rungs the CMS had generated.
 *
 * Synthesising the sibling here rather than asking the API to send it as well: the payload already
 * carries these values inside the object, so a backend-built sibling would put the same `srcset`
 * string on the wire twice — and the object itself cannot be slimmed, because `keepRootKeys`
 * consumers (`<Seo>`, `Footer`) need the whole thing. Deriving it costs no release the frontend
 * was not already making, and covers payloads the CMS has already sent.
 *
 * Drift risk is low for a reason worth stating: the CMS's own `MediaUrls::responsiveMeta()` is
 * `Arr::only(MediaUrls::for($media), ['width','height','srcset'])` — it reads the same three keys
 * off the same serializer output this reads off the wire, so a change to how they are computed
 * reaches both. It would only diverge if the backend started COMPUTING something that is not in
 * the media object.
 *
 * Two deliberate divergences from the backend's block-side sibling:
 *   - a block's `_meta` is always an object with all three keys; this one is ABSENT when nothing
 *     was measured (see responsiveMetaOf);
 *   - a multi-media field yields an ARRAY, a shape no backend producer emits — `media_upload`
 *     takes ->first(), and a repeater recurses per row. A gallery has no other sensible shape,
 *     but a call site must index it.
 *
 * An explicit sibling the API DOES send always wins (see flattenMedia).
 */
function metaSiblingFor(value: unknown): ResponsiveImageMeta | (ResponsiveImageMeta | null)[] | undefined {
  if (isMediaObject(value)) return responsiveMetaOf(value)

  // Aligned BY INDEX — an unmeasured entry holds its place as null rather than shifting every
  // later image onto the wrong metadata. Mixed or media-free arrays get nothing at all.
  if (Array.isArray(value) && value.length > 0 && value.every(isMediaObject)) {
    const metas = value.map((m) => responsiveMetaOf(m) ?? null)
    return metas.some((m) => m !== null) ? metas : undefined
  }
  return undefined
}

/**
 * Unconditionally flatten every CMS media object found anywhere in `value` to its URL string,
 * preserving each one's responsive attributes as a `<key>_meta` sibling (see metaSiblingFor).
 */
export function flattenMedia(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(flattenMedia)
  if (isMediaObject(value)) return value.url
  if (typeof value !== 'object' || value === null) return value

  const source = value as Record<string, unknown>
  const out: Record<string, unknown> = {}
  for (const [key, child] of Object.entries(source)) {
    out[key] = flattenMedia(child)

    // Never overwrite a sibling the API sent itself: a block's `<key>_meta` is authoritative
    // (BlockResolver deliberately omits the media's own `alt` there, for one), and a key the CMS
    // already occupies is not ours to redefine. No current payload hits this — the CMS only writes
    // `_meta` beside a value it has ALREADY flattened to a URL — so it is here to make a future
    // backend-built page-level sibling a silent no-op rather than a conflict.
    //
    // A field literally named `foo_meta` whose value is itself media therefore yields
    // `foo_meta_meta`. Nothing reads it; it is dead weight, not a fault.
    const metaKey = `${key}_meta`
    if (metaKey in source) continue
    const meta = metaSiblingFor(child)
    if (meta !== undefined) out[metaKey] = meta
  }
  return out
}

/**
 * Flatten every CMS media object in a fetched response to its URL string — except `keepRootKeys`,
 * left exactly as the API sent them, for the rare caller that needs the object itself instead of
 * just its URL: every apiFetch/getPage caller keeps a page/case-study's own `seo` raw (`<Seo>`
 * needs `image.conversions.og`, the fixed 1200x630 JPG social crop, and its dimensions — not the
 * WebP "best variant" a flattened URL would hand it); getFooter additionally keeps `logo` raw
 * (Footer.astro reads both `.url` and `.alt` off it).
 *
 * `keepRootKeys` only ever matches a key at the ROOT of `data` (or of each item, when `data` is
 * a list) — never deeper. A recursive by-name match would also catch an admin-defined
 * `custom_fields` entry or a future block field that happens to be named `seo`/`logo`, silently
 * un-flattening a field nobody meant to exempt.
 */
export function normalizeApiData(data: unknown, keepRootKeys: ReadonlySet<string> = new Set()): unknown {
  const normalizeItem = (item: unknown): unknown => {
    if (typeof item !== 'object' || item === null || isMediaObject(item)) return flattenMedia(item)

    // Flatten the whole item through the ONE walk, then put the exempt keys back. Re-implementing
    // the object loop here to branch per key is what made a root-level `cover` skip the `_meta`
    // synthesis in flattenMedia's own loop — the two copies drifted the moment one gained a step.
    const source = item as Record<string, unknown>
    const out = flattenMedia(source) as Record<string, unknown>
    for (const key of keepRootKeys) {
      if (key in source) out[key] = source[key]
    }
    return out
  }
  return Array.isArray(data) ? data.map(normalizeItem) : normalizeItem(data)
}

const SEO_ROOT_KEY = new Set(['seo'])

/**
 * What `apiFetch` throws, carrying the HTTP status the message already spelled out.
 *
 * Needed the moment a response is memoized. A caller that answers `null` for BOTH "the CMS says
 * this is not configured" (404) and "the request failed" cannot cache: caching the first is
 * correct and caching the second pins one transient failure onto every page of the build. The
 * status is what separates them. Message format is unchanged, so anything reading it still reads
 * the same string.
 */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    path: string,
  ) {
    super(`API ${status}: ${path}`)
    this.name = 'ApiError'
  }
}

async function apiFetch(
  path: string,
  keepRootKeys: ReadonlySet<string> = SEO_ROOT_KEY,
): Promise<{ success: boolean; data: unknown }> {
  const res = await fetch(`${BASE}${path}`, { headers: AUTH_HEADERS })
  if (!res.ok) throw new ApiError(res.status, path)
  const json = (await res.json()) as { success: boolean; data: unknown }
  return { ...json, data: normalizeApiData(json.data, keepRootKeys) }
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
 * The default static build never calls this — it renders every live page from getPages(), and
 * gets its redirects from the whole-map endpoint instead (core/redirects.mjs, dashboard #1084).
 * This is the seam for per-path / SSR / hybrid consumers: `GET /api/pages/{path}` answers a
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

  const res = await fetch(`${BASE}/api/pages/${clean}?locale=${encodeURIComponent(locale)}`, { headers: AUTH_HEADERS })
  if (res.status === 404) return null

  // A moved path answers 301 with a JSON `{ redirect }` body and NO Location header — so
  // fetch does not auto-follow it. Read the body and honour the redirect explicitly rather
  // than letting the non-2xx status surface as a build error / 404.
  const json = (await res.json()) as { success: boolean; data?: PageApiItem; redirect?: string }
  if (typeof json.redirect === 'string') return { redirect: json.redirect }
  // Normalize the same way apiFetch does — getPage bypasses it for the redirect contract above.
  if (json.data) return { page: normalizeApiData(json.data, SEO_ROOT_KEY) as PageApiItem }
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
export function getMenu(key: string, locale?: string): Promise<MenuLink[] | null> {
  if (MOCK_MODE) return getMockMenu(key)

  const cacheKey = `${key}|${locale ?? ''}`
  let menu = menusByKey.get(cacheKey)
  if (!menu) {
    menu = fetchMenu(key, locale)
    menusByKey.set(cacheKey, menu)
    menu.catch(() => menusByKey.delete(cacheKey))
  }
  return menu
}

// Memoized per key+locale, the same way getPages is per locale, and for the same reason: a Navbar
// (or a Footer) is chrome, mounted by the layout on EVERY page, so an unmemoized fetch here is one
// request per built page — a cost that grows with the site while the answer never changes within a
// build. A rejected fetch is evicted so one transient failure isn't served to every later caller;
// a 404 is not a failure but the CMS's answer ("not configured"), so it resolves to null and is
// cached like any other result.
const menusByKey = new Map<string, Promise<MenuLink[] | null>>()

async function fetchMenu(key: string, locale?: string): Promise<MenuLink[] | null> {
  // Pass the locale through: a Page-target item's href is that page's public path for the
  // requested locale, prefix included (MenuApiController::pageHref). Omitting it renders the
  // default locale's URLs inside a translated page — links that leave the locale on click.
  const query = locale ? `?locale=${encodeURIComponent(locale)}` : ''
  const res = await fetch(`${BASE}/api/menus/${key}${query}`, { headers: AUTH_HEADERS })
  if (res.status === 404) return null
  if (!res.ok) throw new ApiError(res.status, `/api/menus/${key}`)
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

const FOOTER_ROOT_KEYS = new Set([...SEO_ROOT_KEY, 'logo'])

export function getFooter(locale = 'en'): Promise<FooterData | null> {
  if (MOCK_MODE) return getMockFooter(locale)

  let footer = footerByLocale.get(locale)
  if (!footer) {
    footer = fetchFooter(locale)
    footerByLocale.set(locale, footer)
    footer.catch(() => footerByLocale.delete(locale))
  }
  return footer
}

// Memoized per locale, like getMenu above and for the same reason — the footer is chrome, so it is
// fetched once per BUILD rather than once per page.
//
// This one used to swallow every error into `null`, which read as "no footer" and could not be
// cached: a build that hiccupped once would have pinned a footerless site. The 404 is separated out
// (that IS the answer — no footer component — and it caches), and anything else rejects, evicts,
// and reaches the renderer, which still self-gates. So the failure mode is unchanged for callers
// and no longer contagious.
const footerByLocale = new Map<string, Promise<FooterData | null>>()

async function fetchFooter(locale: string): Promise<FooterData | null> {
  try {
    // Keep `logo` raw: Footer.astro reads `.url` and `.alt` off it (FooterData.logo: SeoImage).
    const json = await apiFetch(`/api/components/footer?locale=${locale}`, FOOTER_ROOT_KEYS)
    return json.data as FooterData
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) return null
    throw error
  }
}

/** Site-wide settings (GET /api/site-settings). Only the fields the frontend consumes are typed
 *  here; `integrations` is provider => key => value of the build-embeddable third-party ids
 *  (e.g. `google_tag.container_id`, `ga4.measurement_id`), `cookie_consent` is the per-client
 *  consent switch (#521). `[key: string]` keeps the other server fields (contact details)
 *  accessible without retyping them.
 *
 *  `site_name`, `default_og_image` and `frontend_url` are the three the CMS owns and the repo
 *  used to repeat in `cmsConfig.seo` (dashboard #1195). They are typed rather than left to the
 *  index signature because core/effectiveConfig.ts resolves them: an index-signature read is
 *  `unknown` and a misspelled key would be a silent `undefined` falling through to the local
 *  fallback, which is exactly the drift this change removes. Every one is null when the client
 *  has not set it (see SiteSettingsController::show). */
export interface SiteSettingsData {
  /** `granular` opts into the Statistics/Marketing category banner (#1226) — every client
   *  defaults to a plain Accept/Reject choice; meaningless while `enabled` is false. */
  cookie_consent?: { enabled?: boolean; privacy_page_id?: number | null; granular?: boolean }
  integrations?: Record<string, Record<string, string>>
  /** The client's name, as og:site_name. */
  site_name?: string | null
  /** Site-wide Open Graph fallback image, already flattened to its URL by normalizeApiData. */
  default_og_image?: string | null
  /** The client's public site origin, as configured in the panel. */
  frontend_url?: string | null
  /** Whether search engines may index this site at all (dashboard #1169). False for a client
   *  that is not public yet - typically pre-cutover, live only on a provisional domain while
   *  its real domain still serves the old site.
   *
   *  Optional HERE but not on the wire: the backend always sends a boolean. It is optional
   *  because a build can legitimately see no value - an offline/mock build, a failed fetch, or
   *  a panel deployed before the field existed - and every one of those must resolve to
   *  VISIBLE. See resolveEffectiveConfig() for why that default is the opposite of the
   *  backend's. */
  search_visible?: boolean
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
 *  record exists (404); the renderer then falls back to built-in default copy.
 *
 *  The last eight fields are granular-mode-only (#1226): unused, and safe to leave unauthored,
 *  on a client whose `cookie_consent.granular` is false. */
export interface CookieConsentData {
  message?: string
  accept_label?: string
  reject_label?: string
  manage_label?: string
  component_type?: string
  customize_label?: string
  necessary_label?: string
  always_on_label?: string
  statistics_label?: string
  statistics_description?: string
  marketing_label?: string
  marketing_description?: string
  allow_selection_label?: string
}

export async function getCookieConsent(locale = 'en'): Promise<CookieConsentData | null> {
  if (MOCK_MODE) return getMockCookieConsent(locale)
  return apiFetch(`/api/components/cookie_consent?locale=${locale}`)
    .then((json) => json.data as CookieConsentData)
    .catch(() => null) // 404 (copy not authored) / offline → built-in defaults in the renderer
}
