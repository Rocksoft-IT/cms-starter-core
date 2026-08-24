// The consent record's TRANSPORT: a first-party cookie set by a `Set-Cookie` response header from
// the site's own origin (dashboard #1470). This module owns the cookie's name, its lifetime and
// the source of the endpoint that sets it; consentEndpoint.mjs is the integration that writes that
// source into the build.
//
// Why this file has to exist at all. WebKit purges script-written storage — localStorage,
// sessionStorage, IndexedDB — after seven days of Safari use without interaction with the site,
// and caps cookies written by `document.cookie` the same way. The cap is keyed to HOW the value
// was written, not to which API reads it, so the previous `localStorage.setItem('cookie-consent')`
// re-prompted every Safari visitor roughly weekly WHATEVER lifetime we configured, and swapping
// it for `document.cookie` would have changed nothing. A cookie set by a `Set-Cookie` header from
// a genuine first-party origin (no CNAME cloaking) is exempt, and is the only storage on a static
// site that survives longer than a week in Safari. That is what makes CONSENT_MAX_AGE_DAYS below
// a real number instead of an aspiration.
//
// Why a .php file. The built site is static (astro.config.mjs declares no adapter and no
// `output: 'server'`), so there is no JS runtime on the site's own origin, and the panel API is a
// different origin which therefore cannot `Set-Cookie` on the site's domain. But every client
// frontend is a RunCloud web app created with `phpVersion: php82rc`, `stack: hybrid` and
// `publicPath: /public_html` (app/Services/RunCloud/RunCloudService.php), and `public_html` is the
// symlink deploy.sh flips onto the release directory — which is the built `dist/` itself
// (`mv dist "$RELEASE_PATH"`). So a .php file emitted into the build output is already reachable
// at `https://<site>/consent.php`, executed by PHP 8.2, on the site's own domain, with no new
// infrastructure. This is the "edge function" the consent plan's §6 named and then dismissed.
//
// Plain .mjs with a hand-written .d.mts sibling, for the same two reasons redirects.mjs is:
// astro.config.mjs loads it in Node before the Vite pipeline exists, and a client repo consumes
// core as an installed git dependency where TypeScript refuses a JS module with no declarations.
// core/analytics.ts imports CONSENT_COOKIE_NAME / CONSENT_ENDPOINT_PATH from here so the browser
// half and the server half can never disagree about the name or the URL. That import is also why
// this module touches no `node:` builtin and the integration that writes the file lives next door
// in consentEndpoint.mjs: analytics.ts is only ever evaluated at build time today, but it is the
// module a future client-side import would reach for first, and `node:fs` in that graph would
// break the build in a way that has nothing to do with consent.

/**
 * The cookie's name — unchanged from the localStorage key it replaces, so the read-through
 * migration in analytics.ts is a change of SOURCE and not also a change of name, and so the
 * cookie declaration's `<code>cookie-consent</code>` stays accurate.
 */
export const CONSENT_COOKIE_NAME = 'cookie-consent'

/** Where the endpoint is emitted, relative to the built site root. Also the URL it answers on. */
export const CONSENT_ENDPOINT_PATH = '/consent.php'

/**
 * How long a stored answer lasts — THE single configurable constant (#1470's third acceptance
 * criterion). 12 months is the consent plan's defensible default (§10.4(3)): the number is
 * genuinely free across the EEA (6–24 months; none of PL/NO/DE names one), and 12 matches
 * Cookiebot, so our simpler tier does not carry twice the banner exposure of the Cookiebot tier.
 *
 * Picking the number was explicitly deferred until this file existed, because before a server-set
 * cookie Safari overrode whatever we chose after seven days. It is now a config value: change it
 * here, and the next build of every site is what a Safari visitor actually gets.
 *
 * One lifetime for both answers, deliberately. Every rule with force constrains re-asking those
 * who REFUSED (Garante: at least six months) and nothing constrains re-asking those who accepted,
 * so a symmetric lifetime is the floor. If the two ever diverge, refusal must be >= acceptance.
 */
