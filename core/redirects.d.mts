// Types for redirects.mjs.
//
// Needed only because of HOW a client repo consumes core. In this tree the package is a pnpm
// workspace link, so `astro check` reads the .mjs source and infers everything; in a client repo
// it is an installed git dependency, where TypeScript refuses a JS module with no declarations —
// `astro.config.mjs` importing cmsRedirects() failed with ts(7016) and took the whole `pnpm check`
// gate down. So the file that needs this is the one place it could not be tested from.
//
// A `.mjs` pairs with `.d.mts`, not `.d.ts` — TypeScript matches the declaration extension to the
// implementation's. Keep the two in sync by hand: nothing checks this file against the source.

import type { AstroIntegration } from 'astro'

/** A path with a leading and trailing slash, the shape both ends of a redirect are stored in. */
export declare function publicPath(value: string): string

/** The CMS payload as an Astro `redirects` map — normalized, with unusable entries dropped. */
export declare function toAstroRedirects(raw: unknown): Record<string, string>

/**
 * Astro integration: fetch the CMS's old -> new route map and merge it into `config.redirects`.
 * `baseUrl` / `token` default to ASTRO_API_URL / ASTRO_API_TOKEN (env, or the site's .env).
 */
export declare function cmsRedirects(options?: { baseUrl?: string; token?: string }): AstroIntegration
