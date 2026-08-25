/**
 * Normalize a CMS `background` select into the band modifier class the section carries. Shared by
 * every block that exposes the field (rich_content, features, cards, testimonials, pricing_teaser,
 * pricing_table) — the same shared-field pattern `sectionAnchorId()` follows in lib/anchor.ts.
 *
 * `default` and an absent value yield undefined, so the section emits no modifier at all and
 * renders exactly as it did before the field was wired up (Astro drops an undefined entry from
 * `class:list`). That is what makes this additive: only a band an editor explicitly coloured
 * changes.
 *
 * A literal lookup, never a name assembled from the value (`is-${background}`): UnoCSS extracts
 * class names statically from source, so an assembled one generates no CSS — the failure
 * `verify:core-styles` check 5 exists to catch.
 *
 * The classes are hooks, not colors. Core paints neutral defaults for them (the `section-band`
 * shortcut in core/uno.core.ts plus the `--band-*` tokens in core/styles/tokens.css); a site
 * retunes any band by redefining those tokens or that shortcut — see docs/starter.md
 * § "Styling contract".
 */
// A Map rather than an object literal: a plain lookup would resolve `background: "constructor"`
// (or any other Object.prototype key) up the prototype chain and hand a function back as a class
// name. `get` on an unknown key is undefined, which is also what an option the CMS gains before a
// core bump should render as — no band, not a class nothing styles.
const BAND_CLASSES = new Map([
  ['light', 'is-light'],
  ['muted', 'is-muted'],
  ['brand', 'is-brand'],
  ['dark', 'is-dark'],
])

export function backgroundClass(background?: string | null): string | undefined {
  return BAND_CLASSES.get(background?.trim() ?? '')
}
