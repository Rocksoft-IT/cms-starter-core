/**
 * Normalize a CMS `variant` select into the presentation modifier class the block carries. The
 * third member of the family `lib/background.ts` and `lib/align.ts` started, written the same way
 * for the same reasons: `paragraph` declares the field, and until dashboard#1693 no renderer read
 * it — an editor picked "Note", the panel saved it, `/api/pages` returned it, and the page was
 * unchanged.
 *
 * `default` and an absent value yield undefined, so the block emits no modifier at all and renders
 * exactly as it did before the field was wired up. That is what makes this additive: only a
 * paragraph an editor explicitly marked as a note changes.
 *
 * SCOPE is the prose element, not the section. The note is a BOX around the text — a tinted panel
 * with its own border — so the modifier goes where the padding and the type live, next to
 * `rich-body`, rather than on the `section-content` wrapper that carries the section's own rhythm.
 *
 * A literal lookup, never a name assembled from the value (`is-${variant}`): UnoCSS extracts class
 * names statically from source, so an assembled one generates no CSS — the failure
 * `verify-core-styleless.mjs` check 5 exists to catch.
 */
// A Map rather than an object literal, for the reason spelled out in lib/background.ts: a plain
// lookup would resolve `variant: "constructor"` up Object.prototype and hand a function back as a
// class name.
const VARIANT_CLASSES = new Map([['note', 'is-note']])

export function variantClass(variant?: string | null): string | undefined {
  return VARIANT_CLASSES.get(variant?.trim() ?? '')
}

/**
 * The classes an element carries in order to BE a variant: the axis key(s) it varies on, plus the
 * modifier that says which variant.
 *
 * Empty when the block leaves the choice at its default, so the caller drops the lot and an
 * unmarked paragraph renders the same class attribute it always did.
 *
 * The axis key is passed in rather than baked in here for the reason `alignClasses()` gives, and
 * it is the load-bearing half: UnoCSS never scans `lib/*.ts`, so a class name RETURNED from this
 * file is one the extractor never sees. The key travels as a literal in the component's own
 * template, where it is extracted; `is-note` needs no extracting, because the shortcut definition
 * bakes it into the generated selector. See core/uno.core.ts.
 */
export function variantClasses(variant: string | null | undefined, ...axes: string[]): string[] {
  const modifier = variantClass(variant)

  return modifier ? [...axes, modifier] : []
}
