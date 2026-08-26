import { describe, it, expect } from 'vitest'
import { createGenerator } from 'unocss'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { alignClass } from '../lib/align'
import { coreShortcuts } from '../core/uno.core'
import unoConfig from '../../../uno.config'

// The `align` select is a SHARED schema field, and until #1643 every renderer dropped it: the
// panel saved "Centered", the API returned it, and the page was unchanged. 38 blocks on
// diligently.pl and 2 on scandinavian-taste store a non-default value today, so this was never a
// field nobody used — it was a field core made a client fork six components to read.
describe('alignClass()', () => {
  it('maps every schema option to its alignment modifier', () => {
    expect(alignClass('left')).toBe('is-align-left')
    expect(alignClass('center')).toBe('is-align-center')
  })

  // The additive half of the contract: `default` and an absent value must emit nothing, so every
  // page built before the field was wired up renders byte-identically — the classes vanish from
  // the markup entirely rather than landing there inert.
  it('emits no class for default or absent', () => {
    expect(alignClass('default')).toBeUndefined()
    expect(alignClass(undefined)).toBeUndefined()
    expect(alignClass(null)).toBeUndefined()
    expect(alignClass('')).toBeUndefined()
  })

  // A value the frontend does not know (an option added to config/cms.php before a core bump)
  // leaves the block's own alignment alone rather than emitting a class nothing styles.
  it('ignores an unknown value', () => {
    expect(alignClass('justify')).toBeUndefined()
    expect(alignClass('right')).toBeUndefined()
    expect(alignClass('  center  ')).toBe('is-align-center')
  })

  // Why the lookup is a Map, exactly as in lib/background.ts: an object literal would resolve
  // these up Object.prototype and put a function into the class attribute.
  it('does not resolve a prototype key as an alignment', () => {
    expect(alignClass('constructor')).toBeUndefined()
    expect(alignClass('toString')).toBeUndefined()
  })
})

// The helper being correct is only half of it. The original bug was not a bad mapping — it was
// renderers that never called anything at all, so the value round-tripped through the panel and
// the API and then evaporated at render time with nothing to report it. These walk the sources,
// because a refactor that drops the emit leaves every assertion above still green.

const CORE_DIR = fileURLToPath(new URL('../core', import.meta.url))
const blockSource = (name: string) => readFileSync(join(CORE_DIR, 'blocks', `${name}.astro`), 'utf8')

// Same strip background.test.ts uses: these components explain in prose what they now do, and a
// check that matched the prose would be satisfied by the comment describing the fix.
const withoutComments = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*/g, '')

// Exactly the blocks that declare `align` in config/cms.php. `hero` is the seventh and the one
// this issue was raised for — it had no such field at all until #1643.
const ALIGNED_BLOCKS = ['RichContent', 'Features', 'Cards', 'Testimonials', 'PricingTeaser', 'PricingTable', 'Hero']

// The five that draw the shared SectionHeader. `RichContent` has no header component (it aligns
// its own `.rich-heading`) and `Hero` draws its own text track, so they are checked separately.
const HEADER_BLOCKS = ['Features', 'Cards', 'Testimonials', 'PricingTeaser', 'PricingTable']

