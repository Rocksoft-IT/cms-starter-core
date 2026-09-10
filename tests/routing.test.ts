import { describe, it, expect, vi, afterEach } from 'vitest'
import { buildStaticPaths, CATEGORY_ARCHIVE_PAGE_TYPE, type PageTypeConfig } from '../core/routing'
import type { ArchiveApiItem, PageApiItem } from '../lib/api'

// Dashboard #1066: the CMS let a `page` and a `section` landing hold the same slug, so both
// resolved to one `uri`. Astro emits one output file for that route and drops the other page
// without a word — a build that still reports success while a page has vanished from the site.
const pageTypes: Record<string, PageTypeConfig> = {
  page: { component: async () => ({}) },
  section: { component: async () => ({}) },
}

const page = (id: number, type: string, slug: string): PageApiItem =>
  ({
    id,
    type,
    slug,
    name: slug,
    path: `/${slug}/`,
    translations: [{ locale: 'en', path: `/${slug}/` }],
  }) as unknown as PageApiItem

const build = (pages: PageApiItem[]) => buildStaticPaths(pageTypes, [], pages, null, null, null, 'en', 'en')

afterEach(() => vi.restoreAllMocks())

describe('buildStaticPaths() duplicate uri reporting', () => {
  it('warns when two page types resolve to the same uri', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})

    const paths = await build([page(1, 'section', 'fundusze-kpo'), page(2, 'page', 'fundusze-kpo')])

    // Both routes are still returned — reporting, not throwing: a build that fails outright over
    // stale content an editor has not fixed yet is worse than one that says what it dropped.
    expect(paths).toHaveLength(2)
    expect(warn).toHaveBeenCalledTimes(1)
    expect(warn.mock.calls[0]![0]).toContain('2 routes resolve to "/fundusze-kpo"')
    expect(warn.mock.calls[0]![0]).toContain('"section", "page"')
  })

  it('says nothing when every page has an address of its own', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})

    await build([page(1, 'section', 'opinie'), page(2, 'page', 'kontakt')])

    expect(warn).not.toHaveBeenCalled()
  })

  it('catches a derived route landing on a page address', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})

    await buildStaticPaths(
      pageTypes,
      [{ buildPaths: () => [{ uri: 'kontakt', pageType: 'page', props: {} }] }],
      [page(1, 'page', 'kontakt')],
      null,
      null,
      null,
      'en',
      'en',
    )

    expect(warn).toHaveBeenCalledTimes(1)
    // The two spell the route differently — `/kontakt/` from the API vs a rule's bare `kontakt`
    // — and `trailingSlash: 'always'` makes them one route, so the check normalizes.
    expect(warn.mock.calls[0]![0]).toContain('2 routes resolve to "/kontakt"')
  })
})

// A pricing_table's `plans` field and a `testimonials` block's `items` are collection-ref: the
// CMS stores each referenced item as a page row, but with `path: null` in every locale, and
// resolves it inline wherever the block that references it renders — it is never meant to route
// on its own. diligently-dashboard#2119: registering these as unregistered-page-type drops
// warned "will 404" when nothing was ever going to be there, and its own "register the type"
// instruction actively made things worse (every such item shares the null path, so registering
// the type collided them all onto one route).
const referenceItem = (id: number, type: string): PageApiItem =>
  ({
    id,
    type,
    slug: null,
    name: `ref-${id}`,
    path: null,
    translations: [{ locale: 'en', path: null }],
  }) as unknown as PageApiItem

describe('buildStaticPaths() unregistered-type reporting', () => {
  it('warns about an unregistered type that would otherwise have gotten a URL', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})

    const paths = await build([page(1, 'plan', 'starter')])

    expect(paths).toHaveLength(0)
    expect(warn).toHaveBeenCalledTimes(1)
    expect(warn.mock.calls[0]![0]).toContain('Skipped 1 page(s) of unregistered page type "plan"')
  })

  it('says nothing about an unregistered type whose items never had a URL', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})

    const paths = await build([referenceItem(1, 'plan'), referenceItem(2, 'testimonial')])

    expect(paths).toHaveLength(0)
    expect(warn).not.toHaveBeenCalled()
  })
})

