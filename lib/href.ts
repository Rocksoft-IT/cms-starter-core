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
 * rather than after the fragment, and so a locale-resolution lookup below matches on the path
 * alone.
 *
 * Locale resolution: an editor types an internal href as the DEFAULT locale's address (that's
 * the only address they see slugs for while editing a `custom_html`/CTA/nav field — the CMS has
 * no "pick a page" field for these, just free text), and it renders unchanged on every locale's
 * tree. On a non-default locale that is simply wrong: `/contact` on the Polish site links to the
 * ENGLISH contact page, not `/pl/kontakt/`. `ctx.pathIndex` (built by `buildPathIndex`, i18n.ts)
 * maps every page's default-locale path to its own path in each locale; when the normalized path
 * is a key in it, that page's `ctx.locale` address wins over the literal value. A path the index
 * doesn't know about — a derived route, a typo, a page dropped from the build — falls back to the
 * normalized literal, exactly like today: never worse than the pre-existing behaviour.
 */
export interface HrefLocaleContext {
  /** The locale this href is rendering for. */
  locale: string
  /** The locale that routes at the root, unprefixed — resolving against it is a no-op: the
   *  literal value an editor typed already IS that locale's own address. */
  defaultLocale: string
  /** Default-locale path (trailing-slash normalized) → { locale: that page's own path in it }.
   *  Built once per build by `buildPathIndex` and threaded down through `BlockRenderer`. */
  pathIndex?: Record<string, Record<string, string>>
}

function resolveLocalePath(normalizedPath: string, ctx?: HrefLocaleContext): string | undefined {
  if (!ctx?.pathIndex || !ctx.locale || ctx.locale === ctx.defaultLocale) return undefined
  return ctx.pathIndex[normalizedPath]?.[ctx.locale]
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

  const normalizedPath = path.endsWith('/') ? path : `${path}/`
  const localized = resolveLocalePath(normalizedPath, ctx)
  return `${localized ?? normalizedPath}${rest}`
}
