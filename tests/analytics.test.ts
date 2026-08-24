import { afterEach, describe, expect, test, vi } from 'vitest'
import { CONSENT_SIGNALS_JS, classifyAnalyticsId, resolveAnalytics, warnAboutAnalytics } from '../core/analytics'
import {
  CONSENT_COOKIE_NAME,
  CONSENT_ENDPOINT_PATH,
  CONSENT_MAX_AGE_DAYS,
  consentEndpointSource,
} from '../core/consent.mjs'
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

  // dashboard #1470. The three above pin the SOURCE; these RUN it, because the whole point of the
  // change is which storage a given call touches, and no amount of string matching shows that.
  // The script is written for a browser and declares plain functions, so evaluating it in a
  // Function() body and returning the three names is the closest thing to how a page loads it.
  describe('as executed in a page', () => {
    // Only the two properties the script actually reads off a response. Typing this as the real
    // `fetch` would buy nothing and force every stub below through a cast.
    type FetchStub = (url: string, init: { body: string }) => Promise<{ status: number }>

    const load = (env: { cookie?: string; stored?: string | null; fetch?: FetchStub | null }) => {
      const store = new Map<string, string>()
      if (typeof env.stored === 'string') store.set(CONSENT_COOKIE_NAME, env.stored)

      const calls: Array<{ url: string; body: string }> = []
      const recording: FetchStub = (url, init) => {
        calls.push({ url, body: init.body })
        return Promise.resolve({ status: 204 })
      }

      // A `window` with no fetch is the third write path (an ancient browser), so `null` has to
      // mean "absent" and be distinguishable from "not specified".
      const win = { gtag: undefined, fetch: env.fetch === null ? undefined : (env.fetch ?? recording) }
      const doc = { cookie: env.cookie ?? '' }
      const storage = {
        getItem: (k: string) => store.get(k) ?? null,
        setItem: (k: string, v: string) => void store.set(k, v),
        removeItem: (k: string) => void store.delete(k),
      }

      const api = new Function(
        'window',
        'document',
        'localStorage',
        `${CONSENT_SIGNALS_JS}\nreturn { readCookieConsent: readCookieConsent, writeCookieConsent: writeCookieConsent };`,
      )(win, doc, storage)

      return { api, store, calls }
    }

    test('a fresh visit writes no consent record to script storage — it POSTs to our own origin', async () => {
      // The acceptance criterion. WebKit purges anything script storage holds after seven days,
      // so a value that never goes through the endpoint is a value Safari re-prompts for weekly.
      const { api, store, calls } = load({})

      expect(api.readCookieConsent()).toBeNull()

      api.writeCookieConsent({ statistics: true, marketing: false })
      await Promise.resolve()

      expect(store.size).toBe(0)
      expect(calls).toEqual([
        { url: CONSENT_ENDPOINT_PATH, body: '{"statistics":true,"marketing":false}' },
      ])
    })

    test('never assigns document.cookie — a script write would re-arm the very 7-day cap this escapes', () => {
      expect(CONSENT_SIGNALS_JS).not.toMatch(/document\.cookie\s*=/)
    })

    test('the cookie is read back, in both stored shapes', () => {
      const json = load({ cookie: `a=1; ${CONSENT_COOKIE_NAME}=%7B%22statistics%22%3Atrue%2C%22marketing%22%3Afalse%7D; b=2` })
      expect(json.api.readCookieConsent()).toEqual({ statistics: true, marketing: false })

      // Pre-#1226 bare strings still resolve, now over the new transport as well.
      const bare = load({ cookie: `${CONSENT_COOKIE_NAME}=accepted` })
      expect(bare.api.readCookieConsent()).toEqual({ statistics: true, marketing: true })
    })

    test('a record written by the PREVIOUS core still suppresses the banner, and is rewritten as a cookie', async () => {
      // The read-through migration: nobody is re-prompted BY the upgrade. CookieConsent.astro
      // opens the banner on a null read, so a non-null answer here is the banner staying shut.
      for (const stored of ['accepted', 'rejected', '{"statistics":true,"marketing":false}']) {
        const { api, calls } = load({ stored })

        const seen = api.readCookieConsent()
        await Promise.resolve()

        expect(seen).not.toBeNull()
        expect(calls).toHaveLength(1)
        expect(calls[0]).toEqual({ url: CONSENT_ENDPOINT_PATH, body: JSON.stringify(seen) })
      }
    })

    test('the migration leaves the old key alone — it is the fallback if the cookie does not stick', () => {
      const { api, store } = load({ stored: 'accepted' })
      api.readCookieConsent()
      expect(store.get(CONSENT_COOKIE_NAME)).toBe('accepted')
    })

    test('the cookie wins over a stale localStorage record, and costs no POST', () => {
      const { api, calls } = load({
        cookie: `${CONSENT_COOKIE_NAME}=rejected`,
        stored: 'accepted',
      })

      expect(api.readCookieConsent()).toEqual({ statistics: false, marketing: false })
      expect(calls).toHaveLength(0)
    })

    test('a failed POST falls back to localStorage rather than losing the answer', async () => {
      // Load-bearing, not defensive: a site whose endpoint is missing would otherwise store
      // nothing at all and re-prompt on EVERY page view — worse than the weekly re-prompt.
      const failures: FetchStub[] = [
        () => Promise.reject(new Error('offline')),
        () => Promise.resolve({ status: 404 }),
        // The one `r.ok` waved through: a host that serves `.php` as a static file answers 200
        // with the endpoint's own source and sets no cookie. Read as success, that stores nothing
        // and re-prompts on every page view — worse than the weekly re-prompt this fixes.
        () => Promise.resolve({ status: 200 }),
      ]

      for (const fetchImpl of failures) {
        const { api, store } = load({ fetch: fetchImpl })

        api.writeCookieConsent({ statistics: true, marketing: true })
        await Promise.resolve()
        await Promise.resolve()

        expect(store.get(CONSENT_COOKIE_NAME)).toBe('{"statistics":true,"marketing":true}')
      }
    })

    test('a browser with no fetch falls back too', () => {
      const { api, store } = load({ fetch: null })
      api.writeCookieConsent({ statistics: false, marketing: true })
      expect(store.get(CONSENT_COOKIE_NAME)).toBe('{"statistics":false,"marketing":true}')
    })
  })
})

