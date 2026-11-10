import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { textSizeClass } from '../lib/textSize'
import { coreShortcuts } from '../core/uno.core'

// The `text_size` select is a SHARED schema field on every block that has a root <section>. One
// helper is what keeps those renderers from each reading it their own way, the drift
// `backgroundClass()` exists to prevent.
describe('textSizeClass()', () => {
  it('maps every schema option to its modifier', () => {
    expect(textSizeClass('sm')).toBe('is-size-sm')
    expect(textSizeClass('lg')).toBe('is-size-lg')
    expect(textSizeClass('xl')).toBe('is-size-xl')
  })

  // The additive half of the contract: `default` and an absent value emit nothing, so every page
  // built before the field existed renders byte-identically.
  it('emits no class for default or absent', () => {
    expect(textSizeClass('default')).toBeUndefined()
    expect(textSizeClass(undefined)).toBeUndefined()
    expect(textSizeClass(null)).toBeUndefined()
    expect(textSizeClass('')).toBeUndefined()
  })

  it('ignores an unknown value', () => {
    expect(textSizeClass('huge')).toBeUndefined()
    expect(textSizeClass('  lg  ')).toBe('is-size-lg')
  })

  it('does not resolve a prototype key as a size', () => {
    expect(textSizeClass('constructor')).toBeUndefined()
    expect(textSizeClass('toString')).toBeUndefined()
  })
})

describe('the styling layer paints what the helper emits', () => {
  // The modifier names are written out in the shortcut because UnoCSS never sees lib/*.ts; a
  // helper that returned a name the shortcut does not spell would put a class in the HTML that
  // nothing styles.
  it('section-band sets --type-scale for all three modifiers', () => {
    const band = coreShortcuts['section-band']
    for (const [modifier, scale] of [
      ['is-size-sm', '0.9'],
      ['is-size-lg', '1.15'],
      ['is-size-xl', '1.3'],
    ]) {
      expect(band).toContain(`[&.${modifier}]:[--type-scale:${scale}]`)
    }
  })
})

// Every block that declares `text_size` must hand the value to the helper: a renderer that drops
// it leaves the editor's choice saved and ignored, the failure #1498 recorded for `background`.
const BLOCKS_DIR = fileURLToPath(new URL('../core/blocks', import.meta.url))

describe('every block that carries a band also routes text_size', () => {
  const banded = readdirSync(BLOCKS_DIR)
    .filter((file) => file.endsWith('.astro'))
    .filter((file) => readFileSync(join(BLOCKS_DIR, file), 'utf8').includes('backgroundClass('))

  it('finds the banded blocks', () => {
    expect(banded.length).toBeGreaterThanOrEqual(27)
  })

  it.each(banded)('%s routes text_size through the shared helper', (file) => {
    const src = readFileSync(join(BLOCKS_DIR, file), 'utf8')
    expect(src).toContain("from '../../lib/textSize'")
    expect(src).toContain('textSizeClass(block.data.text_size)')
  })
})
