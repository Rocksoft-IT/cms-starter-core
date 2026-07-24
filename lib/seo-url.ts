// Pure SEO URL derivation. Deliberately import-free: <Seo> and the e2e suite both consume it,
// and keeping it out of api.ts (which pulls in the fixtures/JSON chain) lets it be unit-tested
// under Playwright's plain Node loader — the same reason hreflangLinks lives in core/i18n.

/**
 * The canonical / og:url for a page. The API-resolved absolute `seoUrl` wins; else it is built
 * from the configured `origin` + this page's `path`; else the current build URL (`currentHref`).
 *
 * The derived branch must resolve to the URL Astro actually serves. `page.path` from the API
 * carries no trailing slash (`/news/hello-world`), but Astro's default `build.format: 'directory'`
 * emits `…/index.html`, served at `/news/hello-world/` — so a bare `origin + path` would advertise
 * a canonical one redirect away from the page it sits on, disagreeing with `Astro.url.href` inside
 * that same page's <head> (#18). Rather than assume the build format, mirror the shape of the page's
 * OWN served pathname (`currentPathname`, i.e. `Astro.url.pathname`): append a trailing slash to the
 * derived path only when the served pathname has one and the path doesn't. The root ('/') and a
 * no-slash build format already agree with `path`, so both are left untouched.
 */
export function canonicalUrl(opts: {
  seoUrl?: string | null
  origin?: string | null
  path?: string | null
  currentPathname: string
  currentHref: string
}): string {
  const { seoUrl, origin, path, currentPathname, currentHref } = opts
  if (seoUrl) return seoUrl
  if (origin && path != null) {
    const needsSlash = currentPathname.endsWith('/') && !path.endsWith('/')
    return `${origin}${needsSlash ? `${path}/` : path}`
  }
  return currentHref
}
