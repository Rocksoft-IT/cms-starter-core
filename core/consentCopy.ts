// Built-in cookie-banner copy, resolved per locale (#521 / #1226 follow-up).
//
// This is the wording a visitor sees while the translatable `cookie_consent` global component is
// unauthored — which, for a client who has just switched consent on, is every visitor. It used to
// be a chain of `copy?.x || 'English string'` inline in CookieConsent.astro, so EVERY locale fell
// back to English: a Polish or Norwegian site showed an English banner until someone typed the
// translation, on the one piece of chrome that exists for legal reasons rather than marketing.
// Authored copy still wins over all of this; these are only the fallbacks.
//
// consent-copy.json beside this file is the source of truth, kept as pure data (locale -> key ->
// string, nothing else) so both sides can read it: this module resolves it for the Astro component,
// and the dashboard mirrors it into config/cms.php as the per-locale placeholders on the copy
// fields, pinned by CookieConsentDefaultsAreMirroredInConfigTest. Two rules when editing it: `en`
// must carry every key, and any other locale may translate a subset.
//
// The `with { type: 'json' }` attribute is not decoration: Vite/Astro resolve a bare JSON import
// fine, but Node's own ESM loader refuses one without it — and this module is imported directly by
// node in tooling and unit tests. Cheap portability, no build-time difference.
import defaults from './consent-copy.json' with { type: 'json' }

/**
 * Every key the banner renders, DERIVED from the English entry rather than hand-listed: the key set
 * already exists twice (the JSON, and `cookie_consent`'s extra_fields in the CMS config, pinned to
 * each other by CookieConsentDefaultsAreMirroredInConfigTest), and a third hand-kept copy would be
 * the one nothing checks. Renaming a key in the JSON now moves this type with it.
 */
export type ConsentCopy = { [K in keyof (typeof defaults)['en']]: string }

/** The locale every other one falls back to, key by key. Its entry must stay complete. */
const FALLBACK_LOCALE = 'en'

const TABLE: Record<string, Partial<ConsentCopy>> = defaults

/**
 * The built-in copy for `locale`, with any key that locale does not translate filled from English.
 *
 * Locale codes are the CMS's own (config/languages.php) and are bare — `no`, never `nb` or `no-NO` —
 * because that is what Layout.astro threads through to this component. So there is deliberately no
 * regional-tag or language-alias handling here: it would be guessing logic no caller exercises. A
 * site that wants to pass a tag of its own should normalize it at the prop boundary.
 */
export function consentCopyDefaults(locale: string): ConsentCopy {
  return { ...(TABLE[FALLBACK_LOCALE] as ConsentCopy), ...(TABLE[locale] ?? {}) }
}
