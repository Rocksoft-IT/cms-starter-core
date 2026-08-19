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
