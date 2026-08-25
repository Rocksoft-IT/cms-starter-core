import { describe, expect, test } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { headingTag } from '../lib/headingLevel'

const BLOCKS_DIR = fileURLToPath(new URL('../core/blocks', import.meta.url))
const SCHEMA = JSON.parse(readFileSync(fileURLToPath(new URL('../../../schema/blocks.json', import.meta.url)), 'utf8'))

// A section block renders an <h2> for its own heading, which is right under a page title and wrong
// when the section IS the page title. A page composed only of blocks then ships no <h1> at all —
// four pages on scandinaviantaste.no were in that state. These lock in the mapping and, as with
// `background` before it (#1498), the fact that declaring the field and rendering it stay in step.

describe('headingTag', () => {
  test.each([
    ['h1', 'h1'],
    ['h2', 'h2'],
    ['h3', 'h3'],
  ])('%s renders as %s', (value, expected) => {
    expect(headingTag(value)).toBe(expected)
  })

  // Anything without an opinion has to land on h2 — that is what makes this field render-identical
  // for every page that already existed. `h4` and `H1` are here on purpose: the schema offers
  // neither, so a stored value outside the list must fall back rather than reach the DOM.
  test.each([['default'], [''], [undefined], [null], ['H1'], ['h4'], ['from-a-newer-schema']])(
    '%s falls back to h2',
    (value) => {
      expect(headingTag(value as string | null | undefined)).toBe('h2')
    },
  )
})

describe('schema and renderers stay in step', () => {
  const DECLARING = Object.entries(SCHEMA)
    .filter(([, block]) => Boolean((block as { fields?: Record<string, unknown> }).fields?.heading_level))
    .map(([type]) => type)

  const RENDERERS: Record<string, string> = {
    rich_content: 'RichContent',
    promo_split: 'PromoSplit',
  }

  test('every block declaring heading_level has a renderer listed here', () => {
    expect(DECLARING.sort()).toEqual(Object.keys(RENDERERS).sort())
  })

  // Destructuring the field but leaving a literal <h2> on the element is exactly the failure the
  // `background` field shipped with: reading a value is not the same as rendering it.
  test.each(Object.values(RENDERERS))('%s.astro renders the authored tag', (name) => {
    const source = readFileSync(join(BLOCKS_DIR, `${name}.astro`), 'utf8')
    expect(source).toContain("from '../../lib/headingLevel'")
    expect(source).toMatch(/const Heading = headingTag\(heading_level\)/)
    expect(source).toMatch(/<Heading class="[\w-]+">/)
    expect(source).not.toMatch(/<h2 class="(rich|promo-split)-heading">/)
  })
})
