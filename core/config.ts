// Shared shape of a site's cms.config.ts — the seam a site edits INSTEAD of core code: locales,
// brand tokens, menu keys, the block component registry, and the page-type dispatch registry.
// ONE site per repo: `src/cms.config.ts` exports a `cmsConfig: CmsConfig`, and core reaches it only
// through the `~site` alias (→ `./src`, set in astro.config.mjs and mirrored in tsconfig.json) —
// never a literal path. There is no `sites/<slug>` and no `SITE` env; that multi-site selection
// machinery was removed.
// Secrets (API url/token) stay in env (ASTRO_API_URL / ASTRO_API_TOKEN); structure lives here.

import type { PageTypeConfig, ExtraRouteRule } from './routing'
import type { Block } from '../types/blocks'
// Type-only, and it has to be: ui-strings.ts reads `cmsConfig`, which is typed by this file. A
// value import would be a real cycle; a type import is erased before any module ever runs.
import type { CoreStrings } from './ui-strings'

export interface BrandTokens {
  /**
   * Brand palette. Keys become UnoCSS theme color names and `--color-<key>` CSS vars.
   *
   * The shared uno.config.ts shortcuts consume the CORE palette keys (primary, accent,
   * secondary, section-bg, text-primary, text-secondary, button-*, muted, body) — a site's
   * palette must define all of them (with its own brand values) for the core blocks to
   * render, and may add its own site-specific keys on top.
   */
  colors: Record<string, string>
}

/** Lazy component loader — return value's `.default` is an Astro component factory. */
export type BlockLoader = () => Promise<any>

export interface CmsConfig {
  /**
   * The locale that routes at the site root, unprefixed, and the fallback for missing
   * translations.
   *
   * There is deliberately no `locales` list here any more (#559). The enabled locales are a
   * per-client property of the CMS, read at build time from `GET /api/locales`; a copy in
   * project config could only ever disagree with it, and the disagreement is expensive —
   * the sitemap publishes one file per CMS locale, so a frontend building from a shorter
   * static list advertises URLs it never built. This value is the one locale the frontend
   * legitimately owns, because it decides URL shape rather than content: it is also used
   * before the API answers (html[lang] fallback) and by the mock build.
   */
  defaultLocale: string
  brand: BrandTokens
  /** Web-font stylesheets to load in <head>. Layout.astro emits a <link rel="preconnect">
   *  per `preconnect` entry (set `crossorigin` for origins serving the font binaries —
   *  browsers fetch those CORS, e.g. fonts.gstatic.com) and a <link rel="stylesheet"> per
   *  `stylesheets` URL. Omit for system fonts. Pair with `--font-*` overrides in the site's
   *  styles/site.css. */
  fonts?: {
    preconnect?: Array<{ href: string; crossorigin?: boolean }>
    stylesheets?: string[]
  }
  /** API menu keys consumed via GET /api/menus/{key}.
   *
   *  Optional since dashboard #1195: core defaults them to 'header' / 'footer' (see
   *  core/effectiveConfig.ts), which is what every site was writing out by hand. Declare a key
   *  only to point this site at a differently-named menu in the CMS. */
  menus?: {
    header?: string
    footer?: string
  }
  /** Block type → component loader. Keyed by the generated `Block['type']` union — a
   *  renamed/typo'd key here is now an `astro check` compile error instead of a silent
   *  runtime skip (a still-registered type simply not covered by any project isn't an
   *  error, hence `Partial`). Run `pnpm cms:types` after adding a block type in the backend. */
  blocks: Partial<Record<Block['type'], BlockLoader>>
  /** Page type → component + props shaper. Drives [..uri].astro dispatch via buildStaticPaths. */
  pageTypes?: Record<string, PageTypeConfig>
  /** Extra route builders for derived routes (e.g. a blog's category pages). */
  extraRoutes?: ExtraRouteRule[]
  /** Per-locale overrides for the few strings CORE says on its own behalf — the lightbox's close
   *  button, the carousel's arrows, the gallery zoom control's accessible name. Core ships `en` and
   *  `pl` and falls back to `en` for anything else (see core/ui-strings.ts), so this is here for a
   *  site whose locale core does not carry, or one that disagrees with a wording. Everything else a
   *  block renders is CMS content and is translated there, not here. */
  coreStrings?: Record<string, Partial<CoreStrings>>
  // No `layout` key: geometry is not CMS configuration. Widths and rhythm live in the frontend —
  // `--layout-*` tokens in core/styles/tokens.css and the container shortcuts in core/uno.core.ts,
  // both overridable from the site layer. This config carries only what the CMS owns.
  /** Static SEO / social-share fallbacks. Every field is a *fallback* only: the per-page
   *  `page.seo` object from the API (diligently-dashboard #469) always wins. These fill the
   *  gaps while the backend hasn't shipped that data yet (or for fields it leaves null). */
  seo?: {
    /** og:site_name fallback when the API doesn't resolve one. */
    siteName?: string
    /** Absolute origin (e.g. 'https://example.com'), no trailing slash. Feeds Astro's `site`,
     *  the canonical/og:url built from `page.path` when `page.seo.url` is absent, hreflang, and
     *  robots.txt's `Sitemap:` line. FALLBACK only: `ASTRO_SITE_URL` wins, and on a
     *  CMS-provisioned client site the deploy writes that from the client's domain
     *  (diligently-dashboard #1107) — so this covers offline/mock builds, `pnpm dev`, and a
     *  client with no domain yet. */
    siteUrl?: string
    /** Last-resort share image (absolute URL) when no page/section/client image resolves.
     *  Platforms require an absolute URL for og:image. */
    defaultImage?: string
    /** og:type fallback. Default: 'website'. */
    defaultType?: 'website' | 'article'
  }
}

/** Optional per-site UnoCSS additions (`src/uno.ts`) merged into the shared
 *  uno.config.ts — site shortcuts on top of the core set. */
export interface SiteUnoConfig {
  shortcuts?: Record<string, string>
}
