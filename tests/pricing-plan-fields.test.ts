import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

// `plan.sub_plans` and `plan.example_logos` are authored in the panel and fully resolved by the API,
// and core's PricingTable drew neither (dashboard#1779). Both are now emitted, and this file is the
// ONLY automated guard that they stay emitted.
//
// WHY THIS FILE EXISTS RATHER THAN LEANING ON THE FIELD-COVERAGE GATE. That gate structurally cannot
// see either field, which is why they went unnoticed while #1693's five `rich_content` ones were
// listed. `findUnrenderedFields` walks `schema[type].fields` through `leafFields()`, which recurses
// only into a field config carrying its own inline `fields` key. `pricing_table.plans` is declared
// `['type' => 'items', 'item_type' => 'plan']` — no inline `fields` — so it collapses to a single
// leaf named `plans` and the walk never descends into the `plan` item registry. No field on a plan
// can ever appear in KNOWN_UNRENDERED. (The sibling `tab_icons` IS a real repeater with `fields`, so
// that one is walked — the blind spot is specific, not general.)
//
// It also matters that the emit stays in the .astro and not in a `lib/` helper: the gate's
// FOLLOWABLE regex (`/[\\/](blocks|lib)[\\/]/`) appends a followed helper's source to its haystack,
// so a field named inside `lib/` produces a hit that proves nothing. Hence the local readers in the
// component frontmatter, and hence these assertions against that file's own source.
const source = readFileSync(fileURLToPath(new URL('../core/blocks/PricingTable.astro', import.meta.url)), 'utf8')

// The component explains in prose what it now does, and a check that matched the prose would be
// satisfied by the very comment documenting the fix. Same strip rich-content-fields.test.ts uses.
const withoutComments = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*/g, '')
const code = withoutComments(source)

describe('PricingTable renders a bundle’s sub_plans', () => {
  // Unlike a block-level field there is no `const { … } = block.data` destructure to assert: a plan
  // field is read off the item inside `tab.plans.map()`, so the property access IS the read.
  it('reads the field off the plan', () => {
    expect(code).toMatch(/plan\.sub_plans/)
  })

  // Placed, not merely read. The gate's blind spot is a component that touches a field and forgets
  // to put it anywhere, so this asserts the container element and its guard together.
  it('places a container for it, guarded so a plan with no bundle emits nothing', () => {
    expect(code).toMatch(/\(plan\.sub_plans \?\? \[\]\)\.length > 0 &&[\s\S]{0,120}pricing-sub-plans/)
  })

  // The price is the whole reason a sub-plan is listed apart from a feature line — #1288's case is a
  // $790 card holding a $490 and a $390 offer. A name-only list would re-create the very flattening
  // the field exists to undo.
  it('prints each nested plan’s name and its price', () => {
    expect(code).toMatch(/sub\.name/)
    expect(code).toMatch(/sub\.price && <span[^>]*pricing-sub-plan-price/)
  })

  // Each nested offer has its own button in the source design. Both halves required, matching how
  // the parent card's own CTA is guarded.
  it('links each nested plan’s own CTA when both halves are set', () => {
    expect(code).toMatch(/sub\.cta_label && sub\.cta_href/)
    expect(code).toMatch(/href=\{hrefOf\(sub\.cta_href, hrefCtx\)\}/)
  })

  // Before the CTA, and this is load-bearing rather than cosmetic: `pricing-card` is
  // `flex flex-col` and the CTA carries `mt-auto`, so anything after it is pinned to the card's
  // foot. Sub-plans are plan content and belong in the flowing region beside the price.
  it('places the bundle above the card CTA, not in the footer region', () => {
    expect(code.indexOf('pricing-sub-plans')).toBeLessThan(code.indexOf('btn-primary'))
  })
})

