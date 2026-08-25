import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { backgroundClass } from '../lib/background'
import { coreShortcuts } from '../core/uno.core'

// The `background` select is a SHARED schema field (rich_content, features, cards, testimonials,
// pricing_teaser, pricing_table), and until #1498 every renderer dropped it independently: the
// panel saved "Dark", the API returned it, the page rendered white. One helper is what keeps the
// six blocks from drifting again.
describe('backgroundClass()', () => {
  it('maps every schema option to its band modifier', () => {
    expect(backgroundClass('light')).toBe('is-light')
    expect(backgroundClass('muted')).toBe('is-muted')
    expect(backgroundClass('brand')).toBe('is-brand')
    expect(backgroundClass('dark')).toBe('is-dark')
  })

  // The additive half of the contract: `default` and an absent value must emit nothing, so every
  // page built before the field was wired up renders byte-identically.
  it('emits no class for default or absent', () => {
    expect(backgroundClass('default')).toBeUndefined()
    expect(backgroundClass(undefined)).toBeUndefined()
    expect(backgroundClass(null)).toBeUndefined()
    expect(backgroundClass('')).toBeUndefined()
  })

  // A value the frontend does not know (an option added to config/cms.php before a core bump)
  // falls back to the uncoloured band rather than emitting a class nothing styles.
  it('ignores an unknown value', () => {
    expect(backgroundClass('neon')).toBeUndefined()
    expect(backgroundClass('  dark  ')).toBe('is-dark')
  })

  // Why the lookup is a Map: an object literal would resolve these up Object.prototype and put a
  // function into the class attribute.
  it('does not resolve a prototype key as a band', () => {
    expect(backgroundClass('constructor')).toBeUndefined()
    expect(backgroundClass('toString')).toBeUndefined()
  })
})

// The helper being correct is only half of it. The original bug was not a bad mapping — it was six
// renderers that never called anything at all, so the value round-tripped through the panel and the
// API and then evaporated at render time with nothing to report it (#1498). These walk the block
// sources, because a refactor that drops the emit leaves every assertion above still green.

const BLOCKS_DIR = fileURLToPath(new URL('../core/blocks', import.meta.url))
const source = (name: string) => readFileSync(join(BLOCKS_DIR, `${name}.astro`), 'utf8')

// Exactly the blocks that declare `background` in config/cms.php. `pricing_teaser` is the sixth —
// it was missed the first time round, which is precisely why this list is written out rather than
// inferred.
// Comments are stripped before scanning for a hand-rolled `background === 'dark'`: the migrated
// blocks explain in prose what they no longer do, and matching that prose would fail the check for
// the very comment that documents the fix.
const withoutComments = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*/g, '')

const BANDED_BLOCKS = ['RichContent', 'Features', 'Cards', 'Testimonials', 'PricingTeaser', 'PricingTable']

describe('every block that declares background actually renders it', () => {
  it.each(BANDED_BLOCKS)('%s.astro routes the field through the shared helper', (name) => {
    const src = source(name)
    expect(src).toContain("from '../../lib/background'")
    expect(src).toMatch(/backgroundClass\(background\)/)
  })

  // `section-band` has to be on the same element as the modifier: the fill is full-bleed and the
  // token re-mapping in core/styles/tokens.css is scoped to `.section-band.is-dark`, so a modifier
  // emitted without it paints nothing.
  it.each(BANDED_BLOCKS)('%s.astro carries section-band on its own section', (name) => {
    expect(source(name)).toMatch(/'section-[a-z-]+ section-band/)
  })

  it('no block hand-rolls its own dark styling any more', () => {
    const offenders = readdirSync(BLOCKS_DIR)
      .filter((file) => file.endsWith('.astro'))
      .filter((file) => /background === ['"]dark['"]/.test(withoutComments(source(file.replace(/\.astro$/, '')))))

    expect(offenders).toEqual([])
  })
})

describe('the styling layer paints what the blocks emit', () => {
  it('section-band covers all four modifier classes', () => {
    const band = coreShortcuts['section-band']
    for (const modifier of ['is-light', 'is-muted', 'is-brand', 'is-dark']) {
      expect(band).toContain(`&.${modifier}`)
    }
  })

  // The band must not resolve to a client-editable brand colour. `secondary` defaults to #101841
  // and is dark only by accident: client 22 sets it to #ffffff, which turned its "dark" pricing
  // band into white text on white — the #1475 defect class, and the reason `--band-dark-bg` exists.
  it('no shortcut paints a band from the secondary brand colour', () => {
    for (const [name, value] of Object.entries(coreShortcuts)) {
      expect(`${name}: ${value}`).not.toMatch(/\[&\.is-dark\]:bg-secondary/)
    }
  })
})

// An opaque LIGHT card inside an inverted band has to put the light text roles back, or the same
// unreadable-band bug reappears one level in: `features-card` is `bg-surface` and its <h3> carries
// no colour class, so it would inherit the band's white onto a white card.
describe('light surfaces inside a band restore the light roles', () => {
  it.each(['Features', 'Testimonials', 'PricingTeaser', 'PricingTable'])(
    '%s.astro marks its light surface with surface-light',
    (name) => {
      expect(source(name)).toContain('surface-light')
    },
  )
})
