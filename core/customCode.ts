// The one place that decides what a client's CUSTOM CODE snippets mean — shared by
// CustomCode.astro (the renderer) and its tests. Kept apart from the component for the same
// reason analytics.ts is: the decision "does this snippet ship, and does it ship gated?" is the
// part worth testing, and a .astro file cannot be imported by vitest.
//
// Backend contract: packages/cms-core/src/Support/CustomScripts.php — `payloadFrom()` sends
// ENABLED snippets only, already normalized to `{placement, code, consent}`. Everything here is
// still defensive about the shape, because a build must survive an older panel, a half-written
// settings row, and a failed fetch (getSiteSettings resolves to a default object, never rejects).

import type { SiteSettingsData } from '../lib/api'
import { CONSENT_SIGNALS_JS } from './analytics'

/** Where a snippet is injected. Mirrors CustomScripts::PLACEMENTS. */
export type CustomCodePlacement = 'head' | 'body'

/** Mirrors CustomScripts::CONSENT_CATEGORIES. */
export type CustomCodeConsent = 'necessary' | 'statistics' | 'marketing'

const PLACEMENTS: readonly CustomCodePlacement[] = ['head', 'body']
const CONSENT_CATEGORIES: readonly CustomCodeConsent[] = ['necessary', 'statistics', 'marketing']

export interface CustomCodeSnippet {
  placement: CustomCodePlacement
  code: string
  consent: CustomCodeConsent
}

/** Why a stored snippet did not reach the shipped page — one build-log line each. The snippet
 *  itself is deliberately NOT carried: nothing downstream renders a refused snippet, and the raw
 *  pasted code has no business travelling further than the decision that refused it. */
export interface DroppedCustomCode {
  reason: string
}

export interface ResolvedCustomCode {
  /** `necessary` snippets: emitted verbatim, in place, on every page. */
  immediate: CustomCodeSnippet[]
  /** `statistics` / `marketing` snippets: emitted INERT, activated once the visitor grants that
   *  category. Non-empty only when the client runs the consent banner. */
  gated: CustomCodeSnippet[]
  /** Stored, enabled, and deliberately NOT shipped by this build. */
  dropped: DroppedCustomCode[]
}

function isPlacement(value: unknown): value is CustomCodePlacement {
  return typeof value === 'string' && (PLACEMENTS as readonly string[]).includes(value)
}

function isConsent(value: unknown): value is CustomCodeConsent {
  return typeof value === 'string' && (CONSENT_CATEGORIES as readonly string[]).includes(value)
}

/**
 * Read the raw `custom_scripts` payload into typed snippets. A row that is not usable is DROPPED
 * rather than coerced: a snippet whose placement we cannot read is a snippet we cannot promise to
 * put anywhere, and guessing `head` for it would ship arbitrary JS to a place the operator never
 * chose. (The backend already defaults a blank placement to `head` on WRITE, where the operator
 * can see the result — that is a different question from silently repairing wire data on READ.)
 */
export function readCustomCode(settings: SiteSettingsData): CustomCodeSnippet[] {
  const memo = readMemo.get(settings)

  if (memo !== undefined) return memo

  const out = validateCustomCode(settings.custom_scripts)

  readMemo.set(settings, out)

  return out
}

// getSiteSettings() hands back ONE object for the whole build, and CustomCode.astro is mounted
// twice on every page — so without this the same array is re-validated 2× per page. lib/api.ts
// memoizes getMenu/getPages for exactly this reason; keyed on the settings object so a different
// one (a test fixture) is never served another's answer.
const readMemo = new WeakMap<SiteSettingsData, CustomCodeSnippet[]>()

function validateCustomCode(raw: SiteSettingsData['custom_scripts']): CustomCodeSnippet[] {
  if (!Array.isArray(raw)) return []

  const out: CustomCodeSnippet[] = []

  for (const row of raw) {
    if (typeof row !== 'object' || row === null) continue

    const { placement, code, consent } = row as Record<string, unknown>

    if (typeof code !== 'string' || code.trim() === '') continue
    if (!isPlacement(placement)) continue

    out.push({
      placement,
      code,
      // An unreadable category is treated as the most restrictive one that still ships behind a
      // gate, never as `necessary` — a bad value must not become a reason to bypass consent.
      consent: isConsent(consent) ? consent : 'marketing',
    })
  }

  return out
}

/**
 * Whether THIS mount emits the activator. The activator's scan is document-wide and it self-latches
 * on `window.__cmsCustomCode`, so a second copy is dead bytes — a client with gated snippets in
 * both placements would otherwise inline the whole script (its embedded CONSENT_SIGNALS_JS
 * included) twice on every page. Exactly one mount emits it, and that one is `head`: it is parsed
 * first, and it waits for DOMContentLoaded before touching anything in `<body>`.
 */
export function emitsCustomCodeActivator(
  settings: SiteSettingsData,
  placement: CustomCodePlacement,
): boolean {
  if (placement !== 'head') return false

  return PLACEMENTS.some((each) => resolveCustomCode(settings, each).gated.length > 0)
}