describe('PricingTable renders a plan’s example_logos', () => {
  it('reads the field off the plan', () => {
    expect(code).toMatch(/plan\.example_logos/)
  })

  // The guard is on the RESOLVED list, not on the raw field: an element whose url does not resolve
  // is dropped first, so a card whose every logo failed emits no row — `pricing-logos` carries
  // `border-t … pt-4`, so an empty one is a stray rule plus padding, not an invisible div.
  it('places a row for it, guarded on the resolved list so nothing empty emits', () => {
    expect(code).toMatch(/logos\.length > 0 &&[\s\S]{0,120}pricing-logos/)
    expect(code).toMatch(/\(plan\.example_logos \?\? \[\]\)\.flatMap/)
  })

  // The field is `multiple` media, so every element is the whole MediaUrls.for() object — reading
  // the element as a URL is the bug this guards. Asserted on the RENDERED shape (`src` comes from a
  // normalized `.url`, never from the element) rather than on the normalizer's cast expression:
  // pinning the cast would break a green test the moment the reader is renamed or extracted, with
  // no behaviour change. Same rule as rich-content-fields.test.ts. The bare-string branch surviving
  // is covered by the fixture, which carries one string logo beside two objects.
  it('renders src from a normalized .url, not from the element itself', () => {
    expect(code).toMatch(/src=\{logo\.url\}/)
    expect(code).not.toMatch(/src=\{logo\}/)
    expect(code).toMatch(/const url = logoUrl\(logo\)/)
  })

  // A logo names a client, which the card cannot know — so the alt comes from the MEDIUM, never
  // from the plan's own name.
  it('takes alt from the medium', () => {
    expect(code).toMatch(/alt=\{logo\.alt\}/)
    expect(code).toMatch(/alt: logoAlt\(logo\)/)
    expect(code).not.toMatch(/alt=\{plan\.name/)
  })

  // Through the shared helper, and WITH a `sizes` — the half only the block can supply. Raw
  // `srcset=` here would be the bug: MediaUrls::srcset() emits `w` descriptors, so with no `sizes`
  // the browser assumes 100vw and picks the largest rung for a picture capped at 7rem. The helper
  // also keeps the both-or-neither rule, so a bare-string logo still emits a plain `src`.
  it('passes the responsive attributes through the shared helper, with a sizes', () => {
    expect(code).toMatch(/\{\.\.\.responsiveImageAttrs\(logo\.meta, IMAGE_SIZES\.planLogo\)\}/)
    expect(code).not.toMatch(/srcset=\{meta\?\.srcset/)
  })

  // Anchored on the exact class attribute, not the bare word: `pricing-logo` is also a prefix of
  // the container's `pricing-logos`, and matching that instead would measure from the wrong node.
  it('lazy-loads them — a logo strip is below the fold of its own card', () => {
    expect(code).toMatch(/class="pricing-logo"[\s\S]{0,400}loading="lazy"/)
  })
})

// Both new collections are repeated peers, like the feature list 40 lines below the bundle in this
// same card and like Gallery's and Team's tiles. One component describing two lists two ways is the
// pattern break this guards, and list semantics are what give an assistive reader the count.
describe('both new collections carry list semantics', () => {
  it('wraps each in a <ul> with <li> children', () => {
    expect(code).toMatch(/<ul class="pricing-sub-plans">/)
    expect(code).toMatch(/<li class="pricing-sub-plan">/)
    expect(code).toMatch(/<ul class="pricing-logos">/)
    expect(code).not.toMatch(/<div class="pricing-sub-plans">/)
    expect(code).not.toMatch(/<div class="pricing-logos">/)
  })
})

describe('both fields stay additive', () => {
  // The promise the change was accepted on: a plan carrying neither field must render exactly the
  // markup it rendered before. Every emit is behind a length check, so an absent or empty list
  // produces no node at all — asserted here as the two guards being the only way in.
  it('emits nothing for a plan with neither field', () => {
    // `sub_plans` guards the field directly; `example_logos` guards the resolved list, which is
    // empty for an absent field too — `(plan.example_logos ?? []).flatMap` over nothing.
    expect(code).toMatch(/\(plan\.sub_plans \?\? \[\]\)\.length > 0 &&/)
    expect(code).toMatch(/logos\.length > 0 &&/)
    // No unguarded `.map` over either field — that would emit a wrapper for an empty list.
    expect(code).not.toMatch(/\{plan\.sub_plans\.map/)
    expect(code).not.toMatch(/\{plan\.example_logos\.map/)
  })
})
