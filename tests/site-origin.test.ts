import { describe, expect, test } from 'vitest'
import { resolveSiteOrigin } from '../core/siteOrigin.mjs'

// The rule both origin surfaces now share (dashboard #1090): `siteUrl()` for <Seo>/robots.txt, and
// `site` in astro.config.mjs for Astro's own absolute-URL helpers. These assert the rule itself;
// tests/unit/astro-config-site.test.ts asserts that the config actually calls it, which is where
// the bug lived.

describe('precedence', () => {
  test('the first non-empty candidate wins, in the order the caller passed', () => {
    expect(resolveSiteOrigin('https://env.test', 'https://config.test')).toBe('https://env.test')
  })

  test('falls through to the next candidate when the first is unset', () => {
    // The offline case, and any client with no default domain yet: the deploy omits
    // ASTRO_SITE_URL rather than writing it empty (dashboard #1107), so the site resolves its
    // origin from cmsConfig.seo.siteUrl alone. `site` had no such fallback at all, which is why the
    // loadEnv fix on its own would not have changed a single real build.
    expect(resolveSiteOrigin(undefined, 'https://config.test')).toBe('https://config.test')
  })

  test('an empty or whitespace-only candidate is not a value', () => {
    // `ASTRO_SITE_URL=` in a .env parses to '', which must not shadow the config fallback.
    expect(resolveSiteOrigin('', 'https://config.test')).toBe('https://config.test')
    expect(resolveSiteOrigin('   ', 'https://config.test')).toBe('https://config.test')
  })

  test('a non-string candidate is skipped rather than coerced', () => {
    expect(resolveSiteOrigin(null, undefined, 'https://config.test')).toBe('https://config.test')
  })
})

describe('normalization', () => {
  test('trailing slashes are stripped so callers can concatenate a path', () => {
    expect(resolveSiteOrigin('https://env.test/')).toBe('https://env.test')
    expect(resolveSiteOrigin('https://env.test///')).toBe('https://env.test')
  })

  test('surrounding whitespace is trimmed', () => {
    // A stray space survives a hand-edited .env line and would make Astro reject `site` as an
    // invalid URL at config validation — i.e. fail the build, not just emit a bad link.
    expect(resolveSiteOrigin('  https://env.test  ')).toBe('https://env.test')
  })

  test('a path-carrying origin keeps its path, minus the trailing slash', () => {
    expect(resolveSiteOrigin('https://env.test/shop/')).toBe('https://env.test/shop')
  })
})

describe('nothing configured', () => {
  test('returns null rather than an empty string or a guessed origin', () => {
    // Every caller degrades on null: <Seo> keeps its build-URL fallback, robots.txt omits the
    // Sitemap line, and astro.config turns it into `undefined` (the only absent value Astro's
    // schema accepts). A wrong absolute URL is worse than an absent one.
    expect(resolveSiteOrigin(undefined, undefined)).toBeNull()
    expect(resolveSiteOrigin()).toBeNull()
  })
})