describe('every block that declares align actually renders it', () => {
  it.each(ALIGNED_BLOCKS)('%s.astro routes the field through the shared helper', (name) => {
    const src = blockSource(name)
    expect(src).toContain("from '../../lib/align'")
    expect(src).toMatch(/alignClass\(align\)/)
  })

  // The modifier on the <section> is the hook a site styles against — the same place `bandClass`
  // sits, so a client repo can reach "this section is centred" without re-deriving it.
  it.each(ALIGNED_BLOCKS)('%s.astro puts the modifier on its own section', (name) => {
    expect(blockSource(name)).toMatch(/<section[^>]*class:list=\{\[[^\]]*align(Modifier|Class\(align\))/s)
  })

  it.each(HEADER_BLOCKS)('%s.astro forwards align to the shared header', (name) => {
    expect(blockSource(name)).toMatch(/<SectionHeader[^/]*\{align\}/)
  })

  // The header is where the aligning happens for those five, so it has to do both axes: text-align
  // on the outer box, and align-items on BOTH flex columns — `.section-header-text`'s own
  // `items-center` would otherwise shrink-wrap the eyebrow and heading back to the middle whatever
  // text-align said. This is the assertion that would have caught a "centred" header that moved
  // its text and not its box.
  it('SectionHeader.astro aligns both of its boxes', () => {
    // Comments stripped first: this file explains in prose what the two boxes carry, and matching
    // that prose would pass the check for the very comment that documents it.
    const code = withoutComments(readFileSync(join(CORE_DIR, 'SectionHeader.astro'), 'utf8'))

    // The AXES, not the variable names: what a regression here looks like is one of the two boxes
    // losing `align-column` and the header centring itself back by shrink-wrap.
    expect(code).toMatch(/'section-header',[\s\S]*?alignClasses\(align, 'align-text', 'align-column'\)/)
    expect(code).toMatch(/'section-header-text',\s*\.\.\.alignClasses\(align, 'align-column'\)/)
  })

  // The hero's buttons are a flex ROW, so they need justify-content where every other cluster
  // needs align-items. `ctas` had already gone missing from one of the hero's two branches once
  // (the reason HeroCtas exists at all), so the alignment is asserted on the component both
  // branches share rather than per branch.
  it('HeroCtas.astro aligns the button row on the main axis', () => {
    expect(withoutComments(blockSource('HeroCtas'))).toMatch(/alignClasses\(align, 'align-row'\)/)
    expect(blockSource('Hero')).toMatch(/<HeroCtas[^/]*\{align\}/)
  })

  // Both hero branches, not just the one. A single-column hero and a hero with columns draw
  // different markup, and the multi-column branch is the one that has silently lost a field before.
  it('Hero.astro aligns both of its layouts', () => {
    const code = withoutComments(blockSource('Hero'))

    // A static `class="hero-col"` is what a half-revert looks like — one branch keeps its
    // alignment and the other quietly stops. Asserted per element rather than per variable name,
    // so the check survives a rename of the locals but not the loss of a branch.
    for (const element of ['hero-col', 'hero-text', 'hero-2col-own']) {
      expect(code, `${element} is no longer aligned`).toContain(`class:list={['${element}',`)
    }
  })
})

describe('the styling layer paints what the blocks emit', () => {
  // Three keys and not one, because a flex column and a flex row put the horizontal axis in
  // different properties. Each has to cover BOTH modifiers: `left` is a real value, not a synonym
  // for the default — core's header and hero centre by design, so pushing them back is the choice
  // an absent class cannot express.
  it.each(['align-text', 'align-column', 'align-row'])('%s covers both modifier classes', (key) => {
    const shortcut = coreShortcuts[key as keyof typeof coreShortcuts]
    expect(shortcut, `${key} is not a core shortcut`).toBeDefined()
    for (const modifier of ['is-align-left', 'is-align-center']) {
      expect(shortcut).toContain(`&.${modifier}`)
    }
  })

  // A compound (`[&.is-align-x]:`), never a plain utility — see the block at the foot of this file
  // for why. Short version: the compound is what lets the modifier reach the CSS without the
  // extractor ever having to see it, and a bare utility here is a class nothing styles.
  it.each(['align-text', 'align-column', 'align-row'])('%s is a compound, not a bare utility', (key) => {
    const shortcut = coreShortcuts[key as keyof typeof coreShortcuts]
    for (const part of String(shortcut).split(/\s+/).filter(Boolean)) {
      expect(part, `${key}: "${part}" is a bare utility, so it ties with the block's own`).toMatch(
        /^\[&\.is-align-(left|center)\]:/,
      )
    }
  })
})

// WHY THESE ARE SHORTCUT KEYS AND NOT THE PLAIN UTILITIES THEY EXPAND TO.
//
// The obvious simplification is to drop the three keys and have `alignClass()` return
// `text-center` / `items-start` / `justify-start` outright. The cascade would allow it — UnoCSS
// puts shortcuts in a layer at -10 and utilities at 0, so a utility already beats a shortcut on
// the same element without any compound. That is not the reason the keys exist.
//
// The reason is EXTRACTION. UnoCSS emits a rule only for a class name it finds in scanned source,
// and the extractor does not reach `lib/*.ts` — measured on this tree: a utility name added to
// `lib/align.ts` produced no CSS at all, while the same name in a `.astro` class attribute did.
// `alignClass()` lives in `lib/`, so a plain utility returned from there would land in the HTML
// with nothing styling it. `justify-start` is the case that bites: it occurs in no `.astro` file
// anywhere in core or the site, so a left-aligned hero would keep its buttons centred — silently,
// which is the exact defect #1643 existed to remove.
//
// The split is what avoids it. What gets extracted is the KEY (`align-text`), which the components
// carry as a literal; the `is-align-*` half never needs extracting, because the shortcut definition
// bakes it into the generated selector. (A `safelist` would be the other way to make the names
// reachable — rejected as a hand-maintained list that drifts out of step with the renderers in
// silence, which is the same failure wearing a different hat.)
describe('the align keys generate real CSS from what the extractor actually sees', () => {
  // Fed ONLY the three keys — i.e. only the tokens that genuinely appear in a scanned `.astro`
  // file. If the mechanism needed `is-align-left` to be extracted too, this would come back empty.
  it('covers both directions on all three axes', async () => {
    // The REAL config, not a reconstruction: presets, theme and the site's own shortcut layer
    // included, so this cannot pass against a setup production does not have.
    const uno = await createGenerator(unoConfig)
    const { css } = await uno.generate('align-text align-column align-row', { preflights: false })

    const expected = [
      ['.align-text.is-align-left', 'text-align:left'],
      ['.align-text.is-align-center', 'text-align:center'],
      ['.align-column.is-align-left', 'align-items:flex-start'],
      ['.align-column.is-align-center', 'align-items:center'],
      ['.align-row.is-align-left', 'justify-content:flex-start'],
      ['.align-row.is-align-center', 'justify-content:center'],
    ] as const

    for (const [selector, declaration] of expected) {
      expect(css, `${selector} is not painted`).toContain(selector)
      expect(css, `${selector} does not set ${declaration}`).toContain(declaration)
    }
  })

  // The other half of the same contract, and the cheap one: what the helper puts in the HTML must
  // be a MODIFIER, never a utility name. A utility there is the silent-no-op above.
  it('alignClass emits a modifier, never a bare utility', () => {
    for (const token of ['left', 'center']) {
      expect(alignClass(token)).toMatch(/^is-align-/)
    }
  })
})
