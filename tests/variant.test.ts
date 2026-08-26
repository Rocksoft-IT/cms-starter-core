import { describe, it, expect } from 'vitest'
import { createGenerator } from 'unocss'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { variantClass, variantClasses } from '../lib/variant'
import { coreShortcuts } from '../core/uno.core'
import unoConfig from '../../../uno.config'

// `paragraph.variant` shipped in dashboard#1142 for a design that ends a page's prose with a boxed
// note, and core rendered one look regardless: the panel saved "Note", the API returned it, the
// page was unchanged (dashboard#1693). smbp forked the whole 14-line component to get the class,
// which is what a dead control costs when the field is real.
describe('variantClass()', () => {
  it('maps every schema option to its presentation modifier', () => {
    expect(variantClass('note')).toBe('is-note')
  })

  // The additive half of the contract: `default` and an absent value must emit nothing, so every
  // paragraph authored before the field was wired up renders byte-identically — the class vanishes
  // from the markup entirely rather than landing there inert.
  it('emits no class for default or absent', () => {
    expect(variantClass('default')).toBeUndefined()
    expect(variantClass(undefined)).toBeUndefined()
    expect(variantClass(null)).toBeUndefined()
    expect(variantClass('')).toBeUndefined()
  })

  // A value the frontend does not know (an option added to config/cms.php before a core bump)
  // leaves the block reading as running prose rather than emitting a class nothing styles.
  it('ignores an unknown value', () => {
    expect(variantClass('callout')).toBeUndefined()
    expect(variantClass('  note  ')).toBe('is-note')
  })

  // Why the lookup is a Map, exactly as in lib/background.ts and lib/align.ts: an object literal
  // would resolve these up Object.prototype and put a function into the class attribute.
  it('does not resolve a prototype key as a variant', () => {
    expect(variantClass('constructor')).toBeUndefined()
    expect(variantClass('toString')).toBeUndefined()
  })
})

describe('variantClasses()', () => {
  // The axis key rides along ONLY when there is a modifier to paint. That is what keeps a default
  // paragraph's class attribute at exactly `rich-body`, rather than growing an inert key.
  it('carries the axis key with the modifier', () => {
    expect(variantClasses('note', 'paragraph-variant')).toEqual(['paragraph-variant', 'is-note'])
  })

  it('is empty for default, absent and unknown values', () => {
    expect(variantClasses('default', 'paragraph-variant')).toEqual([])
    expect(variantClasses(undefined, 'paragraph-variant')).toEqual([])
    expect(variantClasses(null, 'paragraph-variant')).toEqual([])
    expect(variantClasses('callout', 'paragraph-variant')).toEqual([])
  })
})

// The helper being correct is only half of it. The original bug was not a bad mapping — it was a
// renderer that never called anything at all, so the value round-tripped through the panel and the
// API and then evaporated at render time with nothing to report it. These walk the source, because
// a refactor that drops the emit leaves every assertion above still green.

const CORE_DIR = fileURLToPath(new URL('../core', import.meta.url))
const blockSource = (name: string) => readFileSync(join(CORE_DIR, 'blocks', `${name}.astro`), 'utf8')

describe('the block that declares variant actually renders it', () => {
  it('Paragraph.astro routes the field through the shared helper', () => {
    const src = blockSource('Paragraph')
    expect(src).toContain("from '../../lib/variant'")
    expect(src).toMatch(/variantClasses\(block\.data\.variant, 'paragraph-variant'\)/)
  })

  // The modifier belongs on the PROSE element, beside `rich-body` — the note is a box around the
  // text, and core's own padding/type live there. On the `section-content` wrapper it would take
  // the section's rhythm instead and paint a full-width band.
  it('Paragraph.astro puts the modifier next to rich-body, not on the section wrapper', () => {
    expect(blockSource('Paragraph')).toMatch(/\['rich-body',\s*\.\.\.variantClasses\(/)
    expect(blockSource('Paragraph')).toMatch(/<div class="section-content">/)
  })
})

describe('the styling layer paints what the block emits', () => {
  it('paragraph-variant covers the note modifier', () => {
    const shortcut = coreShortcuts['paragraph-variant' as keyof typeof coreShortcuts]
    expect(shortcut, 'paragraph-variant is not a core shortcut').toBeDefined()
    expect(shortcut).toContain('&.is-note')
  })

  // A compound (`[&.is-note]:`), never a plain utility — same mechanism as the `align-*` keys. A
  // bare utility here would be a class the extractor never sees, i.e. the silent no-op again.
  it('paragraph-variant is a compound, not a bare utility', () => {
    const shortcut = coreShortcuts['paragraph-variant' as keyof typeof coreShortcuts]
    for (const part of String(shortcut).split(/\s+/).filter(Boolean)) {
      expect(part, `paragraph-variant: "${part}" is a bare utility, so it applies unconditionally`).toMatch(
        /^\[&\.is-note\]:/,
      )
    }
  })

  // Neutral, but not EMPTY. An `is-note` hook that paints nothing would leave the control just as
  // dead as it was on every site that has not styled it — which is the whole defect. The box is
  // core's own tokens, and a site retunes it by redefining this one key.
  it('the note is a visible box, from core tokens rather than a new namespace', () => {
    const shortcut = String(coreShortcuts['paragraph-variant' as keyof typeof coreShortcuts])
    expect(shortcut).toContain('bg-surface-alt')
    expect(shortcut).toContain('border-solid')
    expect(shortcut).not.toMatch(/--note-/)
  })
})

// The lesson this file exists for: "a shortcut that generates nothing still looks correct in
// source" (context/foundation/lessons.md). UnoCSS silently emits nothing for a key it cannot
// resolve, and every other check above — the source walk, the shortcut lookup — stays green while
// the rendered page carries a class nothing paints. Only generating the CSS settles it.
describe('the variant key generates real CSS from what the extractor actually sees', () => {
  it('paints the note box from the key alone', async () => {
    // The REAL config, not a reconstruction: presets, theme and the site's own shortcut layer
    // included, so this cannot pass against a setup production does not have.
    const uno = await createGenerator(unoConfig)

    // Fed ONLY the axis key — i.e. only the token that genuinely appears in a scanned `.astro`
    // file. If the mechanism needed `is-note` to be extracted too, this would come back empty.
    const { css } = await uno.generate('paragraph-variant', { preflights: false })

    expect(css, 'the note box is not painted').toContain('.paragraph-variant.is-note')
    expect(css, 'the note has no fill').toMatch(/background-color/)
    expect(css, 'the note has no border').toMatch(/border-style:\s*solid/)
  })

  // The other half of the same contract, and the cheap one: what the helper puts in the HTML must
  // be a MODIFIER, never a utility name. A utility there is the silent no-op above.
  it('variantClass emits a modifier, never a bare utility', () => {
    expect(variantClass('note')).toMatch(/^is-/)
  })
})
