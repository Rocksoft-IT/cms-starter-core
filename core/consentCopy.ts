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
 * The code this project writes a locale's LANGUAGE under: `de-at` → `de`, `nb-no` → `no`, `pl` → `pl`.
 *
 * Locale codes are the CMS's own (config/languages.php). Most are bare, but a code may carry a
 * region so that its URL prefix does (rocksoft.pl keeps `/de-at/` and `/nb-no/`); the language is
 * what this table is written in, so such a code reads its language's row before falling back to
 * English. Norwegian is the one language whose ISO subtags (`nb`, `nn`) differ from the code the
 * project carries it under (`no`), hence the map. Mirrors `Locale::baseLanguage()` in the
 * dashboard, which resolves the same table's panel placeholders — the two must not diverge.
 */
export function baseLanguage(locale: string): string {
  const language = locale.split('-', 1)[0].toLowerCase()
  return ({ nb: 'no', nn: 'no' } as Record<string, string>)[language] ?? language
}

/**
 * The built-in copy for `locale`, with any key that locale does not translate filled from its
 * language's row and then from English.
 */
export function consentCopyDefaults(locale: string): ConsentCopy {
  return {
    ...(TABLE[FALLBACK_LOCALE] as ConsentCopy),
    ...(TABLE[baseLanguage(locale)] ?? {}),
    ...(TABLE[locale] ?? {}),
  }
}
