/**
 * Normalize a CMS `reveal` select into the modifier class the section carries. Shared by every
 * block that exposes the field (rich_content, cards, features, cta_banner, testimonials, videos,
 * pricing_teaser, pricing_table) — the sibling of `backgroundClass()` in lib/background.ts and
 * `alignClass()` in lib/align.ts, written the same way for the same reasons.
 *
 * Eight blocks declared the field and NONE of them read it (dashboard#1985): an editor picked
 * "Fade in on scroll", the panel saved it, /api/pages carried it and the page was unchanged. The
 * same silent no-op `background` was until #1498 and `align` until #1643 — and the reason a client
 * port wrote its own IntersectionObserver in the site layer after first ruling out its own CSS.
 *
 * `default` and an absent value yield undefined, so the section emits no modifier at all and
 * renders exactly as it did before the field was wired up (Astro drops an undefined entry from
 * `class:list`). That is what makes this additive: only a block an editor explicitly set changes.
 *
 * `off` is a REAL value, not a synonym for the default — the same call `align` makes for `left`.
 * Core animates nothing by default, so today the two look alike; a site whose own design reveals
 * these bands needs a way to say "not this one" that an absent attribute cannot express, and
 * `is-reveal-off` is the hook it suppresses through (core pins the end state for it, see the
 * `section-reveal` shortcut in core/uno.core.ts).
 *
 * A literal lookup, never a name assembled from the value (`is-reveal-${reveal}`): UnoCSS extracts
 * class names statically from source, so an assembled one generates no CSS — the failure
 * `verify:core-styles` check 5 exists to catch.
 */
// A Map rather than an object literal, for the reason spelled out in lib/background.ts: a plain
// lookup would resolve `reveal: "constructor"` up Object.prototype and hand a function back as a
// class name.
const REVEAL_CLASSES = new Map([
  ['on', 'is-reveal'],
  ['off', 'is-reveal-off'],
])

export function revealClass(reveal?: string | null): string | undefined {
  return REVEAL_CLASSES.get(reveal?.trim() ?? '')
}

/**
 * Does this value mean "fade in on scroll" — i.e. does the section need the observer mounted?
 *
 * ONE predicate, not two. Every renderer needs the question twice: once for the modifier class and
 * once to decide whether to mount core/SectionReveal.astro. Re-deriving the second as
 * `reveal === 'on'` looked equivalent and was not — `revealClass()` trims, so `reveal: " on "`
 * emitted `is-reveal` on the section and mounted NO observer. The section then renders visible and
 * simply never animates; worse, if another block on the same page brought an observer, the
 * whitespace one IS armed and revealed, because `arm()` queries `.is-reveal` document-wide. Same
 * block, same value, different behaviour depending on its neighbours.
 *
 * A select cannot realistically produce whitespace, so this was latent rather than live — but two
 * places encoding one predicate and drifting apart is the exact shape that produced #1985.
 */
export function revealsOnScroll(reveal?: string | null): boolean {
  return revealClass(reveal) === 'is-reveal'
}
