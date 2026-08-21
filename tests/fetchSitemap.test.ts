import { describe, expect, test } from 'vitest'
import { isSearchVisible, isSitemapArtifact, parseSitemapIndex, fileNameFor } from '../scripts/fetch-sitemap.mjs'

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

/**
 * `public/` survives between deploys, so writing nothing is not the same as publishing nothing:
 * a client that was visible and is now hidden kept serving the sitemap it had been given, from a
 * file no later build touched. Skipping the fetch was never enough on its own (dashboard #1324).
 */
describe('isSitemapArtifact', () => {
  test('claims the files this script writes', () => {
    expect(isSitemapArtifact('sitemap-index.xml')).toBe(true)
    expect(isSitemapArtifact('sitemap-pl.xml')).toBe(true)
    expect(isSitemapArtifact('sitemap-en-GB.xml')).toBe(true)
  })

  /**
   * The load-bearing negative: this decides what gets DELETED from a directory the site also
   * uses for hand-placed assets, so it must stay narrower than "anything sitemap-ish".
   */
  test('leaves anything it did not write alone', () => {
    expect(isSitemapArtifact('sitemap.xml')).toBe(false)
    expect(isSitemapArtifact('favicon.ico')).toBe(false)
    expect(isSitemapArtifact('sitemap-pl.xml.bak')).toBe(false)
    expect(isSitemapArtifact('my-sitemap-pl.xml')).toBe(false)
    expect(isSitemapArtifact('sitemap-')).toBe(false)
  })
})
