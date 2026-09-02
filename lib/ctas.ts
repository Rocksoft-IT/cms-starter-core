/**
 * The rows of a `ctas` repeater that can actually be drawn as links.
 *
 * A row needs both halves: a label with no target is not a link, and a target with no label is a
 * button nobody can read — an `<a>` with no text is a WCAG 2.4.4 failure, and one with no `href`
 * is a styled span the keyboard cannot reach. A repeater row saved half-filled is an unfinished
 * input rather than an instruction to render either of those, so it is dropped.
 *
 * Shared because FIVE blocks render this one shape — `hero`, `cta_banner`, `pricing_table`, and
 * since dashboard#1959 also `promo_split` and `faq`, all fed by `$ctaList` in the backend registry
 * — and they had drifted to different levels of defensiveness about it. One helper is what keeps
 * the same authoring mistake behaving the same way wherever the editor makes it.
 *
 * The last two arrived by retiring a `cta_label` + `cta_href` scalar pair, each of which stated
 * this same rule locally as `cta_label && cta_href`. Their registry declarations carry `max => 1`,
 * so `usableCtas(ctas)[0]` is the whole of their CTA.
 *
 * NOTE for a client repo overriding either of those two: a half-filled row is dropped HERE, on the
 * render side, and is deliberately KEPT in storage and in the payload — `scandinavian-taste` reads
 * an href with no label as a mode switch. If you are reproducing that, read the row, not this.
 */
export interface CtaLink {
  label?: string
  href?: string
}

export function usableCtas(ctas?: CtaLink[] | null): CtaLink[] {
  return (ctas ?? []).filter((cta) => cta.label && cta.href)
}
