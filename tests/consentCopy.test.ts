import { describe, expect, test } from 'vitest'
import defaults from '../core/consent-copy.json' with { type: 'json' }
import { consentCopyDefaults } from '../core/consentCopy'

const TABLE: Record<string, Record<string, string>> = defaults
const LOCALES = Object.keys(TABLE)
const KEYS = Object.keys(TABLE.en)

// The banner's fallback copy is what a visitor reads while the CMS `cookie_consent` component is
// unauthored — which, for a brand-new client, is every visitor. It used to be English for every
// locale; these pin the per-locale resolution that replaced that.
describe('consentCopyDefaults', () => {
  test('English is complete, because every other locale falls back to it key by key', () => {
    for (const locale of LOCALES) {
      for (const key of Object.keys(TABLE[locale])) {
        expect(KEYS, `${locale}.${key} has no English counterpart`).toContain(key)
      }
    }
  })

  test('a translated locale resolves to its own copy, not English', () => {
    expect(consentCopyDefaults('pl').accept_label).toBe('Akceptuję')
    expect(consentCopyDefaults('no').accept_label).toBe('Godta')
  })

  test('every key resolves to a non-empty string for every locale', () => {
    for (const locale of LOCALES) {
      const copy = consentCopyDefaults(locale) as unknown as Record<string, string>

      for (const key of KEYS) {
        expect(copy[key], `${locale}.${key}`).toBeTruthy()
      }
    }
  })

  // An untranslated locale must still render a readable banner rather than blanks — the whole
  // point of merging over English instead of returning the locale's entry outright. `fr` is a real
  // CMS locale (config/languages.php) that this table does not translate, which is exactly the case
  // the fallback exists for. It used to be `de`, and this test is how adding German was noticed.
  test('an untranslated locale falls back to English', () => {
    expect(consentCopyDefaults('fr')).toEqual(consentCopyDefaults('en'))
  })
})
