import { describe, it, expect, vi, afterEach } from 'vitest'
import { sectionKeyOf } from '../core/routing'
import type { PageApiItem } from '../lib/api'

// A landing lists the pages whose `collection` equals its KEY, and the key is not its slug.
// `Page::sectionKeyOf()` in the CMS resolves it three ways — a config landing (blog/portfolio/
// glossary) by its own type, the canonical landing of a landing-less item type by that ITEM type
// (`service` at slug `services`, dashboard #522), any other data-driven `section` by its
// default-locale slug — so the slug agrees only in the last case, and in the first only while
// nobody has renamed the landing. Reading the slug is what left a renamed Blog landing building,
// answering 200, and listing nothing (dashboard #2061).
const landing = (over: Partial<PageApiItem>): PageApiItem =>
  ({ id: 1, type: 'section', slug: 'news', name: 'News', ...over }) as unknown as PageApiItem

afterEach(() => vi.restoreAllMocks())

describe('sectionKeyOf()', () => {
  it('takes the key the CMS states, whatever the slug is', () => {
    // What the payload carries for a config landing an editor moved to /insights/: the address
    // changed, its posts' `collection` did not — it is the config constant `blog`.
    const page = landing({
      type: 'blog',
      slug: 'insights',
      section_key: 'blog',
      translations: [{ locale: 'en', slug: 'insights', path: '/insights/' }],
    })

    expect(sectionKeyOf(page, 'en')).toBe('blog')
  })

  it('states the item type for the canonical landing of a landing-less type', () => {
    // The one case the slug can never recover: key `service`, slug `services` (#522). Only the
    // API knows it, which is why the field exists rather than a fourth branch below.
    const page = landing({
      slug: 'services',
      section_key: 'service',
      translations: [{ locale: 'en', slug: 'services', path: '/services/' }],
    })

    expect(sectionKeyOf(page, 'en')).toBe('service')
  })

  it('falls back to the type for a config landing on an API without the field', () => {
    const page = landing({
      type: 'portfolio',
      slug: 'realizacje',
      translations: [{ locale: 'en', slug: 'realizacje', path: '/realizacje/' }],
    })

    expect(sectionKeyOf(page, 'en')).toBe('portfolio')
  })

  it('falls back to the DEFAULT-locale slug for a data-driven section, and says that it did', async () => {
    // `page.slug` is this locale's; the items' `collection` is the default locale's. Comparing the
    // two directly listed nothing on /pl/ (#559), so the fallback reads `translations[]`.
    //
    // A FRESH module, because "warns once" is per-process state: asserting a call count against the
    // shared instance would pass only while this stays the first test in the file to derive a key,
    // and would then fail as if `sectionKeyOf` were broken rather than the order.
    vi.resetModules()
    const { sectionKeyOf: freshSectionKeyOf } = await import('../core/routing')
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})

    const page = landing({
      slug: 'aktualnosci',
      translations: [
        { locale: 'en', slug: 'news', path: '/news/' },
        { locale: 'pl', slug: 'aktualnosci', path: '/pl/aktualnosci/' },
      ],
    })

    expect(freshSectionKeyOf(page, 'en')).toBe('news')

    // Right here, wrong for the `services` landing next to it — and the caller cannot tell the two
    // apart. So the derivation reports itself, rather than leaving a build to ship an empty listing
    // with nothing in the log. Once, not once per landing: the second call adds no line.
    expect(warn).toHaveBeenCalledTimes(1)
    expect(warn.mock.calls[0]![0]).toContain('section_key')

    expect(freshSectionKeyOf(page, 'en')).toBe('news')
    expect(warn).toHaveBeenCalledTimes(1)
  })

  it('answers null rather than an empty key when there is nothing to match on', () => {
    // The CMS stores '' for a landing whose key it could not resolve, and such a landing gates off
    // rather than matching. A caller must not compare items against it: every non-item page carries
    // `collection: null`, so an empty/nullish key that reached the comparison would list the home
    // page and every standalone page as this section's items.
    const page = landing({ slug: '', section_key: '', translations: [] })

    expect(sectionKeyOf(page, 'en')).toBeNull()
  })

  it('takes a null the CMS sent as a decision, not as an API too old to answer', () => {
    // The two are one value apart and mean opposite things. `PageApiController` normalizes an
    // unresolvable key to null, so a landing the CMS deliberately keys with NOTHING arrives looking
    // exactly like a row from before the field existed. Reading the value alone derived a key for it
    // anyway — this locale's slug — and logged that the API was too old, which was false on both
    // counts. Presence of the field is what decides; only its absence reaches the derivation.
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})

    const page = landing({
      slug: 'aktualnosci',
      section_key: null,
      translations: [{ locale: 'en', slug: 'news', path: '/news/' }],
    })

    expect(sectionKeyOf(page, 'en')).toBeNull()
    expect(warn).not.toHaveBeenCalled()
  })
})
