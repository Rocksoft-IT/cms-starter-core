import { describe, it, expect, vi, afterEach } from 'vitest'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { cmsRedirects, toAstroRedirects } from '../core/redirects.mjs'

// dashboard #1084 — the CMS's redirect map has to survive the trip into `config.redirects`
// intact, and a bad row in it must never take a deploy down. Both halves are covered here
// because neither shows up in a build log: a dropped entry looks exactly like "nothing moved".

describe('toAstroRedirects()', () => {
  it('normalizes both ends to a leading + trailing slash', () => {
    // The API already emits this shape; a hand-written fixture and an older backend do not.
    expect(toAstroRedirects({ kontak: '/kontakt' })).toEqual({ '/kontak/': '/kontakt/' })
    expect(toAstroRedirects({ '/blog/wpis/': 'aktualnosci/wpis' })).toEqual({
      '/blog/wpis/': '/aktualnosci/wpis/',
    })
  })

  it('passes an absolute destination through untouched', () => {
    expect(toAstroRedirects({ old: 'https://example.com/new' })).toEqual({
      '/old/': 'https://example.com/new',
    })
  })

  it('drops a self-redirect', () => {
    // It would emit a page that refreshes to itself.
    expect(toAstroRedirects({ kontakt: '/kontakt/' })).toEqual({})
  })

  it('drops a path Astro would read as a dynamic route', () => {
    // `[` opens a route param, so this would throw during route collection — a content row
    // must not be able to fail the build.
    expect(toAstroRedirects({ '/[slug]/': '/kontakt/' })).toEqual({})
    expect(toAstroRedirects({ '/kontak/': '/[slug]/' })).toEqual({})
  })

  it('answers an empty map for anything that is not an object of strings', () => {
    expect(toAstroRedirects(null)).toEqual({})
    expect(toAstroRedirects([])).toEqual({})
    expect(toAstroRedirects('nope')).toEqual({})
    expect(toAstroRedirects({ kontak: 42 })).toEqual({})
    expect(toAstroRedirects({ '': '/kontakt/' })).toEqual({})
  })
})

describe('cmsRedirects()', () => {
  const setup = cmsRedirects().hooks['astro:config:setup']

  function hookArgs(command = 'build') {
    const updates: Record<string, unknown>[] = []
    return {
      updates,
      args: {
        command,
        // A real Astro root, i.e. an absolute file URL — and one with no .env or fixtures in
        // it, so the hook's own inputs are the only thing under test.
        config: { root: pathToFileURL(join(tmpdir(), 'cms-redirects-test/')) },
        updateConfig: (config: Record<string, unknown>) => updates.push(config),
        logger: { info: vi.fn(), warn: vi.fn() },
      },
    }
  }

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.unstubAllEnvs()
  })

  function stubEnv() {
    vi.stubEnv('ASTRO_API_MOCK', '')
    vi.stubEnv('ASTRO_API_URL', 'https://cms.example.test')
    vi.stubEnv('ASTRO_API_TOKEN', 'token')
  }

  it('merges the fetched map into the config', async () => {
    stubEnv()
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => Response.json({ success: true, data: { '/kontak/': '/kontakt/' } })),
    )

    const { updates, args } = hookArgs()
    await setup(args)

    expect(updates).toEqual([{ redirects: { '/kontak/': '/kontakt/' } }])
  })

  it('builds without redirects when the backend predates the endpoint', async () => {
    // A 404 is the state every client was in before this shipped; the two sides do not have to
    // deploy in step.
    stubEnv()
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('', { status: 404 })),
    )

    const { updates, args } = hookArgs()
    await setup(args)

    expect(updates).toEqual([])
    expect(args.logger.warn).not.toHaveBeenCalled()
  })

  it('warns and continues when the fetch fails', async () => {
    // Never fatal: no redirects is the pre-#1084 status quo, and taking a content deploy down
    // over a secondary feature is the worse trade. The warning is the only trace it leaves.
    stubEnv()
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('', { status: 500, statusText: 'Server Error' })),
    )

    const { updates, args } = hookArgs()
    await setup(args)

    expect(updates).toEqual([])
    expect(args.logger.warn).toHaveBeenCalledOnce()
  })

  it('does not call the CMS for a command that emits no routes', async () => {
    // `astro check` runs a sync, so without this guard type-checking in CI would depend on a
    // reachable CMS.
    stubEnv()
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)

    const { updates, args } = hookArgs('sync')
    await setup(args)

    expect(fetchMock).not.toHaveBeenCalled()
    expect(updates).toEqual([])
  })

  it('never reaches the network without credentials', async () => {
    vi.stubEnv('ASTRO_API_MOCK', '')
    vi.stubEnv('ASTRO_API_URL', '')
    vi.stubEnv('ASTRO_API_TOKEN', '')
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)

    const { updates, args } = hookArgs()
    await setup(args)

    expect(fetchMock).not.toHaveBeenCalled()
    expect(updates).toEqual([])
    expect(args.logger.warn).toHaveBeenCalledOnce()
  })
})