// #2130: an archive has no `pages` row — `path` is already this locale's full, correct address
// (built server-side the same way a page's own `translations[].path` is), so its route needs
// only uriFromPath(), never the extraRoutes prefix-adding contract.
const archive = (categoryId: number, path: string): ArchiveApiItem =>
  ({
    category_id: categoryId,
    slug: `cat-${categoryId}`,
    name: `Category ${categoryId}`,
    seo_title: null,
    seo_description: null,
    collection: 'news',
    section_id: 1,
    path,
    url: null,
    count: 1,
    translations: [{ locale: 'en', slug: `cat-${categoryId}`, name: `Category ${categoryId}`, path }],
  }) as ArchiveApiItem

const pageTypesWithArchive: Record<string, PageTypeConfig> = {
  ...pageTypes,
  [CATEGORY_ARCHIVE_PAGE_TYPE]: { component: async () => ({}) },
}

describe('buildStaticPaths() category archive routes', () => {
  it('builds one route per archive when the page type is registered', async () => {
    const paths = await buildStaticPaths(pageTypesWithArchive, [], [], null, null, null, 'en', 'en', [
      archive(101, '/news/investments/'),
    ])

    expect(paths).toHaveLength(1)
    expect(paths[0]!.params.uri).toBe('news/investments/')
    expect(paths[0]!.props.pageType).toBe(CATEGORY_ARCHIVE_PAGE_TYPE)
    expect(paths[0]!.props.path).toBe('/news/investments/')
  })

  it('passes the archive through the registered props shaper', async () => {
    const withShaper: Record<string, PageTypeConfig> = {
      [CATEGORY_ARCHIVE_PAGE_TYPE]: { component: async () => ({}), props: (item) => ({ archive: item }) },
    }
    const one = archive(101, '/news/investments/')

    const paths = await buildStaticPaths(withShaper, [], [], null, null, null, 'en', 'en', [one])

    expect(paths[0]!.props.archive).toEqual(one)
  })

  it('warns when archives exist but the page type is not registered', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})

    const paths = await buildStaticPaths(pageTypes, [], [], null, null, null, 'en', 'en', [
      archive(101, '/news/investments/'),
    ])

    expect(paths).toHaveLength(0)
    expect(warn).toHaveBeenCalledTimes(1)
    expect(warn.mock.calls[0]![0]).toContain('Skipped 1 category archive page(s)')
    expect(warn.mock.calls[0]![0]).toContain(`Register "${CATEGORY_ARCHIVE_PAGE_TYPE}"`)
  })

  it('says nothing when there are no archives at all', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})

    const paths = await buildStaticPaths(pageTypes, [], [], null, null, null, 'en', 'en', [])

    expect(paths).toHaveLength(0)
    expect(warn).not.toHaveBeenCalled()
  })

  it('catches an archive landing on the same address as a real page', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})

    const paths = await buildStaticPaths(
      pageTypesWithArchive,
      [],
      [page(1, 'page', 'investments')],
      null,
      null,
      null,
      'en',
      'en',
      [archive(101, '/investments/')],
    )

    // Both routes are still returned — reporting, not throwing, exactly as the existing
    // page/page collision above.
    expect(paths).toHaveLength(2)
    expect(warn).toHaveBeenCalledTimes(1)
    expect(warn.mock.calls[0]![0]).toContain('2 routes resolve to "/investments"')
  })

  it('defaults to no archive routes when the caller omits the parameter', async () => {
    const paths = await buildStaticPaths(pageTypesWithArchive, [], [], null, null, null, 'en', 'en')

    expect(paths).toHaveLength(0)
  })
})
