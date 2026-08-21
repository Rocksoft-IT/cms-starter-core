import { describe, expect, test } from 'vitest'
import { resolveEffectiveConfig, type ConfigInput } from '../core/effectiveConfig'
import type { LocaleApiItem, SiteSettingsData } from '../lib/api'

// The precedence rule the #1195 seam exists to have in ONE place: CMS value, then this repo's own
// cms.config.ts, then a built-in default. These test the rule itself; getEffectiveConfig() is the
// memoized wrapper that feeds it two fetches, and has nothing of its own to assert.
//
// The middle rung is what keeps the change additive: a site whose CMS says nothing new must behave
// exactly as it did before, which is what every "falls back to" case below pins.

const LOCALES: LocaleApiItem[] = [{ code: 'en' }, { code: 'pl', is_default: true }]

/** A config with every optional field set, so a test can prove the CMS outranks a PRESENT value. */
const FULL_CONFIG: ConfigInput = {
  defaultLocale: 'en',
  menus: { header: 'main-nav', footer: 'foot-nav' },
  seo: { siteName: 'Repo Name', defaultImage: '/repo-og.png', siteUrl: 'https://repo.test' },
}

/** The shape an offline/mock build sees: locales answer, site-settings fields are unset. */
const EMPTY_SETTINGS: SiteSettingsData = {}

function resolve(overrides: {
  locales?: LocaleApiItem[]
  settings?: SiteSettingsData
  siteOrigin?: string | null
  config?: ConfigInput
} = {}) {
  return resolveEffectiveConfig({
    locales: overrides.locales ?? LOCALES,
    settings: overrides.settings ?? EMPTY_SETTINGS,
    siteOrigin: overrides.siteOrigin ?? null,
    config: overrides.config ?? FULL_CONFIG,
  })
}

describe('defaultLocale', () => {
  test('the locale the CMS flags is_default wins over the repo value', () => {
    // The whole point of the seam: the panel decides which locale routes at the root, and a repo
    // value that disagrees is stale config, not an instruction.
    expect(resolve().defaultLocale).toBe('pl')
  })

  test('falls back to the repo value when no locale carries the flag', () => {
    expect(resolve({ locales: [{ code: 'en' }, { code: 'pl' }] }).defaultLocale).toBe('en')
  })

  test('falls back to the repo value when the CMS returns no locales at all', () => {
    expect(resolve({ locales: [] }).defaultLocale).toBe('en')
  })
})

describe('seo.siteName', () => {
  test('the CMS site_name wins over the repo value', () => {
    expect(resolve({ settings: { site_name: 'CMS Name' } }).seo.siteName).toBe('CMS Name')
  })

  test('falls back to the repo value when the client has not set one', () => {
    // null, not absent: SiteSettingsController emits every field with a server-side null default,
    // so "unset" arrives explicitly and must not shadow the repo fallback.
    expect(resolve({ settings: { site_name: null } }).seo.siteName).toBe('Repo Name')
    expect(resolve({ settings: {} }).seo.siteName).toBe('Repo Name')
  })

  test('is undefined when neither source has one, so <Seo> omits og:site_name', () => {
    // Deliberately no built-in default: emitting the starter's own name on a client's site would
    // be worse than emitting no tag at all.
    const config = { ...FULL_CONFIG, seo: { ...FULL_CONFIG.seo, siteName: undefined } }
    expect(resolve({ config }).seo.siteName).toBeUndefined()
  })
})

describe('seo.defaultImage', () => {
  test('the CMS default_og_image wins over the repo value', () => {
    expect(resolve({ settings: { default_og_image: 'https://cdn.test/og.jpg' } }).seo.defaultImage).toBe(
      'https://cdn.test/og.jpg',
    )
  })

  test('falls back to the repo value when the client has not set one', () => {
    expect(resolve({ settings: { default_og_image: null } }).seo.defaultImage).toBe('/repo-og.png')
  })

  test('is undefined when neither source has one, so <Seo> omits og:image', () => {
    const config = { ...FULL_CONFIG, seo: { ...FULL_CONFIG.seo, defaultImage: undefined } }
    expect(resolve({ config }).seo.defaultImage).toBeUndefined()
  })
})

describe('seo.siteUrl', () => {
  test('passes through the already-resolved origin verbatim', () => {
    // core/site.ts owns that chain (it has three candidates and an env read of its own); this seam
    // must not re-derive it, or there would be two answers to one question again (#1090).
    expect(resolve({ siteOrigin: 'https://live.test' }).seo.siteUrl).toBe('https://live.test')
  })

  test('is null - never the repo value - when nothing resolved an origin', () => {
    // FULL_CONFIG carries seo.siteUrl, so a seam that consulted the config here would return it.
    // It must not: siteUrl() already considered that candidate and still answered null.
    expect(resolve({ siteOrigin: null }).seo.siteUrl).toBeNull()
  })
})

describe('menus', () => {
  test('uses the repo keys when the site declares them', () => {
    expect(resolve().menus).toEqual({ header: 'main-nav', footer: 'foot-nav' })
  })

  test("defaults to 'header' / 'footer' when the site declares none", () => {
    // The CMS has no menu-key setting to read, so this rung is the whole feature: a site that
    // wants the conventional keys writes nothing at all.
    const config: ConfigInput = { ...FULL_CONFIG, menus: undefined }
    expect(resolve({ config }).menus).toEqual({ header: 'header', footer: 'footer' })
  })

  test('defaults each key independently', () => {
    const config: ConfigInput = { ...FULL_CONFIG, menus: { header: 'main-nav' } }
    expect(resolve({ config }).menus).toEqual({ header: 'main-nav', footer: 'footer' })
  })
})

describe('searchVisible (dashboard #1169)', () => {
  test('is false only when the CMS says so in as many words', () => {
    expect(resolve({ settings: { search_visible: false } }).searchVisible).toBe(false)
  })

  test('is true when the CMS says so', () => {
    expect(resolve({ settings: { search_visible: true } }).searchVisible).toBe(true)
  })

  test('defaults to VISIBLE when the field is absent', () => {
    // The opposite of the column's default in the CMS, deliberately. That default governs a newly
    // created client, where a person decides; this governs MISSING DATA - a mock build, a fetch
    // that failed, or a panel older than the field. Defaulting those to hidden would noindex
    // every live site the moment the API hiccuped.
    expect(resolve({ settings: {} }).searchVisible).toBe(true)
  })
})
