import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { pathForLocale } from '../core/i18n'
import type { PageApiItem } from '../lib/api'

// The cookie banner's privacy link resolved through `page.path` — the DEFAULT-locale address —
// so on every translated tree it pointed at the default locale's privacy notice. Measured on
// diligently.pl: `/cookie-declaration/` rendered on `/pl/`, where the Polish notice lives at
// `/pl/deklaracja-cookie/`.
//
// It is the same defect as the teaser cards in dashboard#1454, and `lib/api.ts` warns about this
// exact field: "Never use it to decide whether a page is routable in THIS locale: that is
// pathForLocale(), off translations[]." The component's own comment already claimed to resolve
// "its localized path"; only the code disagreed.
//
// Two tests, because neither is sufficient alone: the first pins the BEHAVIOUR that was wrong, and
// the second pins the CALL, because this component cannot be rendered in a unit test (it awaits
// three API calls in its frontmatter) and a behaviour test over `pathForLocale` alone would keep
// passing if the component went back to reading `.path`.
describe('the consent banner resolves the privacy page for the locale it renders in', () => {
  const privacyPage = (): PageApiItem =>
    ({
      id: 42,
      type: 'page',
      slug: 'cookie-declaration',
      name: 'Cookie declaration',
      // The default-locale address — the value the component used to read.
      path: '/cookie-declaration/',
      translations: [
        { locale: 'en', slug: 'cookie-declaration', path: '/cookie-declaration/' },
        { locale: 'pl', slug: 'deklaracja-cookie', path: '/pl/deklaracja-cookie/' },
      ],
    }) as unknown as PageApiItem

  it('gives the translated address on a translated tree, not the default one', () => {
    expect(pathForLocale(privacyPage(), 'pl', 'en')).toBe('/pl/deklaracja-cookie/')
  })

  it('still gives the default-locale address on the default tree', () => {
    expect(pathForLocale(privacyPage(), 'en', 'en')).toBe('/cookie-declaration/')
  })

  it('honours a CMS-resolved default locale that disagrees with this repo (#1195)', () => {
    // With `pl` routing at the root, the Polish address is the unprefixed one.
    const page = {
      ...privacyPage(),
      translations: [
        { locale: 'pl', slug: 'deklaracja-cookie', path: '/deklaracja-cookie/' },
        { locale: 'en', slug: 'cookie-declaration', path: '/en/cookie-declaration/' },
      ],
    } as unknown as PageApiItem

    expect(pathForLocale(page, 'pl', 'pl')).toBe('/deklaracja-cookie/')
    expect(pathForLocale(page, 'en', 'pl')).toBe('/en/cookie-declaration/')
  })

  it('CookieConsent.astro resolves through pathForLocale and never reads .path', () => {
    // A source assertion, deliberately: the component awaits getSiteSettings, getCookieConsent and
    // getPages in its frontmatter, so a unit test cannot render it — and the bug was not in
    // `pathForLocale` (which was always right) but in the component choosing not to call it.
    const src = readFileSync(fileURLToPath(new URL('../core/CookieConsent.astro', import.meta.url)), 'utf8')

    expect(src).toContain('pathForLocale(page, locale, defaultLocale)')
    expect(src).not.toMatch(/privacyId\s*\)\s*\?\.path/)
    // The resolved default locale, not this repo's declared one (#1195).
    expect(src).toContain('getEffectiveConfig()')
  })
})
