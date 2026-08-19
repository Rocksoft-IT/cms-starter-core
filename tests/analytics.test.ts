import { afterEach, describe, expect, test, vi } from 'vitest'
import { CONSENT_SIGNALS_JS, classifyAnalyticsId, resolveAnalytics, warnAboutAnalytics } from '../core/analytics'
import type { SiteSettingsData } from '../lib/api'

// dashboard #1191 — a stored GA4/GTM id reached the API and then vanished: the loader accepted
// only `GTM-…` and `G-…`, dropped everything else without a word, and the banner used a different
// (looser) definition of "this site has analytics" than the loader did. These assert the shared
// resolver both components now read, in isolation; the rendered-output half is
// tests/e2e/consent-analytics.spec.ts.

const settings = (
  integrations: Record<string, Record<string, string>>,
  consent = true,
  granular = false,
): SiteSettingsData => ({
  cookie_consent: { enabled: consent, privacy_page_id: null, granular },
  integrations,
})

describe('classifyAnalyticsId', () => {
  test('routes a GTM container to the GTM loader', () => {
    expect(classifyAnalyticsId('GTM-ABC1234')).toEqual({ kind: 'gtm', id: 'GTM-ABC1234' })
  })

  test.each(['G-XYZ1234567', 'GT-ABC1234', 'AW-1234567890', 'DC-1234567'])('routes %s to gtag.js', (raw) => {
    expect(classifyAnalyticsId(raw)).toEqual({ kind: 'gtag', id: raw })
  })

  test('normalizes a pasted id rather than rejecting it', () => {
    expect(classifyAnalyticsId('  gtm-abc1234 ')).toEqual({ kind: 'gtm', id: 'GTM-ABC1234' })
  })

  test.each(['UA-12345-1', 'GTM_ABC1234', 'ABC1234', '', '   ', null, undefined, 42])(
    'refuses %s',
    (raw) => {
      expect(classifyAnalyticsId(raw)).toBeNull()
    },
  )
})

describe('resolveAnalytics', () => {
  test('emits nothing when no id is configured', () => {
    expect(resolveAnalytics(settings({}))).toMatchObject({ active: false, gtmId: null, gtagId: null })
  })

  test('a GTM container wins over a GA4 id — the container usually hosts the GA4 tag', () => {
    const resolved = resolveAnalytics(
      settings({ google_tag: { container_id: 'GTM-ABC1234' }, ga4: { measurement_id: 'G-XYZ1234567' } }),
    )

    expect(resolved).toMatchObject({ active: true, gtmId: 'GTM-ABC1234', gtagId: 'G-XYZ1234567' })
  })

  test('routes by id shape, not by provider slot: a gtag id pasted into the Google Tag field still loads', () => {
    // The panel labels this provider "Google Tag" and Google hands out `GT-` ids under that name,
    // so this is the expected editor mistake — and it used to ship a site with no analytics.
    const resolved = resolveAnalytics(settings({ google_tag: { container_id: 'GT-ABC1234' } }))

    expect(resolved).toMatchObject({ active: true, gtmId: null, gtagId: 'GT-ABC1234' })
  })

  test('a malformed id is dropped and reported, not interpolated', () => {
    const resolved = resolveAnalytics(settings({ ga4: { measurement_id: 'UA-12345-1' } }))

    expect(resolved).toMatchObject({ active: false, gtagId: null })
    expect(resolved.ignored).toEqual([{ source: 'ga4.measurement_id', reason: 'malformed' }])
  })

  test('consent off keeps a perfectly good id off the site', () => {
    const resolved = resolveAnalytics(settings({ ga4: { measurement_id: 'G-XYZ1234567' } }, false))

    expect(resolved).toMatchObject({ active: false, consentEnabled: false, gtagId: 'G-XYZ1234567' })
  })

  test('a blank stored value is absence, not a malformed id', () => {
    expect(resolveAnalytics(settings({ ga4: { measurement_id: '  ' } })).ignored).toEqual([])
  })

  // --- granular mode (#1226) ---------------------------------------------------------------

  test('granular defaults to false — every client gets the plain Accept/Reject banner', () => {
    const resolved = resolveAnalytics(settings({ google_tag: { container_id: 'GTM-ABC1234' } }))

    expect(resolved).toMatchObject({ active: true, granular: false })
  })

  test('granular is read straight through when the client opted in', () => {
    const resolved = resolveAnalytics(settings({ google_tag: { container_id: 'GTM-ABC1234' } }, true, true))

    expect(resolved).toMatchObject({ active: true, granular: true })
  })

  test('granular is irrelevant, not merely false, when consent is off', () => {
    // Not asserting `granular: false` here on purpose — the field being technically false while
    // the client's stored setting says true would be a MISLEADING pass. What matters is
    // `showBanner`, which the banner gates on.
    const resolved = resolveAnalytics(settings({ ga4: { measurement_id: 'G-XYZ1234567' } }, false, true))

    expect(resolved.showBanner).toBe(false)
  })

  // --- the banner is about cookies, not about analytics -------------------------------------
  //
  // `active` (load a tag) and `showBanner` (render the banner) are separate answers. They used to
  // be one boolean, which meant a client could not have a banner without Google Analytics — wrong
  // in itself, and it hid a real bug: the panel counted ANY non-empty integration value as "has
  // analytics" while these functions demand a real id shape, so a placeholder id produced a green
  // panel and a silently bannerless site.

  test('the banner shows with consent on and no analytics configured at all', () => {
    const resolved = resolveAnalytics(settings({}))

    expect(resolved).toMatchObject({ showBanner: true, active: false, gtmId: null, gtagId: null })
  })

  test('a placeholder id shows the banner but still loads no tag — the SMBP "AAA" case', () => {
    const resolved = resolveAnalytics(settings({ google_tag: { container_id: 'AAA' } }))

    expect(resolved).toMatchObject({ showBanner: true, active: false, gtmId: null, gtagId: null })
    expect(resolved.ignored).toEqual([{ source: 'google_tag.container_id', reason: 'malformed' }])
  })

  test('consent off hides the banner even when analytics is perfectly configured', () => {
    const resolved = resolveAnalytics(settings({ google_tag: { container_id: 'GTM-ABC1234' } }, false))

    expect(resolved).toMatchObject({ showBanner: false, active: false })
  })

  test('the fully configured case still turns both on together', () => {
    const resolved = resolveAnalytics(settings({ google_tag: { container_id: 'GTM-ABC1234' } }))

    expect(resolved).toMatchObject({ showBanner: true, active: true })
  })
})

