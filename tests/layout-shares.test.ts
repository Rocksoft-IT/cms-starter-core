import { describe, expect, test } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { parseLayoutShares, shareAt } from '../lib/layout-shares'

const SCHEMA = JSON.parse(readFileSync(fileURLToPath(new URL('../../../schema/blocks.json', import.meta.url)), 'utf8'))

// The width vocabulary is a published, additive-only contract: a client site's PINNED core has to
// know a token before a page using it can build. These lock the two halves of that contract
// together — every token the panel offers, and the share arithmetic each one produces.

describe('parseLayoutShares', () => {
  test.each([
    ['1', [1]],
    ['1-1', [1, 1]],
    ['2-1', [2, 1]],
    ['1-1-1-1', [1, 1, 1, 1]],
  ])('%s parses to %j', (token, expected) => {
    expect(parseLayoutShares(token)).toEqual(expected)
  })
})

describe('shareAt', () => {
  // `width` is authoritative — the live API always materializes it from the layout — so these are
  // the shares a rendered row actually gets.
  test.each([
    ['1/1', '1', 0, 1],
    ['1/2', '1-1', 1, 1],
    ['2/3', '2-1', 0, 2],
    ['1/3', '2-1', 1, 1],
  ])('width %s under %s at slot %i is %i', (width, token, slot, expected) => {
    expect(shareAt(width, parseLayoutShares(token), slot)).toBe(expected)
  })

  // The fallback path — hand-authored payloads (fixtures, mock builds) that carry no `width`.
  // A single-track row is `1fr`, which is also what a lone surviving column of a wider preset
  // gets, so the band and the collapsed row render identically. That is why the measure, not the
  // track count, is what makes a band narrow (#1644).
  test('a single track falls back to the whole row', () => {
    expect(shareAt(undefined, parseLayoutShares('1'), 0)).toBe(1)
  })

  // Nothing usable anywhere still has to be a positive track: a 0 or a negative would emit an
  // invalid `grid-template-columns` and collapse the row.
  test.each([[undefined], ['']])('an unknown layout clamps to one track', (token) => {
    expect(shareAt(undefined, parseLayoutShares(token as string | undefined), 0)).toBe(1)
  })
})

describe('the panel and the renderer share one token vocabulary', () => {
  // The drift gate: a token the panel can save but the renderer cannot size would build a row
  // with a NaN track. Read from the committed schema rather than restated here, so adding a
  // preset backend-side fails this test until the shares parse.
  const tokens = Object.keys(SCHEMA.columns.fields.layout.options)

  test('every offered layout parses to positive shares', () => {
    expect(tokens.length).toBeGreaterThan(0)

    for (const token of tokens) {
      const shares = parseLayoutShares(token)

      expect(shares.length).toBeGreaterThan(0)
      expect(shares.every((n) => Number.isInteger(n) && n > 0)).toBe(true)
    }
  })

  test('the single-track band is one of them', () => {
    expect(tokens).toContain('1')
  })
})
