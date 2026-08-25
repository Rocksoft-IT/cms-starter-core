/**
 * Section heading levels — the render half of the `heading_level` field.
 *
 * Section blocks render an <h2> for their own heading, which is right while the section sits
 * under a page title and wrong when the section IS the page title. A page composed only of blocks
 * — `promo_split` plus two `cards`, or a lone `rich_content` — then ships no <h1> at all: its real
 * title renders one level down and every heading below it hangs off nothing. Four pages on
 * scandinaviantaste.no were in that state before this field existed.
 *
 * `default` (and anything unrecognised, including a value from a newer schema this build does not
 * know) yields `h2`, so a section with no opinion renders exactly as it did before this existed.
 *
 * Deliberately NOT clamped to "one h1 per page": a block cannot see the rest of the page, so that
 * stays the editor's call — the same position the standalone `heading` block takes.
 */
export type SectionHeadingLevel = 'default' | 'h1' | 'h2' | 'h3'

const LEVELS = new Set(['h1', 'h2', 'h3'])

/**
 * The tag to render a section heading as. Capitalize the result at the call site — Astro only
 * treats a component-like identifier as a dynamic tag.
 */
export function headingTag(level?: string | null): 'h1' | 'h2' | 'h3' {
  return LEVELS.has(level as string) ? (level as 'h1' | 'h2' | 'h3') : 'h2'
}