/**
 * Split this placement's snippets into what the page emits now, what it emits behind the consent
 * gate, and what it refuses to emit at all.
 *
 * The refusal is the important half. A `statistics`/`marketing` snippet on a client that has NOT
 * enabled the cookie banner has no mechanism to ever be granted — there is no banner to grant it —
 * so emitting it would mean tracking every visitor with no consent path whatsoever. ConsentMode
 * takes the same position for the typed Google tags ("consent off ⇒ this build ships no
 * analytics"), and custom code is the escape hatch AROUND those typed providers: if it did not
 * take the same position, pasting a GTM container here would be a supported way to defeat the
 * consent system the rest of this stack exists to enforce.
 */
export function resolveCustomCode(
  settings: SiteSettingsData,
  placement: CustomCodePlacement,
): ResolvedCustomCode {
  const consentEnabled = settings.cookie_consent?.enabled === true
  const resolved: ResolvedCustomCode = { immediate: [], gated: [], dropped: [] }

  for (const snippet of readCustomCode(settings)) {
    if (snippet.placement !== placement) continue

    if (snippet.consent === 'necessary') {
      resolved.immediate.push(snippet)
      continue
    }

    if (!consentEnabled) {
      resolved.dropped.push({
        reason: `tagged "${snippet.consent}" but cookie consent is off (Settings → Privacy), so a visitor has no way to grant it`,
      })
      continue
    }

    resolved.gated.push(snippet)
  }

  return resolved
}

// One line per build per placement, like warnAboutAnalytics — the two ways this feature fails
// silently from the outside are a snippet that was dropped and a snippet that ships to everyone.
const warned = new Set<string>()

export function warnAboutCustomCode(resolved: ResolvedCustomCode, placement: CustomCodePlacement): void {
  if (warned.has(placement)) return
  warned.add(placement)

  for (const { reason } of resolved.dropped) {
    console.warn(`[custom-code] a <${placement}> snippet was NOT shipped: ${reason}.`)
  }

  if (resolved.immediate.length > 0) {
    console.warn(
      `[custom-code] ${resolved.immediate.length} snippet(s) tagged "necessary" ship in <${placement}> on every page, before any consent — make sure that is what they are.`,
    )
  }
}

/** Test seam: the module-level warn-once latch outlives a vitest file otherwise. */
export function resetCustomCodeWarnings(): void {
  warned.clear()
}

/**
 * Raw JS, interpolated into CustomCode.astro's own `is:inline` script — the same arrangement, and
 * for the same reason, as CONSENT_SIGNALS_JS in core/analytics.ts: it lives here as TEXT so a unit
 * test can pin it, since a regression that drops one attribute name would still typecheck, still
 * build, and only surface as a snippet that silently never runs in a real browser.
 *
 * It turns a consented `<template data-cms-custom-code="statistics|marketing">` into a running
 * script. Two things make that less obvious than it looks:
 *
 *  - A <script> that was parsed inside a <template> — or simply moved into the document — carries
 *    the "already started" flag and will NEVER execute. Each one has to be replaced by a freshly
 *    created node carrying the same attributes and body. This is the whole reason the activator
 *    exists rather than a one-line `insertBefore(tpl.content)`.
 *  - The `<head>` copy runs before `<body>` has been parsed, so it cannot activate a footer
 *    snippet on the spot. It waits for DOMContentLoaded, and a single `window.__cmsCustomCode`
 *    latch keeps the two mounts from doing the work twice.
 *
 * It reads the stored choice through CONSENT_SIGNALS_JS's own `readCookieConsent()` rather than
 * re-parsing the cookie, so a snippet and a Google tag can never disagree about what the visitor
 * consented to, and it listens for the `cms:consent` event CookieConsent.astro fires on every
 * Accept / Reject / Allow-selection — the only signal that a grant happened during THIS page view.
 */
export const CUSTOM_CODE_ACTIVATOR_JS = `
${CONSENT_SIGNALS_JS}
(function(){
  if (window.__cmsCustomCode) return;
  window.__cmsCustomCode = 1;
  function activate(v){
    if (!v) return;
    var tpls = document.querySelectorAll('template[data-cms-custom-code]');
    for (var i = 0; i < tpls.length; i++) {
      var tpl = tpls[i];
      if (tpl.hasAttribute('data-cms-activated')) continue;
      if (!v[tpl.getAttribute('data-cms-custom-code')]) continue;
      tpl.setAttribute('data-cms-activated', '');
      var frag = tpl.content.cloneNode(true);
      // A cloned <script> is inert — swap each one for a fresh node carrying the same attributes
      // and body, which is what makes the browser run it.
      var olds = frag.querySelectorAll('script');
      for (var j = 0; j < olds.length; j++) {
        var old = olds[j];
        var s = document.createElement('script');
        for (var k = 0; k < old.attributes.length; k++) {
          s.setAttribute(old.attributes[k].name, old.attributes[k].value);
        }
        s.text = old.textContent;
        old.parentNode.replaceChild(s, old);
      }
      tpl.parentNode.insertBefore(frag, tpl);
    }
  }
  function replay(){ try { activate(readCookieConsent()); } catch(e) {} }
  // The head copy runs before <body> exists, so a stored grant is replayed once the document is
  // parsed; a grant made during this page view arrives on the event CookieConsent.astro fires.
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', replay);
  } else {
    replay();
  }
  document.addEventListener('cms:consent', function(e){ try { activate(e.detail); } catch(err) {} });
})();
`.trim()
