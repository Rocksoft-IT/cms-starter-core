/**
 * Normalize an internal href to the trailing slash the starter is configured for, and — when a
 * locale context is given — resolve it to the equivalent page's own address in that locale.
 *
 * `astro.config.mjs` ships with `trailingSlash: 'always'` — in this tree and in every client
 * generated from the template — so the dev server answers 404 for `/blog/some-post` and serves
 * only `/blog/some-post/`.
 *
 * The API used to be inconsistent about it — a `section_teaser` item's `path` arrived WITHOUT the
 * slash while a page's `translations[].path` arrived WITH one — so links built from item paths
 * 404'd in dev and depended on the production host being forgiving. Dashboard #1133 gave every
 * address one spelling (slash-wrapped), so this is now a defensive normalizer rather than a
 * required fixup: keep it, because a site on an older core pin, a hand-written href or a future
 * API field can still arrive without one.
 *
 * Left untouched:
 *  - absolute URLs and scheme-relative ones (`https:`, `mailto:`, `tel:`, `//cdn…`) — another
 *    origin owns its own URL shape;
 *  - bare fragments (`#section`);
 *  - anything that looks like a file (`/sitemap.xml`), which is a real path, not a route.
 *
 * A `#fragment` or `?query` is split off first, so the slash lands on the path where it belongs
 * rather than after the fragment, and so the locale lookup below matches on the path alone.
 *
 * ## Locale resolution
 *
 * An editor types an internal href as the DEFAULT locale's address. That is not a habit, it is the
 * only thing they can do: the panel has no "pick a page" control for a CTA/menu/`custom_html` href
 * — just free text — and the address it shows them is the default locale's whichever locale's copy
 * they are editing. Rendered unchanged on a non-default tree the literal value is simply wrong:
 * a CTA meaning "go to the contact page" links to `/contact/` (the English page) from the Polish
 * site instead of `/pl/kontakt/`. It answers 200, so nothing fails — the reader is just quietly
 * dropped into another language, which is the same silent failure as dashboard #1454.
 *
 * `ctx.pathIndex` (built by `buildPathIndex`, core/i18n.ts) maps every page's default-locale path
 * to its own path per locale; when the normalized path is a key in it, that page's `ctx.locale`
 * address wins. Everything else falls back to the normalized literal, exactly as before — an
 * unknown path, a derived route, a typo, a page dropped from the build, `locale === defaultLocale`,
 * or no `ctx` at all. Never worse than not having the index.
 *
 * ONLY EDITOR-TYPED HREFS GET A CONTEXT. An address the API already resolved for this locale — a
 * `section_teaser` item's `path`, which `PagePayload::resolveTeaserItem()` resolves server-side for
 * the requested locale (#1454) — must be rendered as given. Handing one to this resolver asks a
 * default-locale-keyed index about a value that is already localized: a miss today, and a
 * mis-resolution the day some locale's address collides with another page's default-locale one.
 * `tests/href-call-sites.test.ts` pins which call sites pass a context and which deliberately do not.
 */

/** Default-locale path (trailing-slash normalized) → that page's own path per locale. */
export type PathIndex = Record<string, Record<string, string>>

export interface HrefLocaleContext {
  /** The locale this href is rendering for. */
  locale: string
  /** The locale that routes at the root, unprefixed — resolving against it is a no-op: the
   *  literal value an editor typed already IS that locale's own address. */
  defaultLocale: string
  /** Built once per build by `buildPathIndex` and threaded down through `BlockRenderer`. */
  pathIndex?: PathIndex
}

/**
 * `/contact` → `/contact/`; `/contact/` unchanged. The one spelling every address here uses.
 *
 * Exported because `buildPathIndex` (core/i18n.ts) has to key and value its index in exactly the
 * shape `href()` normalizes an editor's literal to. Two copies of this rule would look harmless and
 * fail silently the day they diverged: the index would still build, `href()` would still run, and
 * every lookup would simply stop matching.
 */
export function withTrailingSlash(path: string): string {
  return path.endsWith('/') ? path : `${path}/`
}

/**
 * This page's own address for `normalizedPath`, or undefined to keep the literal.
 *
 * The result is re-normalized rather than trusted: the index is built from `translations[].path`,
 * which the CMS slash-wraps today (`Page::assemblePath()`) but which this module's whole reason for
 * existing is not assuming — an older core pin, a fixture or a hand-built index can still hand a
 * bare path, and returning it would drop the visitor on the 404 this function exists to prevent.
 */
export function canResolve(ctx?: HrefLocaleContext): ctx is HrefLocaleContext {
  return Boolean(ctx?.pathIndex) && Boolean(ctx?.locale) && ctx!.locale !== ctx!.defaultLocale
}

function resolveLocalePath(normalizedPath: string, ctx?: HrefLocaleContext): string | undefined {
  if (!canResolve(ctx)) return undefined

  const localized = ctx.pathIndex![normalizedPath]?.[ctx.locale]

  return typeof localized === 'string' && localized !== '' ? withTrailingSlash(localized) : undefined
}

export function href(value: string | null | undefined, ctx?: HrefLocaleContext): string | undefined {
  if (typeof value !== 'string') return undefined
  const v = value.trim()
  if (!v) return undefined
  if (/^[a-z][a-z0-9+.-]*:/i.test(v) || v.startsWith('//')) return v
  if (v.startsWith('#')) return v

  const cut = v.search(/[?#]/)
  const path = cut === -1 ? v : v.slice(0, cut)
  const rest = cut === -1 ? '' : v.slice(cut)
  if (!path) return v
  if (/\.[a-z0-9]{2,5}$/i.test(path)) return v

  // The early `if (v.endsWith('/')) return v` this used to open with is deliberately gone: an
  // already-slashed path is the COMMON shape of an editor-typed href, so returning it untouched
  // would skip locale resolution for exactly the values that need it most. With no `ctx` the two
  // are indistinguishable — normalizing an already-normalized path is the identity.
  const normalizedPath = withTrailingSlash(path)

  return `${resolveLocalePath(normalizedPath, ctx) ?? normalizedPath}${rest}`
}
