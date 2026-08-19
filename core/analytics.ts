// The one place that decides what the CMS's analytics ids mean — shared by ConsentMode.astro
// (which loads the tag) and CookieConsent.astro (which asks the visitor about it), so the banner
// can never appear for an id the loader refuses to emit, or stay hidden for one it accepts.
//
// Ids arrive from the panel's Integrations tab as free text, and the panel is not the only writer
// (MCP, a migration, a hand-fixed row). A value is interpolated into a <script>, so anything that
// does not match a known Google id shape is DROPPED rather than reflected — but never silently:
// `describeAnalytics()` renders the reason into the build log.

import type { SiteSettingsData } from '../lib/api'

/** GTM container id — loaded through gtm.js, and the only shape that takes the GTM loader. */
const GTM_ID = /^GTM-[A-Z0-9]+$/

/**
 * Everything gtag.js accepts: GA4 (`G-`), the current "Google tag" (`GT-`), Google Ads (`AW-`)
 * and Campaign Manager (`DC-`). `GT-` matters most: it is what Google hands out today under the
 * name the panel uses ("Google Tag"), and before this it was dropped as malformed.
 */
const GTAG_ID = /^(?:G|GT|AW|DC)-[A-Z0-9]+$/

export type AnalyticsIdKind = 'gtm' | 'gtag'

/**
 * Normalize and classify one raw id. Whitespace is trimmed and the value upper-cased — Google
 * ids are upper-case by construction, and a pasted `gtm-abc123` is a copy artefact, not a
 * different container. Returns null for anything unrecognized (including a UA- property id,
 * dead since 2023, and a bare number).
 */
export function classifyAnalyticsId(raw: unknown): { kind: AnalyticsIdKind; id: string } | null {
  if (typeof raw !== 'string') return null

  const id = raw.trim().toUpperCase()

  if (GTM_ID.test(id)) return { kind: 'gtm', id }
  if (GTAG_ID.test(id)) return { kind: 'gtag', id }

  return null
}

/** One CMS field that held an id the build could not use, and why. */
export interface IgnoredAnalyticsId {
  /** Dotted path in `site-settings.integrations`, e.g. `google_tag.container_id`. */
  source: string
  reason: 'malformed'
}

export interface ResolvedAnalytics {
  /** The single gate: consent is on AND at least one usable id exists. Both components read this. */
  active: boolean
  /** Whether the client switched cookie consent on (Settings → Privacy). */
  consentEnabled: boolean
  /**
   * Whether this client opted into the granular Statistics/Marketing banner layer (#1226) —
   * meaningless when `active` is false. Every client defaults to the plain Accept/Reject banner.
   */
  granular: boolean
  /** Container for the GTM loader, when one was configured. */
  gtmId: string | null
  /** Id for gtag.js — used only when there is no GTM container (a container usually hosts GA4). */
  gtagId: string | null
  /** Configured ids the build refuses to emit; drives the build-log warning. */
  ignored: IgnoredAnalyticsId[]
}

/**
 * Resolve what this build should emit from `GET /api/site-settings`.
 *
 * Routing is by ID SHAPE, not by provider slot: the panel labels the GTM provider "Google Tag",
 * so an editor pasting a `G-`/`GT-` id into `google_tag.container_id` is an expected mistake, and
 * one that used to produce a site with no analytics and no explanation. Whatever arrives, a GTM
 * container drives the GTM loader and a gtag id drives gtag.js.
 */
export function resolveAnalytics(settings: SiteSettingsData): ResolvedAnalytics {
  const candidates = [
    { source: 'google_tag.container_id', raw: settings.integrations?.google_tag?.container_id },
    { source: 'ga4.measurement_id', raw: settings.integrations?.ga4?.measurement_id },
  ]

  let gtmId: string | null = null
  let gtagId: string | null = null
  const ignored: IgnoredAnalyticsId[] = []

  for (const { source, raw } of candidates) {
    if (raw === undefined || raw === null || String(raw).trim() === '') continue

    const classified = classifyAnalyticsId(raw)

    if (classified === null) {
      ignored.push({ source, reason: 'malformed' })
      continue
    }

    // First one of each kind wins — two containers cannot both load.
    if (classified.kind === 'gtm') gtmId ??= classified.id
    else gtagId ??= classified.id
  }

  const consentEnabled = settings.cookie_consent?.enabled === true

  return {
    active: consentEnabled && (gtmId !== null || gtagId !== null),
    consentEnabled,
    granular: settings.cookie_consent?.granular === true,
    gtmId,
    gtagId,
    ignored,
  }
}

