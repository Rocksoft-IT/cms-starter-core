import { describe, it, expect } from 'vitest'
import { IMAGE_SIZES, responsiveImageAttrs } from '../lib/image'

// diligently-dashboard#1008. The rule these cases exist to pin: `sizes` without `srcset` changes
// nothing a browser does, so emitting it would be markup that looks meaningful and is not — and
// `srcset` really is absent much of the time (an SVG has no variants, a small source has nothing
// smaller to offer, and every page rendered before the generator ran has none yet).
describe('responsiveImageAttrs()', () => {
  const sizes = IMAGE_SIZES.gridTile

  it('emits all four attributes when the payload has a srcset', () => {
    expect(responsiveImageAttrs({ width: 1200, height: 800, srcset: '/a-640.webp 640w, /a.jpg 1200w' }, sizes)).toEqual(
      {
        width: 1200,
        height: 800,
        srcset: '/a-640.webp 640w, /a.jpg 1200w',
        sizes,
      },
    )
  })

  it('withholds sizes when there is no srcset, but keeps the dimensions', () => {
    // A 240px source: nothing smaller exists to offer, yet width/height still buy the browser a
    // correctly-sized box before the bytes arrive (#495).
    expect(responsiveImageAttrs({ width: 240, height: 160, srcset: null }, sizes)).toEqual({
      width: 240,
      height: 160,
      srcset: undefined,
      sizes: undefined,
    })
  })

  it('emits nothing at all for a missing or unmeasurable image', () => {
    const nothing = { width: undefined, height: undefined, srcset: undefined, sizes: undefined }

    // undefined rather than null throughout: Astro omits an attribute whose value is undefined, so
    // the tag renders exactly as it did before any of this existed.
    expect(responsiveImageAttrs(undefined, sizes)).toEqual(nothing)
    expect(responsiveImageAttrs(null, sizes)).toEqual(nothing)
    expect(responsiveImageAttrs({ width: null, height: null, srcset: null }, sizes)).toEqual(nothing)
  })

  it('never bakes a container-dependent pixel width into a sizes value', () => {
    // The slot's pixel width depends on `container-global`, which every client repo overrides — so
    // a pixel here would be right for one site and wrong for the rest. Viewport fractions
    // over-estimate the slot instead, which costs bytes rather than sharpness.
    for (const value of Object.values(IMAGE_SIZES)) {
      expect(value).toMatch(/\d+vw$/)
      expect(value).not.toMatch(/\d+px(,|$)/)
    }
  })
})
