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

  // The slots whose width does NOT follow the container, and are therefore the only ones allowed to
  // be a fixed px. Each has to be a slot the CSS caps outright — `pricing-logo` is
  // `h-8 w-auto max-w-[7rem]`, so it is ≤112px at every viewport on every site whatever
  // `container-global` is overridden to. Adding a key here is the deliberate act; a new entry that
  // is not listed falls under the vw rule below and fails until someone justifies it.
  const CONTAINER_INDEPENDENT = new Set(['planLogo'])

  it('never bakes a container-dependent pixel width into a sizes value', () => {
    // The slot's pixel width depends on `container-global`, which every client repo overrides — so
    // a pixel here would be right for one site and wrong for the rest. Viewport fractions
    // over-estimate the slot instead, which costs bytes rather than sharpness.
    for (const [key, value] of Object.entries(IMAGE_SIZES)) {
      if (CONTAINER_INDEPENDENT.has(key)) continue
      expect(value).toMatch(/\d+vw$/)
      expect(value).not.toMatch(/\d+px(,|$)/)
    }
  })

  it('states a container-independent slot as a bare pixel width', () => {
    // The other half of the carve-out: a slot exempt from the vw rule must actually be FIXED, not a
    // media-query list that happens to end in px. No `vw`, no conditions — one number.
    for (const key of CONTAINER_INDEPENDENT) {
      const value = IMAGE_SIZES[key as keyof typeof IMAGE_SIZES]
      expect(value).toMatch(/^\d+px$/)
    }
  })
})
