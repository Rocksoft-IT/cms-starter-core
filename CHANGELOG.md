# @rocksoft/cms-starter-core

Client sites pin this package by git tag (`package.json`:
`git+https://github.com/Rocksoft-IT/cms-starter-core.git#v0.4.0`), so a bump is a deliberate act —
this file is what tells you what the bump changes.

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
