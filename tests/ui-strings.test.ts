import { describe, it, expect, vi } from 'vitest'
import { coreString, BASE_LOCALE, BUILT_IN_LOCALES, type CoreStrings } from '../core/ui-strings'

// The strings core says on its own behalf are announced, never displayed — a lightbox close button,
// a carousel arrow. That is exactly why they need a test: nobody looking at the page can see them,
// so a regression here is invisible until a screen-reader user meets it.
//
// The starter's own cms.config declares `defaultLocale: 'en'`, which the "no locale given" case
// leans on. `vi.mock` supplies a config for the override case rather than editing the real one.

const KEYS = [
  'galleryZoomNamed',
  'galleryZoom',
  'galleryDialog',
  'close',
  'previousPhoto',
  'nextPhoto',
  'previousTestimonial',
  'nextTestimonial',
  'videoCard',
  'previousSlide',
  'nextSlide',
  'goToSlide',
  'slidePosition',
] as const satisfies readonly (keyof CoreStrings)[]

describe('coreString()', () => {
  it('answers in the locale it is given', () => {
    expect(coreString('pl', 'close')).toBe('Zamknij')
    expect(coreString('en', 'close')).toBe('Close')
    expect(coreString('pl', 'nextTestimonial')).toBe('Następna opinia')
  })

  it('fills placeholders, and leaves an unfilled one visible rather than blank', () => {
    expect(coreString('pl', 'galleryZoomNamed', { name: 'Piknik' })).toBe('Powiększ: Piknik')
    // A wrong call site should be findable in review, not read as a missing word.
    expect(coreString('en', 'galleryZoomNamed')).toBe('Enlarge: {name}')
  })

  it('falls back to the base locale for a language core does not carry', () => {
    // Deliberate, and the opposite of what a client repo does with its OWN chrome: core is shared
    // and cannot take a build down over a word it never promised to translate. A control announced
    // in the wrong language still has a name; one announced as nothing does not.
    expect(coreString('de', 'close')).toBe(coreString(BASE_LOCALE, 'close'))
    expect(coreString('de', 'nextPhoto')).toBe('Next photo')
  })

  it('falls back to the SITE default when no locale is passed at all, not to the base locale', () => {
    // "Nobody told me" and "this site is English" are different facts. The starter's config happens
    // to say `en`, so this pins the mechanism by asserting it tracks the config rather than a
    // literal — see the override test below for the case where the two differ.
    expect(coreString(undefined, 'close')).toBe(coreString('en', 'close'))
  })

  it('every built-in locale answers every key with something non-empty', () => {
    for (const code of BUILT_IN_LOCALES) {
      for (const key of KEYS) {
        expect(coreString(code, key).trim(), `${code}.${key}`).not.toBe('')
      }
    }
  })

  it('a non-base locale is genuinely translated, not quietly falling through to the base', () => {
    // The failure this catches: adding a key to `en` and forgetting `pl`. The fallback makes that
    // render — in English, on a Polish site — so "not empty" would pass it. Every key must differ.
    for (const key of KEYS) {
      expect(coreString('pl', key), key).not.toBe(coreString('en', key))
    }
  })
})

describe('coreString() — the site override seam', () => {
  it('lets a site supply a locale core does not ship, and win over core where it does', async () => {
    vi.resetModules()
    vi.doMock('~site/cms.config', () => ({
      cmsConfig: {
        defaultLocale: 'de',
        coreStrings: {
          de: { close: 'Schließen' },
          pl: { close: 'Zamknij okno' },
        },
      },
    }))
    const { coreString: scoped } = await import('../core/ui-strings')

    // A locale core has never heard of, supplied entirely by the site.
    expect(scoped('de', 'close')).toBe('Schließen')
    // The site's wording beats core's for a locale core DOES carry.
    expect(scoped('pl', 'close')).toBe('Zamknij okno')
    // ...and only for the key it overrode; the rest still come from core.
    expect(scoped('pl', 'nextPhoto')).toBe('Następne zdjęcie')
    // A key the site left alone in a locale core does not carry still falls back to base.
    expect(scoped('de', 'nextPhoto')).toBe('Next photo')
    // No locale passed now resolves to `de`, this config's default — the fact the previous test
    // could not distinguish, because the starter's own default happens to be the base locale.
    expect(scoped(undefined, 'close')).toBe('Schließen')

    vi.doUnmock('~site/cms.config')
    vi.resetModules()
  })
})
