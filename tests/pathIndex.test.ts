import { afterEach, describe, expect, it, vi } from 'vitest'

// The cross-locale index is BUILD-scoped: one object for every route of every locale tree. It is
// resolved through a memoized accessor rather than threaded as a prop, the same shape
// core/effectiveConfig.ts uses — see that file's docblock for why invariant data does not belong in
// a prop chain, and core/pathIndex.ts for what it costs a client repo (nothing).
vi.mock('../lib/api', () => ({ getPages: vi.fn() }))
vi.mock('./../core/effectiveConfig', () => ({ getEffectiveConfig: vi.fn() }))

const { getPages } = await import('../lib/api')
const { getEffectiveConfig } = await import('../core/effectiveConfig')
const { getPathIndex, hrefContextFor, resetPathIndex } = await import('../core/pathIndex')

const contact = () =>
  ({
    id: 1,
    type: 'page',
    slug: 'contact',
    name: 'contact',
    path: '/contact/',
    translations: [
      { locale: 'en', path: '/contact/' },
      { locale: 'pl', path: '/pl/kontakt/' },
    ],
  }) as never

afterEach(() => {
  resetPathIndex()
  vi.mocked(getPages).mockReset()
  vi.mocked(getEffectiveConfig).mockReset()
})

function stub(pages: unknown[], defaultLocale = 'en') {
  vi.mocked(getEffectiveConfig).mockResolvedValue({ defaultLocale } as never)
  vi.mocked(getPages).mockResolvedValue(pages as never)
}

describe('getPathIndex', () => {
  it('builds the index from the DEFAULT locale’s page list', async () => {
    stub([contact()])

    const { pathIndex, defaultLocale } = await getPathIndex()

    expect(defaultLocale).toBe('en')
    expect(pathIndex['/contact/']).toEqual({ en: '/contact/', pl: '/pl/kontakt/' })
    expect(getPages).toHaveBeenCalledWith('en')
  })

  it('fetches once per build however many components ask', async () => {
    stub([contact()])

    await Promise.all([getPathIndex(), getPathIndex(), hrefContextFor('pl')])

    expect(getPages).toHaveBeenCalledTimes(1)
  })

  it('degrades to an empty index when the page fetch fails, rather than failing the build', async () => {
    // With no index every href renders the literal an editor typed — precisely what shipped before
    // any of this existed. A link resolution is an improvement on that, so it must never be the
    // thing that breaks a build.
    vi.mocked(getEffectiveConfig).mockResolvedValue({ defaultLocale: 'en' } as never)
    vi.mocked(getPages).mockRejectedValue(new Error('502'))

    expect((await getPathIndex()).pathIndex).toEqual({})
    expect(await hrefContextFor('pl')).toBeUndefined()
  })

  it('honours a CMS-resolved default locale that disagrees with this repo', async () => {
    stub(
      [
        {
          id: 1,
          type: 'page',
          slug: 'kontakt',
          name: 'kontakt',
          path: '/kontakt/',
          translations: [
            { locale: 'pl', path: '/kontakt/' },
            { locale: 'en', path: '/en/contact/' },
          ],
        } as never,
      ],
      'pl',
    )

    const { pathIndex } = await getPathIndex()

    expect(getPages).toHaveBeenCalledWith('pl')
    expect(pathIndex['/kontakt/']).toEqual({ pl: '/kontakt/', en: '/en/contact/' })
  })
})

describe('hrefContextFor', () => {
  it('gives a translated tree the context it needs', async () => {
    stub([contact()])

    expect(await hrefContextFor('pl')).toEqual({
      locale: 'pl',
      defaultLocale: 'en',
      pathIndex: { '/contact/': { en: '/contact/', pl: '/pl/kontakt/' } },
    })
  })

  it('is undefined on the default tree — the literal already IS this locale’s address', async () => {
    stub([contact()])

    expect(await hrefContextFor('en')).toBeUndefined()
  })

  it('is undefined for a component rendered with no locale at all', async () => {
    stub([contact()])

    expect(await hrefContextFor(undefined)).toBeUndefined()
    // …and it did not even reach for the index to answer that.
    expect(getPages).not.toHaveBeenCalled()
  })

  it('is undefined when the index came up empty', async () => {
    stub([])

    expect(await hrefContextFor('pl')).toBeUndefined()
  })
})
