# @rocksoft/cms-starter-core

Client sites pin this package by git tag (`package.json`:
`git+https://github.com/Rocksoft-IT/cms-starter-core.git#v0.6.0`), so a bump is a deliberate act —
this file is what tells you what the bump changes.

## v0.8.0 — a renamed page's old URL stops 404ing

> `v0.7.0`–`v0.7.3` shipped without entries here. This file resumes at `v0.8.0`; for what those
> carried, `gh api repos/Rocksoft-IT/cms-starter-core/compare/v0.6.0...v0.7.3` is the record.

### New — `cmsRedirects()`, and one line your `astro.config.mjs` must add

Renaming or moving a page in the CMS has always recorded the old address, and on a statically built
site that record did nothing: the redirect contract was request-time only (`GET /api/pages/{path}`
answers a vacated path with a 301), and a static build never asks — it renders every page from
`getPages()`, which lists only pages that exist. So the old URL was a route the build never emitted,
i.e. a hard 404, with the correct row sitting in the CMS the whole time (dashboard #1084).

Core now ships an Astro integration that fetches the whole map (`GET /api/redirects`, new in the
same change) at config time and merges it into `redirects`, so the build emits one redirect page per
entry — `<meta http-equiv="refresh">` plus `noindex` and a canonical at the destination, which is
what a static host can serve. An adapter that understands redirects (Netlify, Vercel, Cloudflare)
turns the same config into real 301s with no change here.

**What you must do:** add it to `integrations` in `astro.config.mjs`. Nothing else changes.

```js
import { cmsRedirects } from '@rocksoft/cms-starter-core/core/redirects.mjs'

export default defineConfig({
  integrations: [UnoCSS(), cmsRedirects()],
})
```

Safe to bump before the CMS side is deployed: a backend without the endpoint answers 404 and the
build carries on. Any other failure warns in the build log and carries on too — no redirects is the
state the site is in today, and that is not worth failing a content deploy over. The call is
bounded by a 15s timeout (an unresponsive CMS must not hang a build), and it is skipped entirely
for commands that emit no routes — so `astro check` gains no dependency on a reachable CMS.

**`test:smoke` skips redirect stubs.** A redirect page is deliberately minimal — a meta refresh,
`noindex` and a canonical, no `<html>` wrapper, no description, no share image — so the SEO smoke
check would fail three of its assertions on every one of them. It now recognises them by the
refresh tag and reports the count it skipped instead of checking them.

**Offline builds:** in `ASTRO_API_MOCK=1` the map is read from `src/fixtures/data/redirects.json`,
the fixture the `getPage()` contract already uses. Keys and values are normalized on the way in, so
an existing fixture written as `{"old-path": "/new-path"}` keeps working; new ones should use the
public shape the API emits, `{"/old-path/": "/new-path/"}`.

## v0.6.0 — one `cards` block, a `gallery`, and images sized to their slot

Four changes since v0.5.0. **One of them needs a look before you bump**: three block types are gone,
replaced by one.

### Changed — `nav_tiles`, `mainfeatures` and `info_cards` became `cards`

Three blocks carried the same shape — a repeater of items, each an icon and some text — and each
solved the same problems differently: three repeater names, two spellings of the link field, three
header sets, two ways to give an icon. An editor was picking a **block** in order to pick a **look**,
and the names did not say so. Now one block, whose `layout` field chooses the presentation:
`tiles` (compact, link-led), `cards` (icon chip, label, multi-line value), `steps` (numbered
sequence). The same content can be re-laid-out without being re-entered.

**What you must do:** nothing, if you register the core palette wholesale (`coreBlocks` from
`@rocksoft/cms-starter-core/core/blockRegistry`) — `cards` arrives with the bump. If your
`cms.config.ts` names `nav_tiles`, `mainfeatures` or `info_cards` explicitly, replace those three
entries with `cards`.

**Your content is converted for you.** A data migration on the CMS rewrites every persisted instance
in place — position preserved, the stable `data.id` reused, idempotent and reversible. Deploy order
does not matter either: this release still renders a `nav_tiles` block through the new component, so
a frontend bumped before the migration runs, or after, is correct either way.

Custom CSS naming the old shortcuts needs remapping — the vocabulary is now `section-cards` /
`cards-inner` / `cards-grid` / `card`, with `is-tiles` / `is-cards` / `is-steps` on the section.

### New — `gallery`

A grid of photos as ONE editable thing: an optional eyebrow/heading, a note beside the heading (a
caption for the SET, not per image), and a repeater of images each carrying its own alt text.
Composing six image blocks by hand gave an editor a puzzle instead of a gallery, and no way to
reorder the set at once. `anchor_id` makes it a scroll target, the same contract `team` and
`pricing_table` already offer. An entry with no image is dropped rather than rendered broken; a
missing alt yields an empty one — correct for a decorative tile, and better than inventing alt text
from a filename.

### New — images are served at the size their slot actually needs

Every image-bearing block rendered `<img src>` and nothing else, so the browser downloaded the
editor's original whatever size it was about to display it at — a 240px gallery tile could be handed
a 4000px file. Blocks now emit `srcset` and `sizes` together (neither is any use alone).

**Additive: nothing breaks and no client change is required.** Image fields stay URL strings; the
responsive attributes ride in a sibling object the API adds. A block whose image has no variants
renders exactly the tag it rendered before.

Two things worth knowing:

- **The `sizes` values are viewport fractions, not pixels** — deliberately. A slot's pixel width
  depends on `container-global`, which every site overrides, so a pixel baked into core would be
  right for one site and wrong for every other. A `vw` fraction slightly over-estimates the slot,
  which costs bytes; under-estimating would cost sharpness.
- **The smaller files have to exist.** New uploads and newly-authored blocks get them automatically;
  everything authored earlier needs one backfill pass per kind, run on the CMS — see **Developer
  Docs → Responsive images** in the panel. Until then a page renders exactly as it does today, just
  without a `srcset`.

### New — cookie consent, and two exports your fixtures module must add

A CMS-toggled consent banner, off unless the client enables it. Nothing to do for the live site.

**But the OFFLINE build breaks until you add two exports.** Core's `lib/api.ts` now imports
`getMockSiteSettings` and `getMockCookieConsent` from `~site/fixtures`, so `pnpm build:mock` fails
at bundle time with `"getMockSiteSettings" is not exported by "src/fixtures/index.ts"` — before any
page renders. Add both to `src/fixtures/index.ts`, mirroring the shipped default (consent off, no
authored copy):

```ts
import type { SiteSettingsData, CookieConsentData } from '@rocksoft/cms-starter-core/lib/api'

export async function getMockSiteSettings(): Promise<SiteSettingsData> {
  return { cookie_consent: { enabled: false, privacy_page_id: null }, integrations: {} }
}

export async function getMockCookieConsent(_locale: string): Promise<CookieConsentData | null> {
  return null
}
```

### One more thing a client may have to change

The upgrade notes above cover registering and rendering blocks. If your site also **reads** a block
— pulls one out of `page.blocks` by type to compose it by hand, rather than letting the renderer
handle it — then a retired type is a compile error in your own code, not just a registry entry.
smbp hit exactly this: its home composes the quick panel from what used to be `nav_tiles`. Grep your
`src/` for the three retired type names before bumping.

## v0.5.0 — documents block, CMS-managed footer, href normalization

Published 2026-07-28 without an entry here; recorded after the fact from the commits it carried, so
it is a summary rather than the usual upgrade note.

- **`documents` block** — a list of library files (PDF and friends) with resolved name, description,
  size and URL.
- **CMS-managed footer** — the footer becomes a global component edited in the panel (#232).
- **Internal hrefs normalized to the configured trailing slash**, so a CMS value authored without
  one stops 404ing under `trailingSlash: 'always'`.
- Core unit tests moved into the package under Vitest, and the SEO/render smoke preset now ships
  with core rather than with each site.

## v0.4.0 — an inline CTA on the FAQ block

**Additive: nothing breaks, and nothing must change in a client to take this.** Bump the pin and
`pnpm install`.

- **The `faq` block gains `cta_label` + `cta_href`** — an optional action beside the heading, for the
  person the answers did not help. Same field names as `promo_split`'s CTA, so an editor learns one
  vocabulary. Both halves are required: a label with nowhere to go, or a bare URL with no label,
  renders nothing rather than a dead link. An absolute `http(s)` target opens in a new tab with
  `rel="noopener noreferrer"` and gets an external glyph; a path stays in place.
- **New shortcuts:** `faq-header-row` (the header becomes a baseline-aligned row only when there is
  something to sit beside the heading) and `faq-action` (a quiet pill in core tokens — this is the way
  out, not the section's primary action). Remap `faq-action` to use your own button.
- Fill the link in the panel, on the FAQ block. It is content, not code.

Comment corrections across the package in the same release: ten references to the pre-flatten
multi-site layout (`sites/<slug>/`, a `SITE` env, `src/core/`) were still sitting in docstrings,
including on the public `CmsConfig` interface every client reads. `core/mock.ts` now also states why
it, and everything importing it, can only be loaded by a Vite build.

## v0.3.0 — core becomes a skeleton

Core no longer carries visual values. A block ships structure and semantic class names; every
width, rhythm and color comes from the site layer through one of three seams, and **`!important` is
no longer needed anywhere** (a CI check now rejects it). Scoped CSS in core dropped from 657 lines
to 76, across 3 files instead of 11.

Full rationale and phase-by-phase history: `context/changes/core-styling-seams/` in the
diligently-dashboard repo (which holds the backend and the starter dev tree). The contract itself:
`docs/starter.md` § "Styling contract".

### BREAKING — required to build

1. **`uno.config.ts` must be rewritten.** The shortcut vocabulary and the brand-color → theme
   mapping now ship WITH this package instead of being copy-pasted into every client repo (where
   they drifted silently — a client's `features-inner` said 900px while the component hardcoded
   1200px). Replace the whole file with:

   ```ts
   import { defineConfig, presetUno } from 'unocss'
   import { coreShortcuts, resolveThemeColors } from '@rocksoft/cms-starter-core/core/uno.core'
   import { cmsConfig } from './src/cms.config'
   import { siteUno } from './src/uno'

   export default defineConfig({
     presets: [presetUno()],
     content: { filesystem: ['node_modules/@rocksoft/cms-starter-core/**/*.{astro,ts}'] },
     // Inline literal: assigning a pre-typed theme object makes TypeScript infer UnoCSS's Theme
     // generic from it, which then rejects presetUno().
     theme: { colors: resolveThemeColors(cmsConfig.brand.colors) },
     // Site shortcuts last, so a site key overriding a core one wins.
     shortcuts: { ...coreShortcuts, ...siteUno.shortcuts },
   })
   ```

   Your site's own shortcuts stay exactly where they were, in `src/uno.ts`.

2. **`brand.colors` must define seven more keys.** Core blocks resolve them as theme colors, and
   UnoCSS emits nothing for an unknown color name — so a missing key used to mean a silently
   unstyled block. `resolveThemeColors()` now fails the build instead, naming every missing key:
   `primary-soft`, `surface`, `surface-alt`, `surface-tint`, `border`, `heading`, `eyebrow`.
   The authoritative list is `REQUIRED_PALETTE_KEYS` in `core/uno.core.ts`.

3. **`cmsConfig.layout` is gone.** Delete the entry from `src/cms.config.ts` (it is a type error
   otherwise). Geometry is not CMS configuration: widths live in `--layout-*` tokens and the
   container shortcuts, both overridable from the site layer. `custom_html` no longer builds an
   inline style from it — it uses the `custom-html-inner` container.

### BREAKING — renamed or removed keys

| Key | Change |
| --- | --- |
| `promo-split-inner` | **Now the container.** The tinted grid panel is `promo-split-panel`. A site overriding `promo-split-inner` for panel styling must move that override to `-panel`. |
| `section-promo-split` | No longer carries the container (it is `section-y` now). A site overriding it purely for rhythm is unaffected; one relying on its 1180px width should remap a container instead. |
| `section-content` | No longer carries the container; the measure moved to `content-inner`. |
| `step-number` | Removed. It was unused and its values contradicted the component's markup. |

### Changed visual defaults

These are deliberate: core carried one client's design values, which every other client then had to
fight. Restore any of them from your site layer by redefining the named shortcut.

- **One eyebrow treatment** (`eyebrow`, 13px/bold/0.08em/`text-eyebrow`) instead of five. All
  `*-eyebrow` keys compose it; `section-eyebrow` (used by ten blocks, previously 20px/normal) is now
  an alias.
- **One section header** (`section-header` + `core/SectionHeader.astro`) instead of six spellings of
  the same wrapper. Per-call-site `mt-2` / `text-text-primary` / `max-w-[680px]` variations are gone.
- **FAQ renders at the full content width** — it hardcoded `max-width: 760px` in scoped CSS, which
  no site could widen without `!important`.
- **Hero has one measure** instead of three nested ones (1080 / 1040 / 990).
- **Features**: the doubled vertical rhythm (`py-16` on both the section and its wrapper) is halved;
  the number badge takes `accent` instead of a hardcoded yellow from a `--color-jonquil` token that
  no palette defined.
- **The CTA badge no longer pulses.** A shared engine should not animate a client's badge.
- Client font utilities (`font-suse`, `font-montserrat`) are gone from core — they were absent from
  the Uno theme and emitted no CSS at all. Headings use `font-brand`, i.e. `--font-primary`.

### New

- **`@layer core`.** Core's remaining scoped CSS is layered, so an UNLAYERED site rule — and every
  Uno utility — beats it at any specificity. This is what makes existing `!important` in a site
  layer removable. Do NOT put your site CSS in a layer; that would weaken it.
- **`--layout-*` tokens** (`core/styles/tokens.css`): `--layout-container`, `-narrow`, `-prose`,
  `--layout-space-y`. Override in a site-level `:root` to retune every block at once.
- **`core/SectionHeader.astro`** with an optional `action` slot, for a header with an inline action
  beside the heading.
- **`pnpm verify:core-styles`** (`scripts/verify-core-styleless.mjs`, wired into CI by the mirror):
  rejects `!important`, a `max-width` in core's scoped CSS, scoped CSS outside `@layer core`, a
  non-neutral hex in core, and a class name built by interpolation. Expect it to fail on a client
  repo that still has `!important` — that is the point, and the three seams are the fix.

### Migrating a client site

1. Bump the pin to `#v0.3.0`, `pnpm install`.
2. Replace `uno.config.ts` (item 1 above) and delete `cmsConfig.layout` (item 3).
3. `pnpm build:mock` — it fails loudly with the palette keys you are missing (item 2). Add them.
4. `pnpm verify:core-styles` — drop each `!important` it reports, replacing it with a shortcut
   override in `src/uno.ts` or a token in your `:root`. A plain rule now beats core's scoped CSS.
5. `pnpm astro check && pnpm test:e2e`, then review the changed visual defaults above.
