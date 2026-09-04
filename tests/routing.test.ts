import { describe, it, expect, vi, afterEach } from 'vitest'
import { buildStaticPaths, type PageTypeConfig } from '../core/routing'
import type { PageApiItem } from '../lib/api'

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

// pathIndex is what lets a block resolve a hand-typed internal href (a CTA, a nav item) to the
// CURRENT locale's own address instead of the literal, default-locale one an editor saw while
// typing it (lib/href.ts). It has to ride on every route unconditionally, the same way
// `defaultLocale` already does — a component needing it should never depend on every
// `pageTypes[...].props` shaper remembering to add it.
describe('buildStaticPaths() pathIndex', () => {
  const contact = (): PageApiItem =>
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
    }) as unknown as PageApiItem

  it('carries a cross-locale entry on every emitted route', async () => {
    const paths = await build([contact()])

    expect(paths).toHaveLength(1)
    const { pathIndex } = paths[0]!.props as { pathIndex: Record<string, Record<string, string>> }
    expect(pathIndex['/contact/']).toEqual({ en: '/contact/', pl: '/pl/kontakt/' })
  })

  it('rides on an extraRoutes-derived route too', async () => {
    const paths = await buildStaticPaths(
      pageTypes,
      [{ buildPaths: () => [{ uri: 'derived', pageType: 'page', props: {} }] }],
      [contact()],
      null,
      null,
      null,
      'en',
      'en',
    )

    const derived = paths.find((p) => p.params.uri === 'derived')!
    const { pathIndex } = derived.props as { pathIndex: Record<string, Record<string, string>> }
    expect(pathIndex['/contact/']).toEqual({ en: '/contact/', pl: '/pl/kontakt/' })
  })
})
