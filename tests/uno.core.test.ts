import { readFileSync, readdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, test } from 'vitest'
import { REQUIRED_PALETTE_KEYS, coreShortcuts, resolveThemeColors } from '../core/uno.core'
import { cmsConfig } from '~site/cms.config'

const BLOCKS_DIR = join(dirname(fileURLToPath(import.meta.url)), '../core/blocks')

/**
 * True when a word in the color slot of a `bg-`/`text-`/`border-` utility is not a brand color:
 * a preset color from the Uno preset, a keyword (`border-solid`, `text-center`), a type scale step
 * (`text-lg`), or a box side (`border-b`, `border-t-0`) — none of which need a palette key.
 */
function isNotAColor(name: string): boolean {
  return (
    /^(?:white|black|transparent|current|inherit|gray-\d+|slate-\d+)$/.test(name) ||
    /^(?:solid|dashed|dotted|none|center|left|right|justify|balance|nowrap|wrap|ellipsis|clip|opacity)$/.test(name) ||
    /^(?:xs|sm|base|lg|\d*xl)$/.test(name) ||
    /^[trblxy](?:-|$)/.test(name)
  )
}

// Unit coverage for the core Uno layer. It lives in the package rather than the starter's
// tests/e2e/ because it tests package internals: the mirror drops this directory before a client
// sees it, and a client's Playwright run could not load these modules anyway (core is Vite-only). What matters here is the failure mode: UnoCSS emits NOTHING for an
// unknown color name, so a palette missing a key the core shortcuts reference would render an
// unstyled block with a green build. resolveThemeColors turns that into a build error, and these
// tests are what keep the guard honest.

describe('resolveThemeColors', () => {
  test('accepts this site’s palette', () => {
    // The reference site must satisfy the contract it documents — and REQUIRED_PALETTE_KEYS must
    // not drift ahead of the palette that every client repo is generated from.
    expect(() => resolveThemeColors(cmsConfig.brand.colors)).not.toThrow()
  })

  test('maps each color to its CSS custom property with the site value as fallback', () => {
    const resolved = resolveThemeColors({ ...cmsConfig.brand.colors, primary: '#123456' })
    expect(resolved.primary).toBe('var(--color-primary, #123456)')
  })

  test('names every missing key when the palette is incomplete', () => {
    const { surface, border, ...incomplete } = cmsConfig.brand.colors
    expect(surface && border, 'fixture guard: both keys must exist to be removable').toBeTruthy()

    // One error listing everything that is missing, not a failure per key — a client migrating an
    // older palette should learn the full set from one build.
    expect(() => resolveThemeColors(incomplete)).toThrow(/missing core palette keys: surface, border/)
  })

  test('every color core references is a required key', () => {
    // REQUIRED_PALETTE_KEYS is hand-maintained, so this is the sync check. It scans BOTH the
    // shortcut values and the class attributes in the block components: a color used only in
    // markup bypasses the shortcut layer entirely, which is how `text-grey` survived in
    // ImageBlock's caption — `grey` is not a palette key, so the caption simply had no color.
    const paletteColors = new Set<string>(REQUIRED_PALETTE_KEYS)
    const referenced = new Set<string>()

    const sources = Object.values(coreShortcuts).concat(
      readdirSync(BLOCKS_DIR)
        .filter((file) => file.endsWith('.astro'))
        .flatMap((file) => [...readFileSync(join(BLOCKS_DIR, file), 'utf8').matchAll(/class="([^"]*)"/g)])
        .map(([, classList]) => classList),
    )

    for (const value of sources) {
      for (const [, color] of value.matchAll(/(?:^|[\s:])(?:bg|text|border)-([a-z][a-z0-9-]*)\b/g)) {
        referenced.add(color)
      }
    }

    const unknown = [...referenced].filter((name) => !paletteColors.has(name) && !isNotAColor(name))

    // Both directions are asserted, because a scanner that finds nothing would pass vacuously:
    // real palette colors ARE seen, and a name that is not a palette key IS reported.
    expect([...referenced]).toEqual(expect.arrayContaining(['primary', 'surface', 'heading', 'border']))
    expect(isNotAColor('grey'), 'the filter must not swallow a plausible-looking color name').toBe(false)
    expect(unknown, 'core references palette colors missing from REQUIRED_PALETTE_KEYS').toEqual([])
  })
})
