import { describe, expect, test } from 'vitest'
import { formatBytes, formatDocDate, typeLabel } from '../core/protected-zone/format'
import { formatDate } from '../core/format'

// The zone's rows are built in the BROWSER after sign-in, so nothing about their formatting is
// visible in a build or a fixture — a regression here only shows on a signed-in visitor's screen.
// These pin the three formatters a site override shares with the core renderer.

describe('formatBytes()', () => {
  test('speaks the page’s own number format', () => {
    // The contract's own example: 1 289 011 bytes is "1,2 MB" on a Polish page, "1.2 MB" on an
    // English one — binary multiples, one decimal from MB up.
    expect(formatBytes(1289011, 'pl')).toBe('1,2 MB')
    expect(formatBytes(1289011, 'en')).toBe('1.2 MB')
  })

  test('whole numbers below a megabyte, and no trailing ",0"', () => {
    expect(formatBytes(0, 'en')).toBe('0 B')
    expect(formatBytes(512, 'en')).toBe('512 B')
    expect(formatBytes(12_700, 'pl')).toBe('12 KB')
    expect(formatBytes(2 * 1024 * 1024, 'pl')).toBe('2 MB')
    expect(formatBytes(3.5 * 1024 ** 3, 'en')).toBe('3.5 GB')
  })

  test('renders nothing for a value that is not a size', () => {
    // A missing size must remove the element, not print "NaN B".
    for (const value of [null, undefined, -1, Number.NaN, Infinity, '1024']) {
      expect(formatBytes(value, 'en'), String(value)).toBeNull()
    }
  })
})

describe('formatDocDate()', () => {
  test('is core’s own date style, so a zone row and a documents row cannot disagree', () => {
    expect(formatDocDate('2024-02-15', 'pl')).toBe(formatDate('2024-02-15', 'pl'))
    expect(formatDocDate('2024-02-15', 'en')).toBe('February 15, 2024')
    expect(formatDocDate('2024-02-15', 'pl')).toBe('15 lutego 2024')
  })

  test('a date-only value never slips a day west of UTC', () => {
    // Parsed and formatted in UTC; a local-time format would print the 14th in the Americas.
    expect(formatDocDate('2024-03-01', 'en')).toBe('March 1, 2024')
  })

  test('absent renders nothing', () => {
    expect(formatDocDate(null, 'en')).toBeNull()
    expect(formatDocDate('', 'en')).toBeNull()
  })
})

describe('typeLabel()', () => {
  test('the extension first, as the visitor will see it on disk', () => {
    expect(typeLabel('akt-mickiewicza-3.pdf', 'application/pdf')).toBe('PDF')
    expect(typeLabel('scan.PDF', null)).toBe('PDF')
  })

  test('falls back to the MIME subtype when the name has no extension', () => {
    expect(typeLabel('akt notarialny', 'application/pdf')).toBe('PDF')
    expect(typeLabel(null, 'application/pdf; charset=binary')).toBe('PDF')
  })

  test('says nothing rather than guessing', () => {
    expect(typeLabel(null, null)).toBeNull()
    expect(typeLabel('README', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document')).toBeNull()
  })
})
