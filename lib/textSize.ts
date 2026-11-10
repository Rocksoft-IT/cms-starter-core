/**
 * Normalize a CMS `text_size` select into the modifier class a section carries. Shared by every
 * block that exposes the field, the same shared-field pattern `backgroundClass()` follows in
 * lib/background.ts and `alignClass()` in lib/align.ts.
 *
 * `default`, an absent value and anything unrecognised all yield `undefined`, so `class:list`
 * drops it and a block that never set a size renders the class attribute it always did.
 *
 * A literal lookup, never a name assembled from the value (`is-size-${size}`): UnoCSS extracts
 * class names statically from source, so an assembled one generates no CSS. The three modifier
 * names below are written out in the `section-band` shortcut in core/uno.core.ts, which is what
 * paints them: each sets `--type-scale`, and every core font size multiplies by it.
 */
// A Map rather than an object literal, for the reason spelled out in lib/background.ts: a plain
// lookup would resolve `text_size: "constructor"` up Object.prototype and hand a function back as
// a class name.
const TEXT_SIZE_CLASSES = new Map([
  ['sm', 'is-size-sm'],
  ['lg', 'is-size-lg'],
  ['xl', 'is-size-xl'],
])

export function textSizeClass(size?: string | null): string | undefined {
  return TEXT_SIZE_CLASSES.get(size?.trim() ?? '')
}
