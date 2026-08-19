import { afterEach, describe, expect, test, vi } from 'vitest'
import { classifyAnalyticsId, resolveAnalytics, warnAboutAnalytics } from '../core/analytics'
import type { SiteSettingsData } from '../lib/api'

// dashboard #1191 — a stored GA4/GTM id reached the API and then vanished: the loader accepted
// only `GTM-…` and `G-…`, dropped everything else without a word, and the banner used a different
// (looser) definition of "this site has analytics" than the loader did. These assert the shared
// resolver both components now read, in isolation; the rendered-output half is
// tests/e2e/consent-analytics.spec.ts.

const settings = (integrations: Record<string, Record<string, string>>, consent = true): SiteSettingsData => ({
  cookie_consent: { enabled: consent, privacy_page_id: null },
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
