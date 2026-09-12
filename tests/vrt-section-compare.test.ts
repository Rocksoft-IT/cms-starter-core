import { PNG } from 'pngjs'
import { describe, expect, test } from 'vitest'
import { compareSections, formatSectionReport } from './vrt/section-compare.js'

/**
 * `compareSections`/`formatSectionReport` are the pure half of the section breakdown —
 * `sectionBands()` needs a live page and stays covered by the spec itself (two live origins, a
 * browser), same split `field-coverage.mjs`'s own tests already established for this package.
 */

/** A flat-colour PNG of the given size, so two "identical" bands pixelmatch to 0% without needing
 *  a real screenshot. */
function solidPng(width: number, height: number, rgb: [number, number, number]): PNG {
  const png = new PNG({ width, height })
  for (let i = 0; i < width * height; i++) {
    png.data[i * 4] = rgb[0]
    png.data[i * 4 + 1] = rgb[1]
    png.data[i * 4 + 2] = rgb[2]
    png.data[i * 4 + 3] = 255
  }
  return png
}

function band(top: number, height: number, tag = 'section', id: string | null = null) {
  return { top, height, tag, id, cls: null }
}

describe('compareSections', () => {
  test('pixel-diffs a pair whose bands are the same height', () => {
    // Two bands, stacked: [0,50) then [50,50).
    const oldPng = solidPng(100, 100, [10, 10, 10])
    const newPng = solidPng(100, 100, [10, 10, 10])
    const bands = [band(0, 50), band(50, 50)]

    const result = compareSections(oldPng, newPng, bands, bands)

    expect(result.rows).toHaveLength(2)
    expect(result.rows[0].diffPercent).toBe(0)
    expect(result.rows[0].oldHeight).toBe(50)
    expect(result.rows[0].newHeight).toBe(50)
    expect(result.oldExtra).toHaveLength(0)
    expect(result.newExtra).toHaveLength(0)
  })

  test('reports a real difference as a nonzero percentage, not just a height match', () => {
    const oldPng = solidPng(10, 10, [0, 0, 0])
    const newPng = solidPng(10, 10, [255, 255, 255])
    const bands = [band(0, 10)]

    const [row] = compareSections(oldPng, newPng, bands, bands).rows

    expect(row.diffPercent).toBeGreaterThan(0)
  })

  test('skips the pixel diff when a pair disagrees on height, but still crops both', () => {
    const oldPng = solidPng(100, 100, [0, 0, 0])
    const newPng = solidPng(100, 100, [0, 0, 0])
    const oldBands = [band(0, 40)]
    const newBands = [band(0, 70)]

    const [row] = compareSections(oldPng, newPng, oldBands, newBands).rows

    expect(row.diffPercent).toBeNull()
    expect(row.oldHeight).toBe(40)
    expect(row.newHeight).toBe(70)
    expect(row.crop?.old.height).toBe(40)
    expect(row.crop?.new.height).toBe(70)
    expect(row.crop?.diff).toBeNull()
  })

  test('pairs by position and reports a count mismatch rather than silently truncating', () => {
    const oldPng = solidPng(10, 100, [0, 0, 0])
    const newPng = solidPng(10, 100, [0, 0, 0])
    const oldBands = [band(0, 10, 'header'), band(10, 10, 'section'), band(20, 10, 'footer')]
    const newBands = [band(0, 10, 'header'), band(10, 10, 'section')]

    const result = compareSections(oldPng, newPng, oldBands, newBands)

    expect(result.rows).toHaveLength(2)
    expect(result.oldExtra).toEqual([band(20, 10, 'footer')])
    expect(result.newExtra).toHaveLength(0)
  })

  test('a band whose reported height overruns the captured PNG still crops, clamped', () => {
    const oldPng = solidPng(10, 50, [0, 0, 0])
    const newPng = solidPng(10, 50, [0, 0, 0])
    // A band claiming 200px tall against a 50px-tall screenshot — a race between measuring the
    // live page and reading back the screenshot buffer, not something this function should throw
    // on.
    const bands = [band(0, 200)]

    expect(() => compareSections(oldPng, newPng, bands, bands)).not.toThrow()
  })
})

describe('formatSectionReport', () => {
  test('names each pair by its label and verdict, in order', () => {
    const report = formatSectionReport({
      rows: [
        { index: 0, oldLabel: 'header', newLabel: 'header#site-header', oldHeight: 80, newHeight: 80, diffPercent: 1.5 },
        { index: 1, oldLabel: 'section.hero', newLabel: 'section.section-hero', oldHeight: 700, newHeight: 900, diffPercent: null },
      ],
      oldExtra: [],
      newExtra: [],
    })

    expect(report).toContain('[0] header ↔ header#site-header')
    expect(report).toContain('1.5% pixels differ')
    expect(report).toContain('[1] section.hero ↔ section.section-hero')
    expect(report).toContain('height differs — pixel diff skipped, see crop')
  })

  test('calls out a section-count mismatch by name rather than staying silent', () => {
    const report = formatSectionReport({
      rows: [],
      oldExtra: [band(0, 10, 'footer', null)],
      newExtra: [],
    })

    expect(report).toContain('⚠ section count differs')
    expect(report).toContain('reference has 1 extra')
    expect(report).toContain('footer')
  })
})
