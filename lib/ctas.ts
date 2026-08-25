/**
 * The rows of a `ctas` repeater that can actually be drawn as links.
 *
 * A row needs both halves: a label with no target is not a link, and a target with no label is a
 * button nobody can read — an `<a>` with no text is a WCAG 2.4.4 failure, and one with no `href`
 * is a styled span the keyboard cannot reach. A repeater row saved half-filled is an unfinished
 * input rather than an instruction to render either of those, so it is dropped.
 *
 * Shared because three blocks render this one shape — `hero`, `cta_banner` and `pricing_table`,
 * all fed by `$ctaList` in the backend registry — and they had drifted to three different levels
 * of defensiveness about it. One helper is what keeps the same authoring mistake behaving the same
 * way wherever the editor makes it.
 */
export interface CtaLink {
  label?: string
  href?: string
}

export function usableCtas(ctas?: CtaLink[] | null): CtaLink[] {
  return (ctas ?? []).filter((cta) => cta.label && cta.href)
}
