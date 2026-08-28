import type { ResponsiveImageMeta } from '../types/blocks'

/**
 * The responsive attributes for one `<img>`, ready to spread.
 *
 * The division of labour, which is the whole point: the API supplies `srcset` — it is the only side
 * that knows which variants exist and how wide each file really is — and the BLOCK supplies `sizes`,
 * because how wide the picture will be rendered is a fact about the LAYOUT, which the API cannot
 * know. Neither half is any use alone, so this helper takes both or emits neither.
 *
 * `sizes` is deliberately dropped when there is no `srcset`: on its own it changes nothing a browser
 * does, so emitting it would be markup that looks meaningful and is not. And `srcset` is absent more
 * often than you would think — an SVG has no variants, a small source has nothing smaller to offer,
 * and every page rendered before the generator has run has none yet.
 *
 * `width`/`height` come along because they are in the same object and belong on the same tag: the
 * intrinsic pair is what lets the browser reserve the right box before the bytes arrive, which is
 * the layout-shift half of the problem (diligently-dashboard#495).
 *
 * @param sizes a `sizes` attribute value describing the slot THIS block renders into
 */
export function responsiveImageAttrs(meta: ResponsiveImageMeta | null | undefined, sizes: string) {
  // `undefined` rather than null: Astro omits an attribute whose value is undefined, so an image
  // with no measurements renders exactly the tag it rendered before any of this existed.
  const srcset = meta?.srcset ?? undefined

  return {
    width: meta?.width ?? undefined,
    height: meta?.height ?? undefined,
    srcset,
    sizes: srcset ? sizes : undefined,
  }
}

/**
 * `sizes` values for the slots core's own blocks render into.
 *
 * Expressed in `vw`, NOT in pixels, on purpose. The pixel width of a slot depends on
 * `container-global`, which every client repo is expected to override (smbp sets 1180px) — so a
 * pixel baked in here would be wrong for every site but one. A viewport fraction is always a slight
 * OVER-estimate of the slot, since the container is narrower than the viewport, and over-estimating
 * is the safe direction: the browser picks one rung too large, costing bytes, where under-estimating
 * costs a visibly upscaled image.
 *
 * The breakpoints follow the grids' own `minmax()` floors, which is what actually decides the column
 * count: the card/gallery grids floor a tile at 240px and the team grid at 220px, so a tile stops
 * being full-width at around 640px of viewport and reaches four columns around 1024px.
 */
export const IMAGE_SIZES = {
  /**
   * A tile on an auto-fill grid floored near 220–240px: gallery, cards, team. Those grids have no
   * breakpoints of their own — the column count follows the CONTAINER, so the steps here
   * approximate where a 240px floor yields two columns and then four.
   */
  gridTile: '(min-width: 1024px) 25vw, (min-width: 640px) 50vw, 100vw',
  /**
   * A card thumbnail on the teaser grid, which is `grid-cols-1 md:grid-cols-3` — ONE jump, at
   * 768px, with no two-column state ever. An intermediate 50vw step would under-declare the tile
   * between 640 and 768px, where it is still full width, and under-declaring is the direction that
   * costs sharpness rather than bytes.
   */
  teaserCard: '(min-width: 768px) 33vw, 100vw',
  /** One side of a two-column panel: promo_split's photo, quote's portrait. */
  halfPanel: '(min-width: 768px) 50vw, 100vw',
  /** An image spanning the content measure, which is most of a wide viewport but not all of it. */
  contentWidth: '(min-width: 1024px) 75vw, 100vw',
  /**
   * A picture that really is the full viewport width: a carousel slide's background, which bleeds
   * past every container by design. No breakpoints, because there is no narrower state to describe.
   */
  fullBleed: '100vw',
} as const
