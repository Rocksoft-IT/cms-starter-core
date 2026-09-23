// Types for siteOrigin.mjs.
//
// Needed for the same reason core/redirects.d.mts is: in this tree the package is a pnpm workspace
// link and `astro check` reads the .mjs source, but in a CLIENT repo it is an installed git
// dependency, where TypeScript refuses a JS module with no declarations — and `astro.config.mjs`,
// which imports this, is exactly the file that failure takes down (ts(7016)).
//
// A `.mjs` pairs with `.d.mts`, not `.d.ts`. Keep the two in sync by hand — a declaration WINS
// module resolution, so an export missing here does not exist for any consumer (#2346).
// tests/declarations.test.ts asserts the two lists match.

/**
 * The first usable origin among `candidates`, trimmed and without trailing slashes — or `null`
 * when none of them holds a non-empty string. Order is the caller's statement of precedence.
 */
export declare function resolveSiteOrigin(...candidates: Array<string | undefined | null>): string | null