export const CONSENT_MAX_AGE_DAYS = 365

/**
 * The endpoint's source, as text.
 *
 * Four decisions in it are load-bearing and are the reason it is generated from here rather than
 * hand-kept as a static asset:
 *
 *   - `httponly` is FALSE. It has to be: ConsentMode.astro's inline head script reads the value
 *     back to replay a returning visitor's grants BEFORE the tag loads. HttpOnly would hide it
 *     from exactly the code that needs it. Nothing secret is in the cookie — it is two booleans
 *     the visitor themselves chose — so this costs nothing.
 *   - `secure` is conditional, not always on. RunCloud preview domains are served over plain HTTP
 *     (`http://<app>.<id>.p.temp-site.link`), and a browser silently DROPS a Secure cookie on an
 *     insecure origin — consent would appear to store and never come back, on precisely the
 *     domains a new site is reviewed on.
 *   - No `domain` attribute, so the cookie is host-only. Sending the registrable domain would
 *     extend it across subdomains, but deriving one from HTTP_HOST needs the Public Suffix List:
 *     a naive "last two labels" yields `.co.uk` / `.com.pl` for clients on those, which the
 *     browser REJECTS OUTRIGHT — no cookie at all, worse than today, and silent. Cross-subdomain
 *     consent is out of scope for #1470 (its own "Not in scope"), so this trades a feature nobody
 *     asked for against a failure mode nobody would notice.
 *   - The value is re-encoded server-side from the two validated booleans. The request body is
 *     never echoed into the response, so no input reaches a header.
 *
 * @param {{ cookieName?: string, maxAgeDays?: number }} [options]
 * @returns {string} PHP source, ready to write into the build output.
 */
export function consentEndpointSource({ cookieName = CONSENT_COOKIE_NAME, maxAgeDays = CONSENT_MAX_AGE_DAYS } = {}) {
  const name = JSON.stringify(cookieName)
  const maxAge = Math.round(maxAgeDays * 86400)

  return `<?php

// GENERATED at build time by @rocksoft/cms-starter-core (core/consent.mjs) — do not edit here,
// edit that file and rebuild. Sets the first-party cookie holding the visitor's cookie-consent
// answer, via a Set-Cookie response header, so WebKit does not purge it after seven days the way
// it purges anything written by script (dashboard #1470).

declare(strict_types=1);

// A consent answer is per-visitor and must never be held by a proxy or the browser cache.
header('Cache-Control: no-store');

if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') {
    header('Allow: POST');
    http_response_code(405);
    exit;
}

// Bounded read: the only valid body is a two-key JSON object, so anything approaching this size
// is not a body worth parsing.
$raw = file_get_contents('php://input', false, null, 0, 1024);
$sent = json_decode(is_string($raw) ? $raw : '', true);

// Strict: both keys present and actually booleans. A truthy string or a 1 is a caller that does
// not know the contract, and guessing what it meant is how a "rejected" becomes an "accepted".
if (
    !is_array($sent)
    || !array_key_exists('statistics', $sent) || !is_bool($sent['statistics'])
    || !array_key_exists('marketing', $sent) || !is_bool($sent['marketing'])
) {
    http_response_code(400);
    exit;
}

// Rebuilt from the two validated booleans rather than passed through, so nothing the caller sent
// can reach the Set-Cookie header. Key order is fixed and matches what the browser half writes.
$value = json_encode([
    'statistics' => $sent['statistics'],
    'marketing' => $sent['marketing'],
]);

// See core/consent.mjs for why each of these is what it is — especially httponly=false (the head
// script has to read this back) and the conditional secure (preview domains are plain HTTP).
$https = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off')
    || (($_SERVER['HTTP_X_FORWARDED_PROTO'] ?? '') === 'https')
    || ((int) ($_SERVER['SERVER_PORT'] ?? 0) === 443);

setcookie(${name}, (string) $value, [
    'expires' => time() + ${maxAge},
    'path' => '/',
    'secure' => $https,
    'httponly' => false,
    'samesite' => 'Lax',
]);

http_response_code(204);
`
}
