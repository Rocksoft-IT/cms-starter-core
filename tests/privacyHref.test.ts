import { describe, expect, test } from 'vitest'
import { resolvePrivacyHref } from '../core/privacyHref'

// The banner's privacy link is the one piece of the consent UI a regulator reads: it is how the
// visitor is meant to find out what they are agreeing to. These pin the two ways it can quietly
// stop working — the wrong source winning, and a blank value rendering a link that goes nowhere.
describe('resolvePrivacyHref', () => {
  test('the CMS page wins, so picking one in the panel actually changes the site', () => {
    // The project fallback is hardcoded in a repo. If it won, a client-admin choosing a privacy
    // page would see no effect and have no way to find out why.
    expect(resolvePrivacyHref('/privacy-policy/', '/datenschutz')).toBe('/privacy-policy/')
  })

  test('the project path is used when the CMS has no answer', () => {
    // The case this fallback exists for: a privacy notice that is a hand-written Astro route, so
    // no privacy_page_id can name it.
    expect(resolvePrivacyHref(null, '/datenschutz')).toBe('/datenschutz')
    expect(resolvePrivacyHref(undefined, '/datenschutz')).toBe('/datenschutz')
  })

  test('no link at all is a valid outcome, not an empty href', () => {
    expect(resolvePrivacyHref(null, null)).toBeNull()
    expect(resolvePrivacyHref(undefined, undefined)).toBeNull()
  })

  // `<a href="">` reloads the current page. It looks like a working link and sends the visitor
  // nowhere, which is worse than rendering no link — a blank from either side must not produce one.
  test('blank and whitespace-only values are not answers', () => {
    expect(resolvePrivacyHref('', '')).toBeNull()
    expect(resolvePrivacyHref('   ', null)).toBeNull()
    expect(resolvePrivacyHref(null, '   ')).toBeNull()
  })

  test('a blank CMS path falls through to the project path rather than swallowing it', () => {
    // Precedence is about which source ANSWERED, not which was passed: an empty CMS value has not
    // answered, so the fallback still applies.
    expect(resolvePrivacyHref('', '/datenschutz')).toBe('/datenschutz')
    expect(resolvePrivacyHref('  ', '/datenschutz')).toBe('/datenschutz')
  })

  test('values are trimmed, because a stray newline in a CMS path breaks the URL', () => {
    expect(resolvePrivacyHref(' /privacy/ ', null)).toBe('/privacy/')
    expect(resolvePrivacyHref(null, '\n/datenschutz\n')).toBe('/datenschutz')
  })

  test('an absolute URL passes through, for a notice hosted off-site', () => {
    expect(resolvePrivacyHref(null, 'https://example.com/privacy')).toBe('https://example.com/privacy')
  })
})
