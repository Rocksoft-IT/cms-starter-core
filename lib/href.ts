/**
 * Normalize an internal href to the trailing slash the starter is configured for.
 *
 * `astro.config.mjs` ships with `trailingSlash: 'always'` — in this tree and in every client
 * generated from the template — so the dev server answers 404 for `/blog/some-post` and serves
 * only `/blog/some-post/`. The API is not consistent about it: a `section_teaser` item's `path`
 * arrives WITHOUT the slash, while a page's `translations[].path` arrives WITH one. Links built
 * from item paths therefore 404 in dev and depend on the production host being forgiving about it.
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
