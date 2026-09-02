import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { coreShortcuts } from '../core/uno.core'

// `testimonials.layout` — the block's own presentation select, and the field #1850 was filed on.
//
// `row` shipped in config/cms.php with #1692 and reached no renderer for two months. Testimonials
// .astro read the three-valued field into ONE boolean (`layout === 'slider' && items.length > 1`),
// so `row` fell through to the stacked default: the panel offered the choice, /api/pages carried
// it, and the page rendered `single` with nothing anywhere to report it. An editor saw broken
// styling rather than a missing feature, and a client site drew the row in its own CSS instead.
// That is the #1498 defect exactly, and it is what these tests exist to make impossible.
//
// So the option list is READ FROM THE COMMITTED SCHEMA rather than retyped here. A fourth layout
// added to config/cms.php and exported to schema/blocks.json fails this file until the renderer
// names it too — the gate is on the class of mistake, not on the one value this change adds.
//
// Sibling to cards-layout.test.ts, which guards the same contract for `cards.layout`. The last
// describe block is where the two blocks legitimately diverge; see its own note.

const TESTIMONIALS = fileURLToPath(new URL('../core/blocks/Testimonials.astro', import.meta.url))
const SCHEMA = fileURLToPath(new URL('../../../schema/blocks.json', import.meta.url))

const source = readFileSync(TESTIMONIALS, 'utf8')

// Comments are stripped before scanning: this component explains its own contract in prose and
// names the layouts while doing so, so an unstripped match would pass on the very comment that
// documents the code instead of on the code. cards-layout.test.ts strips for the same reason.
const withoutComments = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*/g, '')

const code = withoutComments(source)

const schema = JSON.parse(readFileSync(SCHEMA, 'utf8')) as {
  testimonials: { fields: { layout: { options: Record<string, string> } } }
}
const LAYOUTS = Object.keys(schema.testimonials.fields.layout.options)

// `single` is the one option the renderer must NOT name: it is the stacked default every other
// arm switches away from, so it is what an absent, half-authored or newer-than-this-core value
// renders as. Every OTHER option has to be named, or it lands there and renders as `single`.
const FALLBACK = 'single'
const NAMED_LAYOUTS = LAYOUTS.filter((layout) => layout !== FALLBACK)

describe('the schema and the renderer agree on the layout list', () => {
  // Guards the list itself: if the schema export ever stops carrying select options, every
  // assertion below would iterate an empty array and pass while checking nothing.
  it('reads the options from the committed schema', () => {
    expect(LAYOUTS).toEqual(expect.arrayContaining(['slider', 'single', 'row']))
  })

  // The half that was missing for two months. Emitting a class is useless if no derivation ever
  // takes the value — and the failure is silent, because the fallback renders something valid.
  it.each(NAMED_LAYOUTS)('a derivation names %s', (layout) => {
    expect(code).toContain(`layout === '${layout}'`)
  })

  // The inverse, so the list above cannot be satisfied by naming everything: the fallback arm has
  // to stay reachable. Naming `single` would mean a block with no layout value at all — every
  // testimonials block authored before the field existed — matching no arm.
  it('does not name the fallback in any derivation', () => {
    expect(code).not.toContain(`layout === '${FALLBACK}'`)
  })

  // Whole literal strings. An assembled `is-${layout}` extracts to nothing under UnoCSS, and
  // context/foundation/lessons.md records two same-day incidents where exactly that shipped with
  // every gate green — verify:core-styles check 5 is the other half of this guard.
  //
  // Matched after a quote OR whitespace rather than after the opening quote alone: what has to
  // hold is that the class is a whole literal inside a string, not that it is first in the list,
  // so reordering to `'relative is-row'` is a formatting change and stays green. The assembled
  // form still fails — `is-${layout}` never contains the literal value.
  it.each(NAMED_LAYOUTS)('%s emits its literal modifier class', (layout) => {
    expect(code).toMatch(new RegExp(`['"\`\\s]is-${layout}\\b`))
  })

  // The fallback is the absence of a modifier, not a modifier of its own — nothing should be
  // painting `.is-single`, in the component or in this block's shortcuts.
  //
  // Scoped to the `testimonial*` keys, not all of `coreShortcuts`: a future unrelated block may
  // legitimately want an `is-single` modifier of its own, and it should not fail a testimonials
  // test to get one. What this owns is this block's own arm list.
  it('emits no modifier for the fallback', () => {
    expect(code).not.toContain(`is-${FALLBACK}`)

    const blockShortcuts = Object.fromEntries(
      Object.entries(coreShortcuts).filter(([key]) => key.startsWith('testimonial')),
    )
    expect(Object.keys(blockShortcuts).length).toBeGreaterThan(0)
    expect(JSON.stringify(blockShortcuts)).not.toContain(`is-${FALLBACK}`)
  })

  // `row` ships no JS: the slider's inline script is the block's only script and it selects
  // `.testimonials-list.is-slider`, so a row cannot pick up a transform it has no arrows to undo.
  it('drives the slider script from the slider modifier alone', () => {
    expect(code).toContain('.testimonials-list.is-slider')
  })
})

// Where this block diverges from cards, deliberately.
//
// Core paints no cards variant (#1035): the difference between cards layouts is the site layer's,
// and cards-layout.test.ts asserts core holds no opinion at all. Testimonials is the opposite by
// its own recorded decision — the `.is-slider` switch has always ridden `[.is-slider_&]:` variants
// inside core's own keys "so the whole block stays in this file" (core/uno.core.ts). `row` follows
// the slider, not cards.
//
// Which makes THIS the test that matters: a modifier class with no rule behind it is precisely
// what #1850 was. The renderer emitting `is-row` proves nothing on its own.
describe('core paints the row it advertises', () => {
  const ROW_VARIANT = '[.is-row_&]:'

  it('the track becomes a column grid and drops the prose cap', () => {
    const track = coreShortcuts['testimonial-track']

    expect(track).toContain(`${ROW_VARIANT}grid`)
    // An auto-fit track sized in equal `1fr` columns against a per-block minimum: that is what
    // makes the column count fall out of the container width with no media query, and what keeps
    // a wrapped last-line orphan card-sized instead of stretching across the row.
    expect(track).toMatch(/\[\.is-row_&\]:grid-cols-\[repeat\(auto-fit,minmax\(\d+px,1fr\)\)\]/)
    // Without this the row is four cards crammed into a reading measure — the reported symptom.
    expect(track).toContain(`${ROW_VARIANT}max-w-none`)
  })

  it('the slide sizes itself from the grid, not from a flex basis', () => {
    const slide = coreShortcuts['testimonial-slide']

    // A grid item takes its width from the track. A `grow`/`basis` pair left over from the flex
    // approach would not merely be dead — `grow` is what stretched the orphan.
    expect(slide).not.toContain(`${ROW_VARIANT}grow`)
    expect(slide).not.toContain(`${ROW_VARIANT}flex-1`)
    expect(slide).not.toMatch(/\[\.is-row_&\]:basis-/)
  })

  // A shortcut KEY is a class name, so `'is-row': '…'` would generate CSS for a class and then
  // ask the block to carry two. The compound-inside-a-real-key form above is the legal one, and
  // this pins the difference — it is easy to "tidy" one into the other.
  it.each(LAYOUTS)('has no shortcut key for is-%s', (layout) => {
    expect(Object.keys(coreShortcuts)).not.toContain(`is-${layout}`)
  })
})
