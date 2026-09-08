import { describe, it, expect } from 'vitest'
import { href } from '../lib/href'

// The starter ships `trailingSlash: 'always'`, so an internal link without the slash 404s in dev.
// The API is inconsistent about it — a section_teaser item's `path` has no slash, a page's
// `translations[].path` does — which is what these cases pin down.
describe('href()', () => {
  it('adds the slash to an internal path that lacks one', () => {
    expect(href('/blog/some-post')).toBe('/blog/some-post/')
    expect(href('/about')).toBe('/about/')
  })

  it('leaves an already-normalized path alone', () => {
    expect(href('/blog/some-post/')).toBe('/blog/some-post/')
    expect(href('/')).toBe('/')
  })

  it('never rewrites another origin', () => {
    expect(href('https://ebok.example.pl')).toBe('https://ebok.example.pl')
    expect(href('mailto:office@example.pl')).toBe('mailto:office@example.pl')
    expect(href('tel:+48221234567')).toBe('tel:+48221234567')
    expect(href('//cdn.example.pl/asset')).toBe('//cdn.example.pl/asset')
  })

  it('puts the slash on the path, not after a fragment or query', () => {
    expect(href('/contact#office')).toBe('/contact/#office')
    expect(href('/search?q=roof')).toBe('/search/?q=roof')
    expect(href('#section')).toBe('#section')
  })

  it('leaves a real file alone', () => {
    expect(href('/sitemap.xml')).toBe('/sitemap.xml')
    expect(href('/files/regulamin.pdf')).toBe('/files/regulamin.pdf')
  })

  it('answers undefined for nothing to link to', () => {
    expect(href(null)).toBeUndefined()
    expect(href(undefined)).toBeUndefined()
    expect(href('   ')).toBeUndefined()
  })
})

// An editor typing an internal href only ever sees — and so only ever types — the DEFAULT locale's
// address: the panel has no "pick a page" control for these fields, just free text, and it shows
// that one address whichever locale's copy is being edited. Rendered unchanged on a translated
// tree the link answers 200 and drops the reader into another language, which is the silent half
// of dashboard #1454. `pathIndex` (buildPathIndex, core/i18n.ts) is what lets href() catch it.
describe('href() — locale resolution', () => {
  const pathIndex = {
    '/contact/': { en: '/contact/', pl: '/pl/kontakt/' },
    '/': { en: '/', pl: '/pl/' },
  }
  const pl = { locale: 'pl', defaultLocale: 'en', pathIndex }

  it('rewrites a known internal path to the current locale address', () => {
    expect(href('/contact', pl)).toBe('/pl/kontakt/')
  })

  it('rewrites a path that ALREADY carries its trailing slash', () => {
    // The common shape of an editor-typed href, and the case the pre-context implementation
    // short-circuited before it could ever be resolved.
    expect(href('/contact/', pl)).toBe('/pl/kontakt/')
  })

  it('keeps a fragment, moved onto the rewritten path', () => {
    expect(href('/contact#office', pl)).toBe('/pl/kontakt/#office')
  })

  it('keeps a query string, moved onto the rewritten path', () => {
    expect(href('/contact/?utm_source=nl', pl)).toBe('/pl/kontakt/?utm_source=nl')
  })

  it('resolves the site root the same way as any other page', () => {
    expect(href('/', pl)).toBe('/pl/')
  })

  it('normalizes an index value that arrived without its trailing slash', () => {
    // The CMS slash-wraps every address it emits (Page::assemblePath, #1133), so this is defence,
    // not repair — but returning a bare path here would hand the visitor the exact 404 under
    // `trailingSlash: 'always'` that this whole module exists to prevent.
    const bare = { '/about/': { pl: '/pl/o-nas' } }
    expect(href('/about', { locale: 'pl', defaultLocale: 'en', pathIndex: bare })).toBe('/pl/o-nas/')
  })

  it('is a no-op on the default locale itself', () => {
    expect(href('/contact', { locale: 'en', defaultLocale: 'en', pathIndex })).toBe('/contact/')
  })

  it('falls back to the normalized literal when the path is not in the index', () => {
    expect(href('/some-untracked-page', pl)).toBe('/some-untracked-page/')
  })

  it('falls back when the index knows the page but not this locale', () => {
    expect(href('/contact', { locale: 'de', defaultLocale: 'en', pathIndex })).toBe('/contact/')
  })

  it('ignores an empty index value rather than emitting a bare slash', () => {
    const empty = { '/contact/': { pl: '' } }
    expect(href('/contact', { locale: 'pl', defaultLocale: 'en', pathIndex: empty })).toBe('/contact/')
  })

  it('leaves external, mailto and fragment values alone even with a context', () => {
    expect(href('https://example.com/contact', pl)).toBe('https://example.com/contact')
    expect(href('mailto:hi@example.com', pl)).toBe('mailto:hi@example.com')
    expect(href('//cdn.example.com/x', pl)).toBe('//cdn.example.com/x')
    expect(href('#office', pl)).toBe('#office')
  })

  it('leaves a file-like path alone even when the index has a key for it', () => {
    const files = { '/brochure.pdf/': { pl: '/pl/broszura.pdf/' } }
    expect(href('/brochure.pdf', { locale: 'pl', defaultLocale: 'en', pathIndex: files })).toBe('/brochure.pdf')
  })

  it('behaves exactly like today when no context is given at all', () => {
    expect(href('/contact')).toBe('/contact/')
    expect(href('/contact/')).toBe('/contact/')
    expect(href('/contact/?a=1')).toBe('/contact/?a=1')
  })
})

// `href()` lost its opening `if (v.endsWith('/')) return v` in this change, and that early return
// was load-bearing for the OLD behaviour of every default-locale site in the fleet. Removing it was
// necessary — an already-slashed path is the common shape of an editor-typed href, so returning it
// untouched would skip resolution for exactly the values that need it — but "necessary" is not
// "harmless". So the claim that a context-free call is unchanged is machine-checked here against
// the previous implementation verbatim, rather than argued in a comment.
describe('href() — no-context behaviour is identical to the pre-locale implementation', () => {
  function previousImplementation(value: string | null | undefined): string | undefined {
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

  const corpus = [
    '/contact',
    '/contact/',
    '/',
    '/news/hello-world',
    '/news/hello-world/',
    '/contact#office',
    '/contact/#office',
    '/contact?utm=1',
    '/contact/?utm=1',
    '/contact/?utm=1#office',
    '#office',
    '#',
    'https://example.com',
    'https://example.com/a/b',
    'http://example.com/a/b/',
    'mailto:hi@example.com',
    'tel:+48123456789',
    '//cdn.example.com/x.png',
    '/sitemap.xml',
    '/files/spec-sheet.pdf',
    '/files/spec-sheet.pdf?v=2',
    '/brochure.pdf/',
    'relative/path',
    'relative/path/',
    '  /contact  ',
    '',
    '   ',
    null,
    undefined,
  ]

  for (const value of corpus) {
    it(`agrees on ${JSON.stringify(value)}`, () => {
      expect(href(value)).toBe(previousImplementation(value))
    })
  }
})
