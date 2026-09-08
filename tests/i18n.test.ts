import { describe, expect, test } from 'vitest'
import { buildPathIndex, defaultLocale, pathForLocale } from '../core/i18n'
import type { PageApiItem } from '../lib/api'

// pathForLocale decides whether a page has an address in a given locale. The question it has to
// answer for a page with no `translations[]` entry is "is this the locale that routes unprefixed?"
// - and until #1195 it could only ask that of the value in THIS REPO's cms.config.ts, while the
// CMS is what actually decides (is_default on GET /api/locales). buildStaticPaths already had the
// resolved value and no way to pass it, so on a client whose panel disagreed with its config the
// answer was wrong and pages were dropped from the build.
//
// The starter's own cms.config.ts declares 'en', which is what the module constant reads; every
// case below that says "the CMS resolved something else" uses 'pl' to make the disagreement real.

function page(overrides: Partial<PageApiItem> = {}): PageApiItem {
  return { id: 1, type: 'page', slug: 'about', name: 'About', ...overrides } as PageApiItem
}

describe('fixture guard', () => {
  test("this repo's declared default locale is 'en'", () => {
    // Every disagreement case below is meaningless if this ever changes, so pin it.
    expect(defaultLocale).toBe('en')
  })
})

describe('pathForLocale - translations[] entry', () => {
  test('returns the address the CMS assembled for that locale', () => {
    const p = page({ translations: [{ locale: 'pl', slug: 'o-nas', path: '/pl/o-nas/' }] })
    expect(pathForLocale(p, 'pl')).toBe('/pl/o-nas/')
  })

  test('an entry always wins, whatever the fallback locale is', () => {
    // The entry is the CMS's own answer; the fallback question is only for pages without one.
    const p = page({ translations: [{ locale: 'pl', slug: 'o-nas', path: '/pl/o-nas/' }] })
    expect(pathForLocale(p, 'pl', 'en')).toBe('/pl/o-nas/')
    expect(pathForLocale(p, 'pl', 'pl')).toBe('/pl/o-nas/')
  })
})

describe('pathForLocale - no translations[] entry', () => {
  test('the CMS-resolved default locale gets the page/slug fallback', () => {
    // THE BUG THIS FIXES. The panel says Polish routes at the root; this repo's config still says
    // 'en'. Without the third argument the check reads the config, decides 'pl' is a prefixed
    // locale, and returns null - dropping the page from the build it belongs in.
    expect(pathForLocale(page({ path: '/o-nas/' }), 'pl', 'pl')).toBe('/o-nas/')
  })

  test('a locale that is NOT the root locale still has no address', () => {
    expect(pathForLocale(page({ path: '/about/' }), 'pl', 'en')).toBeNull()
  })

  test("falls back to this repo's declared value when no fallback locale is passed", () => {
    // Back-compat: an existing caller that passes two arguments keeps today's behaviour exactly.
    expect(pathForLocale(page({ path: '/about/' }), 'en')).toBe('/about/')
    expect(pathForLocale(page({ path: '/about/' }), 'pl')).toBeNull()
  })

  test('derives an address from the slug when the page carries no path', () => {
    expect(pathForLocale(page({ path: null }), 'pl', 'pl')).toBe('/about/')
  })

  test('a page with neither path nor slug has no address at all', () => {
    // The home singleton in the default locale: it routes at the site root, which uriFromPath
    // expresses as `undefined` rather than a path.
    expect(pathForLocale(page({ path: null, slug: '' }), 'pl', 'pl')).toBeNull()
  })
})

// buildPathIndex is what lets href() (lib/href.ts) turn an editor's hand-typed, default-locale href
// into the CURRENT locale's own address for that page — see that module for why the default
// locale's is the only address an editor ever types, whatever locale they are editing.
describe('buildPathIndex', () => {
  test('keys by the default-locale path, values are every locale that page has an address for', () => {
    const contact = page({
      slug: 'contact',
      path: '/contact/',
      translations: [
        { locale: 'en', slug: 'contact', path: '/contact/' },
        { locale: 'pl', slug: 'kontakt', path: '/pl/kontakt/' },
      ],
    })
    expect(buildPathIndex([contact], 'en')['/contact/']).toEqual({ en: '/contact/', pl: '/pl/kontakt/' })
  })

  test('normalizes the default-locale KEY to a trailing slash even if the source lacked one', () => {
    // The key has to match what href() normalized an editor's literal to, or nothing ever hits.
    const p = page({ translations: [{ locale: 'en', slug: 'about', path: '/about' }] })
    expect(Object.keys(buildPathIndex([p], 'en'))).toEqual(['/about/'])
  })

  test('normalizes each locale VALUE too, so a hit is an address the site actually serves', () => {
    // Under `trailingSlash: 'always'` a bare path is a 404 — a resolved link must not be worse
    // shaped than the literal it replaced.
    const p = page({
      path: '/about/',
      translations: [
        { locale: 'en', slug: 'about', path: '/about' },
        { locale: 'pl', slug: 'o-nas', path: '/pl/o-nas' },
      ],
    })
    expect(buildPathIndex([p], 'en')['/about/']).toEqual({ en: '/about/', pl: '/pl/o-nas/' })
  })

  test('falls back to page/slug for the default-locale path, same rule as pathForLocale', () => {
    const p = page({ path: '/about/', translations: [{ locale: 'pl', slug: 'o-nas', path: '/pl/o-nas/' }] })
    expect(buildPathIndex([p], 'en')['/about/']).toEqual({ pl: '/pl/o-nas/' })
  })

  test('honours a CMS-resolved default locale that disagrees with this repo, like pathForLocale', () => {
    const p = page({
      path: '/about/',
      translations: [
        { locale: 'en', slug: 'about', path: '/en/about/' },
        { locale: 'pl', slug: 'o-nas', path: '/o-nas/' },
      ],
    })
    // With 'pl' routing at the root, the key is the Polish address — not this repo's 'en' one.
    expect(buildPathIndex([p], 'pl')['/o-nas/']).toEqual({ en: '/en/about/', pl: '/o-nas/' })
  })

  test('skips a page with no resolvable default-locale address', () => {
    const p = page({ path: null, slug: '', translations: [{ locale: 'pl', slug: 'x', path: '/pl/x/' }] })
    expect(buildPathIndex([p], 'en')).toEqual({})
  })

  test('skips a page with no translations at all rather than indexing an empty locale map', () => {
    expect(buildPathIndex([page({ path: '/about/', translations: [] })], 'en')).toEqual({})
  })

  test('skips a translations row carrying no path of its own', () => {
    const p = page({
      path: '/about/',
      translations: [
        { locale: 'pl', slug: 'o-nas', path: null },
        { locale: 'de', slug: 'ueber-uns', path: '/de/ueber-uns/' },
      ],
    } as Partial<PageApiItem>)
    expect(buildPathIndex([p], 'en')['/about/']).toEqual({ de: '/de/ueber-uns/' })
  })
})
