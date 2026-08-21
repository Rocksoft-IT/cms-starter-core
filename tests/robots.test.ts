import { describe, expect, test } from 'vitest'
import { robotsLines } from '../core/robots'

/**
 * robots.txt (dashboard #514), plus what a client that is not public yet changes about it (#1169).
 */
describe('robotsLines', () => {
  test('advertises the sitemap index for a visible client', () => {
    expect(robotsLines('https://live.test', true)).toEqual([
      'User-agent: *',
      'Allow: /',
      '',
      'Sitemap: https://live.test/sitemap-index.xml',
    ])
  })

  test('advertises nothing when no origin resolved', () => {
    // A relative Sitemap: line is not a sitemap reference; better to omit it entirely.
    expect(robotsLines(null, true)).toEqual(['User-agent: *', 'Allow: /'])
  })

  test('drops the sitemap line for a client that is not public yet', () => {
    expect(robotsLines('https://staging.test', false)).toEqual(['User-agent: *', 'Allow: /'])
  })

  /**
   * The load-bearing negative. A `Disallow: /` would stop a crawler from FETCHING the pages, so
   * it would never read the `noindex` they carry — which prevents indexing a staging copy Google
   * has not seen, but freezes one it HAS seen permanently in the index. Staying crawlable is the
   * only option that works in both cases, so this must not "improve" into a Disallow.
   */
  test('never emits a Disallow, hidden or not', () => {
    for (const visible of [true, false]) {
      expect(robotsLines('https://x.test', visible).join('\n')).not.toContain('Disallow')
    }
  })
})
