/**
 * Normalize an internal href to the trailing slash the starter is configured for.
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
 * rather than after the fragment.
 */
export function href(value: string | null | undefined): string | undefined {
  if (typeof value !== 'string') return undefined
  const v = value.trim()
  if (!v) return undefined
  if (/^[a-z][a-z0-9+.-]*:/i.test(v) || v.startsWith('//')) return v
  if (v.startsWith('#')) return v
  if (v.endsWith('/')) return v

  const cut = v.search(/[?#]/)
  const path = cut === -1 ? v : v.slice(0, cut)
  const rest = cut === -1 ? '' : v.slice(cut)
  if (!path || path.endsWith('/')) return v
  if (/\.[a-z0-9]{2,5}$/i.test(path)) return v

  return `${path}/${rest}`
}
