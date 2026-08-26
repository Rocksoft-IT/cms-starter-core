/**
 * Normalize a CMS `align` select into the alignment modifier class the section carries. Shared by
 * every block that exposes the field (rich_content, features, cards, testimonials, pricing_teaser,
 * pricing_table, hero) — the sibling of `backgroundClass()` in lib/background.ts, written the same
 * way for the same reasons.
 *
 * `left` is a REAL value, not a synonym for the default. Core's section header and hero centre by
 * design, so an editor needs a way to push them back that an absent attribute cannot express;
 * `default` is "whatever this block's own design does", which is a third state.
 *
 * `default` and an absent value yield undefined, so the section emits no modifier at all and
 * renders exactly as it did before the field was wired up (Astro drops an undefined entry from
 * `class:list`). That is what makes this additive: only a block an editor explicitly aligned
 * changes.
 *
 * SCOPE is the section HEADER, not the whole section — the field is documented as "Section header
 * alignment" (config/cms.php's $sectionAlign) and the source it reproduces centres a heading while
 * leaving the prose under it left. What the modifier actually moves is spelled out once, in the
 * `section-align` shortcut in core/uno.core.ts.
 *
 * A literal lookup, never a name assembled from the value (`is-align-${align}`): UnoCSS extracts
 * class names statically from source, so an assembled one generates no CSS — the failure
 * `verify:core-styles` check 5 exists to catch.
 */
// A Map rather than an object literal, for the reason spelled out in lib/background.ts: a plain
// lookup would resolve `align: "constructor"` up Object.prototype and hand a function back as a
// class name.
const ALIGN_CLASSES = new Map([
  ['left', 'is-align-left'],
  ['center', 'is-align-center'],
])

export function alignClass(align?: string | null): string | undefined {
  return ALIGN_CLASSES.get(align?.trim() ?? '')
}

/**
 * The classes an element carries in order to BE aligned: the axis key(s) it aligns on, plus the
 * modifier that says which way.
 *
 * Empty when the block leaves the choice at its default, so `class:list` drops the lot and an
 * unaligned block renders the same class attribute it always did — the additive half of the
 * contract, in one place rather than re-spelled at each call site. Six of them had it inline and
 * had already drifted into two idioms (a ternary-to-array and an `&&`-per-entry), differing only
 * in which axis keys they named.
 *
 * The axis keys are passed in rather than derived because only the element knows its own shape:
 * `align-text` sets text-align, `align-column` the align-items of a flex column, `align-row` the
 * justify-content of a flex row. See core/uno.core.ts.
 */
export function alignClasses(align: string | null | undefined, ...axes: string[]): string[] {
  const modifier = alignClass(align)

  return modifier ? [...axes, modifier] : []
}
