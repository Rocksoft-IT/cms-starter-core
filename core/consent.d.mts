// Types for consent.mjs.
//
// Needed for the same reason redirects.d.mts is (see its own header): in this tree the package is
// a pnpm workspace link and `astro check` infers everything from the .mjs source, but in a client
// repo core is an installed git dependency, where TypeScript refuses a JS module with no
// declarations. core/analytics.ts imports the two constants from here, so unlike redirects this
// file is also read inside this tree.
//
// A `.mjs` pairs with `.d.mts`, not `.d.ts`. Keep the two in sync by hand: nothing checks this
// file against the source.

/** The consent cookie's name — the same string the superseded localStorage key used. */
export declare const CONSENT_COOKIE_NAME: string

/** Where the endpoint is emitted in the build output, and the URL it answers on. */
export declare const CONSENT_ENDPOINT_PATH: string

/** How long a stored answer lasts. The single place the consent lifetime is configured. */
export declare const CONSENT_MAX_AGE_DAYS: number

/** The endpoint's PHP source, as text, with the lifetime and cookie name baked in. */
export declare function consentEndpointSource(options?: { cookieName?: string; maxAgeDays?: number }): string