// Every route renders the layout, so a per-page warning would bury the build log. This module is
// evaluated once per build, so one flag is enough to make the message appear exactly once.
let warned = false

/**
 * Print, once per build, why a configured analytics id is not on the shipped site. The two
 * failure modes are invisible from the outside — a dropped id and a consent switch left off both
 * produce a page with no tag — and the deploy log is where someone looks first.
 */
export function warnAboutAnalytics(resolved: ResolvedAnalytics): void {
  if (warned) return
  warned = true

  for (const { source } of resolved.ignored) {
    console.warn(
      `[consent] integrations.${source} is not a recognized Google tag id (expected GTM-…, G-…, GT-…, AW-… or DC-…) — ignored.`,
    )
  }

  if (!resolved.consentEnabled && (resolved.gtmId !== null || resolved.gtagId !== null)) {
    console.warn(
      '[consent] an analytics id is configured but cookie consent is off (Settings → Privacy) — this build ships no analytics and no banner.',
    )
  }
}

/**
 * The per-category grant a visitor's choice resolves to. `marketing` covers all three `ad_*`
 * Consent Mode v2 signals as ONE unit — nothing in this stack lets a visitor grant one
 * independently of the other two (#1226's own scoping: that would need a per-cookie inventory
 * this project has no mechanism to generate).
 */
export interface CookieConsentValue {
  statistics: boolean
  marketing: boolean
}

/**
 * Raw JS, interpolated into an `is:inline` script by BOTH ConsentMode.astro (which replays a
 * stored choice on every page load, before analytics can fire) and CookieConsent.astro (which
 * writes a new choice on Accept/Reject/Allow-selection). Duplicated into each component's own
 * script tag rather than defined once and referenced from the other — inline scripts share
 * `window`, so that would work today (ConsentMode always mounts in `<head>`, before
 * CookieConsent), but it would make correctness depend on mount ORDER with no type-level
 * guarantee, silently breaking if that ever changed. One shared TEXT source instead: both copies
 * can never drift, and neither component depends on when the other one runs.
 *
 * `writeCookieConsent()` always stores the JSON object `{"statistics":<bool>,"marketing":<bool>}`,
 * in BOTH modes — Accept and Reject are just fixed values of the same split, so the write path
 * never branches on mode.
 *
 * `readCookieConsent()` is the tolerant half, and accepts either shape:
 *   - bare string `'accepted'` / `'rejected'` — stored before #1226, or by a site still on an
 *     older core; read as both-true / both-false
 *   - JSON `{"statistics":<bool>,"marketing":<bool>}` — everything written from here on
 * That tolerance is what makes the toggle safe in both directions: a visitor who consented before
 * this shipped is not re-prompted, and flipping a client between modes never invalidates a stored
 * choice. Returns null when nothing usable is stored (not yet decided — show the banner).
 *
 * `applyCookieConsent()` is the `ad_*` bug fix (#1226): the old code only ever granted
 * `analytics_storage` on accept, leaving the three `ad_*` signals bootstrapped `denied` forever.
 * This always sets all four together, split by category.
 */
export const CONSENT_SIGNALS_JS = `
function readCookieConsent(){
  try {
    var raw = localStorage.getItem('cookie-consent');
    if (raw === 'accepted') return {statistics:true,marketing:true};
    if (raw === 'rejected') return {statistics:false,marketing:false};
    if (raw) {
      var v = JSON.parse(raw);
      if (typeof v.statistics === 'boolean' && typeof v.marketing === 'boolean') return v;
    }
  } catch(e) {}
  return null;
}
function writeCookieConsent(v){
  try { localStorage.setItem('cookie-consent', JSON.stringify(v)); } catch(e) {}
}
function applyCookieConsent(v){
  if (!v || !window.gtag) return;
  window.gtag('consent','update',{
    analytics_storage: v.statistics ? 'granted' : 'denied',
    ad_storage: v.marketing ? 'granted' : 'denied',
    ad_user_data: v.marketing ? 'granted' : 'denied',
    ad_personalization: v.marketing ? 'granted' : 'denied'
  });
}
`.trim()
