/**
 * Section background variants — the render half of the `background` field.
 *
 * The field is declared on `rich_content`, `features`, `cards`, `testimonials` and
 * `pricing_table`, and for a long time only `pricing_table` read it: the panel stored the value,
 * the API returned it, and every other renderer dropped it silently (dashboard #1498). A block
 * maps its value to one of these modifier classes and lets the shortcut layer paint it, which
 * keeps the choice of colour in the site layer where the styling contract puts it
 * (`scripts/verify-core-styleless.mjs`).
 *
 * `default` (and anything unrecognised, including a value from a newer schema this build does not
 * know) yields `undefined`, which Astro omits from `class:list` entirely — so a section with no
 * opinion renders exactly as it did before this existed.
 */
export type SectionBackground = 'default' | 'light' | 'muted' | 'brand' | 'dark'

const BACKGROUND_CLASSES: Record<Exclude<SectionBackground, 'default'>, string> = {
  light: 'is-light',
  muted: 'is-muted',
  brand: 'is-brand',
  dark: 'is-dark',
}

/**
 * The modifier class for a `background` value, or `undefined` when the section should keep the
 * page background.
 */
export function backgroundClass(background?: string | null): string | undefined {
  return BACKGROUND_CLASSES[background as Exclude<SectionBackground, 'default'>]
}
