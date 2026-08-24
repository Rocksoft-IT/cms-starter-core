// Types for fonts.mjs.
//
// Needed for the same reason redirects.d.mts is: in a client repo core is an installed git
// dependency, and TypeScript refuses a JS module with no declarations — `astro.config.mjs`
// importing cmsFonts() would fail with ts(7016) and take `pnpm check` down. A `.mjs` pairs with
// `.d.mts`, not `.d.ts`. Keep the two in sync by hand: nothing checks this file against the source.

import type { AstroIntegration } from 'astro'

/** The CSS variable core's `font-brand` shortcut reads, and the one this integration registers. */
export declare const BRAND_FONT_CSS_VARIABLE: '--font-primary'

/**
 * The CMS branding payload as Astro font families — one entry, or none when the client has picked
 * no font (or the payload cannot be read as one).
 */
export declare function toFontFamilies(raw: unknown, provider: unknown): Array<Record<string, unknown>>

/**
 * Astro integration: register the client's brand font so the build self-hosts it and emits
 * `--font-primary`. Pair it with core's `<BrandFont />` in the layout head.
 *
 * `baseUrl` / `token` default to ASTRO_API_URL / ASTRO_API_TOKEN (env, or the site's .env);
 * `provider` defaults to Astro's Google font provider.
 */
export declare function cmsFonts(options?: {
  baseUrl?: string
  token?: string
  provider?: unknown
}): AstroIntegration
