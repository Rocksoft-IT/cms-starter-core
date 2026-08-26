import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { coreShortcuts } from '../core/uno.core'

// `cards.layout` — the block's own presentation select, and the field #1692 is built on.
//
// The epic's claim is that a difference in LOOK should cost an enum value, not a forked renderer.
// That only holds if adding the value actually reaches the page, and the failure mode when it does
// not is silent in a specific way: Cards.astro derives a `mode` with `cards` as its FALLBACK, so an
// option the renderer does not name does not throw, does not fail a type-check and does not fail a
// build — it renders `is-cards`. The panel offers the choice, /api/pages carries it, and the page
// draws the wrong layout with nothing anywhere to report it. That is the #1498 defect exactly, and
// it is what these tests exist to make impossible.
//
// So the option list is READ FROM THE COMMITTED SCHEMA rather than retyped here. A sixth layout
// added to config/cms.php and exported to schema/blocks.json fails this file until Cards.astro
// names it too — which is the whole point: the gate has to be on the class of mistake, not on the
// two values this change happened to add.

const CARDS = fileURLToPath(new URL('../core/blocks/Cards.astro', import.meta.url))
const SCHEMA = fileURLToPath(new URL('../../../schema/blocks.json', import.meta.url))

const source = readFileSync(CARDS, 'utf8')

// Comments are stripped before scanning: this component explains its own contract in prose and
// names the layouts while doing so, so an unstripped match would pass on the very comment that
// documents the code instead of on the code. background.test.ts strips for the same reason.
const withoutComments = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*/g, '')

const code = withoutComments(source)

const schema = JSON.parse(readFileSync(SCHEMA, 'utf8')) as {
  cards: { fields: { layout: { options: Record<string, string> } } }
}
const LAYOUTS = Object.keys(schema.cards.fields.layout.options)

// `cards` is the one option the `mode` derivation must NOT name: it is the fallback arm, so it is
// what an absent, legacy or unrecognised value resolves to. Every OTHER option has to be named, or
// it lands on that arm and renders as cards.
const FALLBACK = 'cards'
const NAMED_LAYOUTS = LAYOUTS.filter((layout) => layout !== FALLBACK)

describe('the schema and the renderer agree on the layout list', () => {
  // Guards the list itself: if the schema export ever stops carrying select options, every
  // assertion below would iterate an empty array and pass while checking nothing.
  it('reads the options from the committed schema', () => {
    expect(LAYOUTS).toEqual(expect.arrayContaining(['tiles', 'cards', 'steps', 'stats', 'bento']))
  })

  // The half that would have been missed. Emitting the class is useless if `mode` never takes the
  // value: the two lines added for #1692 would have been unreachable code, and the suite green.
  it.each(NAMED_LAYOUTS)('the mode derivation names %s', (layout) => {
    expect(code).toContain(`layout === '${layout}'`)
  })

  // The inverse, so the list above cannot be satisfied by naming everything: the fallback arm has
  // to stay reachable. Naming `cards` in the derivation would make the final `: 'cards'` dead and
  // leave a half-authored block with no layout class at all.
  it('does not name the fallback in the derivation', () => {
    expect(code).not.toContain(`layout === '${FALLBACK}'`)
  })

  // Whole literal strings. An assembled `is-${mode}` extracts to nothing under UnoCSS, and
  // context/foundation/lessons.md records two same-day incidents where exactly that shipped with
  // every gate green — verify:core-styles check 5 is the other half of this guard.
  it.each(LAYOUTS)('%s emits its literal modifier class', (layout) => {
    expect(code).toContain(`mode === '${layout}' && 'is-${layout}'`)
  })
})

// `cards` is deliberately absent from this list: it is the fallback, so it is what an absent or
// unrecognised value renders as. That is what keeps the field additive — a block authored before
// the field existed, or one carrying an option from a CMS newer than this core, still renders
// something coherent rather than a section with no layout class at all.
describe('the fallback stays the fallback', () => {
  it('falls back to cards, not to the first option', () => {
    expect(code).toMatch(/:\s*'cards'/)
  })

  it('still recognises the retired nav_tiles shape', () => {
    expect(code).toContain('Array.isArray(legacyTiles)')
  })
})

// The decision recorded in context/changes/cards-layout-variants/change.md, kept honest here.
//
// #1692 asks for "neutral is-stats / is-bento shortcut keys". Core does not ship them, and the
// reason is in core/uno.core.ts: a shortcut KEY IS A CLASS NAME, so a neutral one either generates
// nothing or generates an empty rule — the #1035 silence, where eight selector-shaped keys read
// like working style and emitted no CSS at all. The three older variants have no keys either, and
// the difference between cards layouts is the site layer's by design.
//
// This fails if someone adds one back, which is the point: the argument against them is easy to
// lose and the symptom of losing it is invisible.
describe('core paints no cards variant', () => {
  it.each(LAYOUTS)('has no shortcut key for is-%s', (layout) => {
    expect(Object.keys(coreShortcuts)).not.toContain(`is-${layout}`)
  })

  // The other shape the same opinion could sneak in as: the `[&.is-x]:` compound that `section-band`
  // legitimately uses for the `background` bands. Legal syntax, wrong block — it would make core
  // hold a look for a cards layout without ever adding a key.
  it('no shortcut paints a cards layout through a compound selector', () => {
    for (const [name, value] of Object.entries(coreShortcuts)) {
      for (const layout of LAYOUTS) {
        expect(`${name}: ${value}`).not.toContain(`&.is-${layout}`)
      }
    }
  })
})