// dashboard #1470. The endpoint is generated rather than committed precisely so the lifetime stays
// one constant, so what is worth pinning is that the constant reaches the header and that the four
// cookie attributes the fix depends on are the ones written.
describe('consentEndpointSource', () => {
  test('carries the configured lifetime into the header, in seconds', () => {
    expect(consentEndpointSource()).toContain(`time() + ${CONSENT_MAX_AGE_DAYS * 86400}`)
    expect(consentEndpointSource({ maxAgeDays: 180 })).toContain(`time() + ${180 * 86400}`)
  })

  test('is not HttpOnly — ConsentMode.astro has to read the value back before the tag loads', () => {
    expect(consentEndpointSource()).toContain("'httponly' => false")
  })

  test('makes Secure conditional — a preview domain is plain HTTP and would drop the cookie', () => {
    const php = consentEndpointSource()
    expect(php).toContain("'secure' => $https")
    expect(php).toContain('HTTP_X_FORWARDED_PROTO')
  })

  test('sets no Domain — a mis-derived registrable domain is rejected outright, and subdomains are out of scope', () => {
    expect(consentEndpointSource()).not.toContain("'domain'")
  })

  test('re-encodes the value from two validated booleans instead of echoing the body', () => {
    const php = consentEndpointSource()
    expect(php).toContain("is_bool($sent['statistics'])")
    expect(php).toContain("is_bool($sent['marketing'])")
    expect(php).toContain('$value = json_encode([')
    expect(php).toContain('http_response_code(400)')
  })

  test('answers only POST', () => {
    expect(consentEndpointSource()).toContain('http_response_code(405)')
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

// Cookiebot is a CMP, so it REPLACES the built-in banner rather than joining it — a page carrying
// both dialogs is not a state anyone wants, and it was reached for real: smbp hand-rolled the
// Cookiebot loader into its layout and deleted the CMS components to get out of it. Configuring a
// CBID is now the whole switch, and these pin what that switch does.
describe('resolveAnalytics with Cookiebot', () => {
  const CBID = '8e5d80e6-4a20-45b7-8e8f-2053acc7a971'

  test('a stored CBID suppresses the built-in banner', () => {
    const resolved = resolveAnalytics(settings({ cookiebot: { cbid: CBID } }))

    expect(resolved.cookiebotId).toBe(CBID)
    expect(resolved.showBanner).toBe(false)
  })

  test('clearing the CBID hands the banner back', () => {
    const resolved = resolveAnalytics(settings({ cookiebot: { cbid: '' } }))

    expect(resolved.cookiebotId).toBeNull()
    expect(resolved.showBanner).toBe(true)
  })

  // A client can hand consent to Cookiebot and never touch our own toggle; requiring it would mean
  // their tag silently never loads because of a banner they do not render.
  test('a tag still loads with our own consent toggle off', () => {
    const resolved = resolveAnalytics(settings({ cookiebot: { cbid: CBID }, ga4: { measurement_id: 'G-XYZ1234567' } }, false))

    expect(resolved).toMatchObject({ active: true, showBanner: false, gtagId: 'G-XYZ1234567' })
  })

  // Cookiebot with no analytics at all is a normal setup — the CBID alone still has to reach the
  // page, which is why ConsentMode renders the loader off `cookiebotId`, not off `active`.
  test('the CBID survives having no analytics id beside it', () => {
    const resolved = resolveAnalytics(settings({ cookiebot: { cbid: CBID } }, false))

    expect(resolved).toMatchObject({ cookiebotId: CBID, active: false })
  })

  // Same treatment a malformed GTM id gets: dropped and reported, never interpolated into <head>.
  test('a malformed CBID is ignored and reported rather than emitted', () => {
    const resolved = resolveAnalytics(settings({ cookiebot: { cbid: 'not-a-uuid' } }))

    expect(resolved.cookiebotId).toBeNull()
    expect(resolved.showBanner).toBe(true)
    expect(resolved.ignored).toContainEqual({ source: 'cookiebot.cbid', reason: 'malformed' })
  })
})
