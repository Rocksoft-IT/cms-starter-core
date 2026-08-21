import { describe, expect, test } from 'vitest'
import { isSearchVisible, parseSitemapIndex, fileNameFor } from '../scripts/fetch-sitemap.mjs'

/**
 * The build step that copies the CMS's sitemaps into public/ (dashboard #514), moved into core
 * in #1324 so a client repo runs a one-line wrapper instead of its own drifting copy.
 */
describe('isSearchVisible (dashboard #1169)', () => {
  test('is false only when the payload says so in as many words', () => {
    expect(isSearchVisible({ data: { search_visible: false } })).toBe(false)
  })

  test('is true when the payload says so', () => {
    expect(isSearchVisible({ data: { search_visible: true } })).toBe(true)
  })

  /**
   * The same default core/effectiveConfig.ts applies, asserted separately because it is encoded
   * separately: this is a plain Node script and cannot import that module (it resolves `~site`).
   * Two copies of one rule is exactly the shape that drifts, so both are pinned.
   */
  test('defaults to VISIBLE when the field, the payload or the whole response is absent', () => {
    expect(isSearchVisible({ data: {} })).toBe(true)
    expect(isSearchVisible({})).toBe(true)
    expect(isSearchVisible(undefined)).toBe(true)
  })
})

describe('sitemap index parsing', () => {
  test('reads the locale files in document order', () => {
    const xml = `<sitemapindex>
      <sitemap><loc>https://x.test/sitemap-pl.xml</loc></sitemap>
      <sitemap><loc>https://x.test/sitemap-en.xml</loc></sitemap>
    </sitemapindex>`
    expect(parseSitemapIndex(xml)).toEqual([
      'https://x.test/sitemap-pl.xml',
      'https://x.test/sitemap-en.xml',
    ])
  })

  test('refuses to write a file from a suspicious loc', () => {
    expect(fileNameFor('https://x.test/sitemap-pl.xml')).toBe('sitemap-pl.xml')
    expect(() => fileNameFor('https://x.test/../../etc/passwd')).toThrow(/suspicious/)
  })
})
