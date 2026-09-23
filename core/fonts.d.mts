// Types for fonts.mjs.
//
// Needed for the same reason redirects.d.mts is: in a client repo core is an installed git
// dependency, and TypeScript refuses a JS module with no declarations — `astro.config.mjs`
// importing cmsFonts() would fail with ts(7016) and take `pnpm check` down. A `.mjs` pairs with
// `.d.mts`, not `.d.ts`. Keep the two in sync by hand — a declaration WINS module resolution, so an
// export missing here does not exist for any consumer (#2346). tests/declarations.test.ts asserts
// the two lists match.

import type { AstroIntegration } from 'astro'

/** The CSS variable core's `font-brand` shortcut reads, and the one this integration registers. */
export declare const BRAND_FONT_CSS_VARIABLE: '--font-primary'

/** The body face's variable (#1521) — published by the build, applied by the site's `body` rule. */
export declare const BODY_FONT_CSS_VARIABLE: '--font-body'

/** The `fonts.*` payload key each variable comes from, in registration order. */
export declare const FONT_ROLES: ReadonlyArray<{ key: string; cssVariable: string }>

/**
 * The family core's per-weight fallback for a catalog brand font is declared under (#2347) — first
 * in that role's `fallbacks`.
 */
export declare function fallbackFamilyName(name: string): string

/**
 * The @font-face rules of a catalog family's per-weight fallback (#2347), or `''` for a family
 * core has no metrics for. BrandFont.astro inlines them in <head>.
 */
export declare function fallbackFontFaceCss(name: string): string

/** The Vite `define` identifier that carries the fallback CSS from cmsFonts() to BrandFont.astro. */
export declare const BRAND_FONT_FALLBACK_CSS_DEFINE: '__CMS_BRAND_FONT_FALLBACK_CSS__'

/**
 * The CMS branding payload as Astro font families — one entry per role the client has chosen (in
 * FONT_ROLES order), or none when it has picked no font (or the payload cannot be read as one).
 */
export declare function toFontFamilies(raw: unknown, provider: unknown): Array<Record<string, unknown>>

/**
 * Astro integration: register the client's brand fonts so the build self-hosts them and emits
 * `--font-primary` and `--font-body`. Pair it with core's `<BrandFont />` in the layout head.
 *
 * `baseUrl` / `token` default to ASTRO_API_URL / ASTRO_API_TOKEN (env, or the site's .env);
 * `provider` defaults to Astro's Google font provider.
 */
export declare function cmsFonts(options?: { baseUrl?: string; token?: string; provider?: unknown }): AstroIntegration
