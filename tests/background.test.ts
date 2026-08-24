import { describe, expect, test } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { backgroundClass } from '../lib/background'
import { coreShortcuts } from '../core/uno.core'

const BLOCKS_DIR = fileURLToPath(new URL('../core/blocks', import.meta.url))

// dashboard #1498 — `background` was declared on five blocks and read by exactly one. The panel
// saved it, the API returned it, and every other renderer dropped it: an editor picked "Dark" and
// the band stayed white, with nothing anywhere reporting a problem. These lock in both halves —
// the value→class mapping, and the fact that each declaring block actually emits it.

describe('backgroundClass', () => {
  test.each([
    ['light', 'is-light'],
    ['muted', 'is-muted'],
    ['brand', 'is-brand'],
    ['dark', 'is-dark'],
  ])('%s maps to %s', (value, expected) => {
    expect(backgroundClass(value)).toBe(expected)
  })

  // `default` must produce no class at all rather than an `is-default` no-op: Astro drops an
  // undefined entry from class:list, which is what makes this change render-identical for every
  // page that has no opinion.
  test.each([['default'], [''], [undefined], [null], ['DARK'], ['from-a-newer-schema']])(
    '%s yields no class',
    (value) => {
      expect(backgroundClass(value as string | null | undefined)).toBeUndefined()
    },
  )
})

describe('the blocks that declare background actually emit it', () => {
  // A renderer that destructures the field but forgets to put it on the element is the exact
  // failure this issue was: reading it is not the same as rendering it.
  test.each(['RichContent', 'Features', 'Cards', 'Testimonials', 'PricingTable'])('%s.astro', (name) => {
    const source = readFileSync(join(BLOCKS_DIR, `${name}.astro`), 'utf8')
    expect(source).toContain("from '../../lib/background'")
    expect(source).toMatch(/backgroundClass\(background\)/)
  })

  test('no block hand-rolls its own dark styling any more', () => {
    const offenders = readdirSync(BLOCKS_DIR)
      .filter((file) => file.endsWith('.astro'))
      .filter((file) => /background === ['"]dark['"]/.test(readFileSync(join(BLOCKS_DIR, file), 'utf8')))

    expect(offenders).toEqual([])
  })
})

describe('the shortcut layer paints every variant', () => {
  test('section-surface covers all four modifier classes', () => {
    const surface = coreShortcuts['section-surface']
    for (const modifier of ['is-light', 'is-muted', 'is-brand', 'is-dark']) {
      expect(surface).toContain(`&.${modifier}`)
    }
  })

  // Composition, not copy-paste: a section shortcut that forgot `section-surface` would emit the
  // class and paint nothing.
  test.each(['section-content', 'section-features', 'section-cards', 'section-pricing-table'])(
    '%s composes section-surface',
    (name) => {
      expect(coreShortcuts[name]).toContain('section-surface')
    },
  )
})