// The raw JS interpolated into ConsentMode.astro's and CookieConsent.astro's own <script> tags —
// see its own docblock in core/analytics.ts for why it is duplicated rather than shared via a
// runtime import. Executing it needs a real browser (localStorage, window.gtag), which this
// project's unit suite deliberately does not provide (browser-observable behavior lives in
// tests/e2e/ or, for the interactive granular panel that a single fixed Playwright build cannot
// reach, hands-on verification — see CookieConsent.astro's own docblock for exactly what was
// checked). This test pins the SOURCE, not the behavior: a regression that silently drops one of
// the three function names would still typecheck and build, and only show up as a runtime
// `ReferenceError` in a real browser.
describe('CONSENT_SIGNALS_JS', () => {
  test('defines all three functions both components call by name', () => {
    expect(CONSENT_SIGNALS_JS).toMatch(/function readCookieConsent\(\)/)
    expect(CONSENT_SIGNALS_JS).toMatch(/function writeCookieConsent\(/)
    expect(CONSENT_SIGNALS_JS).toMatch(/function applyCookieConsent\(/)
  })

  test('applyCookieConsent sets all four Consent Mode v2 signals — the ad_* bug this fixes', () => {
    // dashboard #1226: the old inline script only ever updated analytics_storage; ad_storage,
    // ad_user_data and ad_personalization stayed denied forever, even after Accept.
    for (const signal of ['analytics_storage', 'ad_storage', 'ad_user_data', 'ad_personalization']) {
      expect(CONSENT_SIGNALS_JS).toContain(signal)
    }
  })
})

describe('warnAboutAnalytics', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  test('names the dropped field and the consent switch — the two silent failures, once per build', () => {
    const spy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const broken = settings({ google_tag: { container_id: 'nope' }, ga4: { measurement_id: 'G-XYZ1234567' } }, false)

    warnAboutAnalytics(resolveAnalytics(broken))

    const said = spy.mock.calls.map(([message]) => String(message)).join('\n')
    expect(said).toMatch(/google_tag\.container_id/)
    expect(said).toMatch(/cookie consent is off/)

    // Every route renders the layout; the log must not repeat this per page.
    const timesAfterFirstBuild = spy.mock.calls.length
    warnAboutAnalytics(resolveAnalytics(broken))
    expect(spy).toHaveBeenCalledTimes(timesAfterFirstBuild)
  })
})
