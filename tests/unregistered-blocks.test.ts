import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { reportUnregisteredBlock, resetUnregisteredBlockReports } from '../core/unregisteredBlocks'

// The drop report BlockRenderer.astro prints for a block whose type cms.config.ts does not
// register. What matters is that it prints at all (the skip used to be silent — the only trace
// was a hole in the page), that it prints ONCE per type (a 750-page site must not print 750
// lines), and that it opens with `[cms]`, the prefix the dashboard collects (#2064, #2307).

describe('reportUnregisteredBlock', () => {
  let warn: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    resetUnregisteredBlockReports()
    warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
  })

  afterEach(() => {
    warn.mockRestore()
  })

  test('names the type and the first page it was seen on, under the [cms] prefix', () => {
    reportUnregisteredBlock('social_links', '/pl/kontakt/')

    expect(warn).toHaveBeenCalledTimes(1)
    const line = String(warn.mock.calls[0][0])
    expect(line.startsWith('[cms] ')).toBe(true)
    expect(line).toContain('"social_links"')
    expect(line).toContain('"/pl/kontakt/"')
    expect(line).toContain('render as nothing')
  })

  test('reports each type once, however many pages carry it', () => {
    reportUnregisteredBlock('social_links', '/')
    reportUnregisteredBlock('social_links', '/about/')
    reportUnregisteredBlock('comparison_table', '/pricing/')
    reportUnregisteredBlock('social_links', '/contact/')

    expect(warn).toHaveBeenCalledTimes(2)
    expect(String(warn.mock.calls[0][0])).toContain('"social_links"')
    expect(String(warn.mock.calls[1][0])).toContain('"comparison_table"')
  })

  test('reset forgets what was reported', () => {
    reportUnregisteredBlock('social_links', '/')
    resetUnregisteredBlockReports()
    reportUnregisteredBlock('social_links', '/')

    expect(warn).toHaveBeenCalledTimes(2)
  })
})
