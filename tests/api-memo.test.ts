import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// `getMenu` and `getFooter` back the two pieces of chrome a layout mounts on EVERY page, so an
// unmemoized fetch is one request per built page — the cost grows with the site while the answer
// cannot change within a build. `getPages` and `getBranding` have been memoized for exactly this
// reason; these two were the ones left out.
//
// The half that is easy to get wrong is not the caching, it is the eviction. A footer that
// answered `null` for both "no footer component" (404) and "the request failed" could not be
// cached at all: caching the first is right, caching the second pins one transient failure onto
// every page of the build. So these assertions are mostly about the difference between the two.
//
// The memo is module-level state, so each test re-imports the module (`vi.resetModules()` plus a
// dynamic import) to start from an empty cache. Fetching is stubbed at `globalThis.fetch` —
// MOCK_MODE is off here, since vitest sets no ASTRO_API_MOCK.

const ok = (data: unknown) =>
  ({ ok: true, status: 200, json: async () => ({ success: true, data }) }) as unknown as Response

const status = (code: number) => ({ ok: false, status: code, json: async () => ({}) }) as unknown as Response

async function freshApi() {
  vi.resetModules()
  return import('../lib/api')
}

let fetchMock: ReturnType<typeof vi.fn>

beforeEach(() => {
  fetchMock = vi.fn()
  vi.stubGlobal('fetch', fetchMock)
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('getMenu()', () => {
  it('fetches once for repeated calls with the same key and locale', async () => {
    const { getMenu } = await freshApi()
    fetchMock.mockResolvedValue(ok([{ label: 'Home', href: '/', target: 'page', children: [] }]))

    const [first, second, third] = await Promise.all([
      getMenu('header', 'de'),
      getMenu('header', 'de'),
      getMenu('header', 'de'),
    ])

    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(second).toEqual(first)
    expect(third).toEqual(first)
  })

  it('keys the cache by locale, so a second locale is its own request', async () => {
    const { getMenu } = await freshApi()
    fetchMock.mockResolvedValue(ok([]))

    await getMenu('header', 'de')
    await getMenu('header', 'en')
    await getMenu('footer', 'de')

    expect(fetchMock).toHaveBeenCalledTimes(3)
  })

  it('caches a 404 as null — that is the CMS answering "not configured", not a failure', async () => {
    const { getMenu } = await freshApi()
    fetchMock.mockResolvedValue(status(404))

    expect(await getMenu('header')).toBeNull()
    expect(await getMenu('header')).toBeNull()
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('evicts a failed request, so the next caller retries instead of inheriting the failure', async () => {
    const { getMenu } = await freshApi()
    fetchMock.mockRejectedValueOnce(new Error('socket hang up'))

    await expect(getMenu('header')).rejects.toThrow('socket hang up')

    fetchMock.mockResolvedValue(ok([{ label: 'Home', href: '/', target: 'page', children: [] }]))
    expect(await getMenu('header')).toHaveLength(1)
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('does not cache a 500 — a server error is not an answer', async () => {
    const { getMenu } = await freshApi()
    fetchMock.mockResolvedValueOnce(status(500))

    await expect(getMenu('header')).rejects.toThrow('API 500')

    fetchMock.mockResolvedValue(ok([]))
    expect(await getMenu('header')).toEqual([])
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })
})

describe('getFooter()', () => {
  it('fetches once per build, not once per page', async () => {
    const { getFooter } = await freshApi()
    fetchMock.mockResolvedValue(ok({ company_text: '<p>Hello</p>' }))

    const pages = await Promise.all(Array.from({ length: 12 }, () => getFooter('de')))

    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(pages.every((p) => p?.company_text === '<p>Hello</p>')).toBe(true)
  })

  it('caches a 404 as null — the client simply has no footer component', async () => {
    const { getFooter } = await freshApi()
    fetchMock.mockResolvedValue(status(404))

    expect(await getFooter('de')).toBeNull()
    expect(await getFooter('de')).toBeNull()
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  // The regression this whole change exists to avoid: one hiccup must not be able to blank the
  // footer on every page of the build. It rejects, the entry is evicted, and the renderer's own
  // `.catch(() => null)` still degrades that single page.
  it('rejects on a server error rather than resolving null, and does not cache it', async () => {
    const { getFooter } = await freshApi()
    fetchMock.mockResolvedValueOnce(status(503))

    await expect(getFooter('de')).rejects.toThrow('API 503')

    fetchMock.mockResolvedValue(ok({ company_text: '<p>Back</p>' }))
    expect((await getFooter('de'))?.company_text).toBe('<p>Back</p>')
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('keys the cache by locale', async () => {
    const { getFooter } = await freshApi()
    fetchMock.mockResolvedValue(ok({ company_text: '<p>x</p>' }))

    await getFooter('de')
    await getFooter('en')

    expect(fetchMock).toHaveBeenCalledTimes(2)
  })
})

describe('ApiError', () => {
  it('carries the status and keeps the message format callers already read', async () => {
    const { ApiError } = await freshApi()
    const error = new ApiError(418, '/api/teapot')

    expect(error.status).toBe(418)
    expect(error.message).toBe('API 418: /api/teapot')
    expect(error).toBeInstanceOf(Error)
  })
})
