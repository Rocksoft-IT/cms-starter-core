import { describe, expect, test } from 'vitest'
import { hreflangLinks } from '../core/i18n'
import { canonicalUrl } from '../lib/seo-url'

// Unit tests for the two pure <head>-signal helpers. They live HERE, in the package, rather than in
// the starter's tests/e2e/: the mirror drops this directory before a client repo ever sees it, and a
// client's Playwright run could not load these modules anyway — core is Vite-only, so importing a
// core subpath from plain Node fails on the unresolvable `~site` alias and on Node refusing to strip
// types from .ts under node_modules.
//
// The rendered-output half of the same contract stays in tests/e2e/head-signals.spec.ts, which
// asserts what the browser actually receives. These assert the functions in isolation, against
// hand-written expected values.

const ORIGIN = 'https://example.test'

describe('hreflang construction', () => {
  const translations = [
    { locale: 'en', slug: 'about', path: '/about/' },
    { locale: 'pl', slug: 'o-nas', path: '/pl/o-nas/' },
  ]

  test('builds one absolute link per locale plus x-default', () => {
    expect(hreflangLinks(translations, ORIGIN, 'en')).toEqual([
      { hreflang: 'en', href: 'https://example.test/about/' },
      { hreflang: 'pl', href: 'https://example.test/pl/o-nas/' },
      { hreflang: 'x-default', href: 'https://example.test/about/' },
    ])
  })

  test("prefers the API's own absolute url over one built from the origin", () => {
    // `url` is emitted once the client has a frontend_url, and it is the address the SITEMAP
    // publishes — so where the two could disagree, the API wins.
    const withUrl = [{ locale: 'en', slug: 'about', path: '/about/', url: 'https://real.example/about/' }]
    expect(hreflangLinks(withUrl, ORIGIN, 'en')[0].href).toBe('https://real.example/about/')
  })

  test('emits NOTHING when no absolute url can be resolved', () => {
    // Relative hrefs are silently ignored by crawlers — worse than an absent block, because the
    // page looks like it declared alternates and they were all invalid.
    expect(hreflangLinks(translations, null, 'en')).toEqual([])
  })

  test('omits x-default for a single-locale site', () => {
    expect(hreflangLinks([translations[0]], ORIGIN, 'en')).toEqual([
      { hreflang: 'en', href: 'https://example.test/about/' },
    ])
  })

  test('skips a locale the page has no address in', () => {
    const partial = [translations[0], { locale: 'pl', slug: null, path: null as unknown as string }]
    expect(hreflangLinks(partial, ORIGIN, 'en').map((l) => l.hreflang)).toEqual(['en'])
  })
})

// Canonical derivation (#18). The bug lives only in the FALLBACK branch — the one a project uses
// before its backend resolves `seo.url` — where `origin + page.path` was emitted verbatim. The
// API's `path` has no trailing slash, but Astro's default directory build serves one, so the
// canonical advertised a URL one redirect away from the page it sat in. These assert the derived
// canonical mirrors the shape of the page's own served pathname instead of assuming a format.
describe('canonical URL derivation', () => {
  test("the API's resolved url always wins, untouched", () => {
    expect(
      canonicalUrl({
        seoUrl: 'https://real.example/x',
        origin: ORIGIN,
        path: '/x',
        currentPathname: '/x/',
        currentHref: 'https://example.test/x/',
      }),
    ).toBe('https://real.example/x')
  })

  test('a directory build (trailing slash served) gets a trailing-slash canonical', () => {
    // page.path from the API has no trailing slash; the page is served at `…/hello-world/`.
    expect(
      canonicalUrl({
        seoUrl: null,
        origin: ORIGIN,
        path: '/news/hello-world',
        currentPathname: '/news/hello-world/',
        currentHref: 'unused',
      }),
    ).toBe('https://example.test/news/hello-world/')
  })

  test('a file build (no slash served) leaves the derived path bare', () => {
    expect(
      canonicalUrl({
        seoUrl: null,
        origin: ORIGIN,
        path: '/impressum',
        currentPathname: '/impressum',
        currentHref: 'unused',
      }),
    ).toBe('https://example.test/impressum')
  })

  test('never double-slashes a path that already ends in one', () => {
    expect(
      canonicalUrl({
        seoUrl: null,
        origin: ORIGIN,
        path: '/about/',
        currentPathname: '/about/',
        currentHref: 'unused',
      }),
    ).toBe('https://example.test/about/')
  })

  test('the root is unchanged', () => {
    expect(canonicalUrl({ seoUrl: null, origin: ORIGIN, path: '/', currentPathname: '/', currentHref: 'unused' })).toBe(
      'https://example.test/',
    )
  })

  test('falls back to the current build URL when no origin is configured', () => {
    expect(
      canonicalUrl({
        seoUrl: null,
        origin: null,
        path: '/x',
        currentPathname: '/x/',
        currentHref: 'https://example.test/x/',
      }),
    ).toBe('https://example.test/x/')
  })
})
