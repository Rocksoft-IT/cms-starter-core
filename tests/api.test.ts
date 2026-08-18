import { describe, it, expect } from 'vitest'
import { isMediaObject, flattenMedia, normalizeApiData } from '../lib/api'

// The CMS serves most image fields as a Spatie MediaLibrary object
// ({ url, original, conversions, focal_point, ... }) instead of a plain URL string. Every
// block/template consumes image fields as `string | null`, so an unflattened object rendered
// `<img src="[object Object]">` (diligently.pl's portfolio covers going missing).
describe('isMediaObject()', () => {
  it('recognizes a media object by its url plus conversions/focal_point', () => {
    expect(isMediaObject({ url: 'https://cdn.example/a.jpg', conversions: {} })).toBe(true)
    expect(isMediaObject({ url: 'https://cdn.example/a.jpg', focal_point: null })).toBe(true)
  })

  it('rejects a plain string, null, or an object with a url but neither media key', () => {
    expect(isMediaObject('https://cdn.example/a.jpg')).toBe(false)
    expect(isMediaObject(null)).toBe(false)
    expect(isMediaObject({ url: 'https://cdn.example/a.jpg' })).toBe(false)
  })
})

const media = {
  url: 'https://cdn.example/a.webp',
  original: 'https://cdn.example/a.jpg',
  conversions: {},
  focal_point: null,
}

describe('flattenMedia()', () => {
  it('flattens a media object to its url string', () => {
    expect(flattenMedia(media)).toBe('https://cdn.example/a.webp')
  })

  it('flattens media objects nested at any depth, arrays included, with no exceptions', () => {
    const input = { cover: media, gallery: [media, media], seo: { image: media }, nested: { client_logo: media } }
    expect(flattenMedia(input)).toEqual({
      cover: 'https://cdn.example/a.webp',
      gallery: ['https://cdn.example/a.webp', 'https://cdn.example/a.webp'],
      seo: { image: 'https://cdn.example/a.webp' },
      nested: { client_logo: 'https://cdn.example/a.webp' },
    })
  })

  it('passes through non-media values unchanged', () => {
    expect(flattenMedia('plain string')).toBe('plain string')
    expect(flattenMedia(null)).toBe(null)
    expect(flattenMedia(42)).toBe(42)
  })
})

// A page-level media field (a case study's `cover`) arrives as the whole media object with its
// responsive attributes inside, unlike a block's image which arrives flat beside an explicit
// `<key>_meta`. Flattening used to drop them, so `<img src={cover}>` had no srcset to choose from
// and always fetched the full-size variant.
describe('flattenMedia() — responsive `_meta` siblings', () => {
  const measured = {
    ...media,
    width: 4000,
    height: 3000,
    srcset: 'https://cdn.example/a-640.webp 640w, https://cdn.example/a-1024.webp 1024w',
  }

  it('preserves a flattened media object’s responsive attributes as a `_meta` sibling', () => {
    expect(flattenMedia({ cover: measured })).toEqual({
      cover: 'https://cdn.example/a.webp',
      cover_meta: { width: 4000, height: 3000, srcset: measured.srcset },
    })
  })

  it('emits an index-aligned array for a multi-media field', () => {
    expect(flattenMedia({ gallery: [measured, measured] })).toEqual({
      gallery: ['https://cdn.example/a.webp', 'https://cdn.example/a.webp'],
      gallery_meta: [
        { width: 4000, height: 3000, srcset: measured.srcset },
        { width: 4000, height: 3000, srcset: measured.srcset },
      ],
    })
  })

  it('holds an unmeasured entry’s place as null so later images keep their own metadata', () => {
    const out = flattenMedia({ gallery: [media, measured] }) as { gallery_meta: unknown[] }
    expect(out.gallery_meta).toEqual([null, { width: 4000, height: 3000, srcset: measured.srcset }])
  })

  it('emits nothing when the image carries no measurements at all', () => {
    // Absent and all-null mean the same thing to responsiveImageAttrs, so prefer absent over
    // stamping a useless triple onto every payload.
    expect(flattenMedia({ cover: media })).toEqual({ cover: 'https://cdn.example/a.webp' })
    expect(flattenMedia({ gallery: [media, media] })).toEqual({
      gallery: ['https://cdn.example/a.webp', 'https://cdn.example/a.webp'],
    })
  })

  it('never overwrites a `_meta` sibling the API sent itself', () => {
    // A block's `<key>_meta` is authoritative — BlockResolver builds it deliberately (and omits
    // the media's own alt), so a synthesised one must not replace it.
    const authored = { width: 1, height: 2, srcset: 'authoritative 1w' }
    expect(flattenMedia({ image: measured, image_meta: authored })).toEqual({
      image: 'https://cdn.example/a.webp',
      image_meta: authored,
    })
  })
})

// THE altitude that matters: nothing in production calls flattenMedia on a page item — apiFetch
// and getPage both funnel through normalizeApiData, and `cover`/`gallery`/`thumbnail` are ROOT
// keys of a page (PagePayload merges the media fields into the item root). An earlier version
// synthesised siblings only inside flattenMedia's object loop, which normalizeApiData bypassed
// for root keys, so the headline case — a case study's cover — silently got nothing.
describe('normalizeApiData() — responsive `_meta` on ROOT media fields', () => {
  const measured = {
    url: 'https://cdn.example/a.webp',
    conversions: {},
    focal_point: null,
    width: 4000,
    height: 3000,
    srcset: 'https://cdn.example/a-640.webp 640w, https://cdn.example/a-1024.webp 1024w',
  }
  const meta = { width: 4000, height: 3000, srcset: measured.srcset }

  it('emits the sibling for a root-level media field', () => {
    expect(normalizeApiData({ cover: measured }, new Set(['seo']))).toEqual({
      cover: 'https://cdn.example/a.webp',
      cover_meta: meta,
    })
  })

  it('emits it for a root-level multi-media field', () => {
    expect(normalizeApiData({ gallery: [measured] }, new Set(['seo']))).toEqual({
      gallery: ['https://cdn.example/a.webp'],
      gallery_meta: [meta],
    })
  })

  it('emits it per item when data is a list — the shape getPages returns', () => {
    expect(normalizeApiData([{ cover: measured }], new Set(['seo']))).toEqual([
      { cover: 'https://cdn.example/a.webp', cover_meta: meta },
    ])
  })

  it('leaves a keepRootKeys subtree raw, siblings and all', () => {
    const out = normalizeApiData({ seo: { image: measured }, cover: measured }, new Set(['seo'])) as Record<
      string,
      unknown
    >
    expect(out.seo).toEqual({ image: measured })
    expect(out).not.toHaveProperty('seo_meta')
    expect(out.cover_meta).toEqual(meta)
  })

  it('keeps a block’s own `src_meta` untouched through the real path', () => {
    const authored = { width: 1, height: 2, srcset: 'authoritative 1w' }
    const out = normalizeApiData(
      { blocks: [{ type: 'image_block', data: { src: 'https://cdn.example/flat.webp', src_meta: authored } }] },
      new Set(['seo']),
    ) as { blocks: { data: Record<string, unknown> }[] }
    expect(out.blocks[0].data).toEqual({ src: 'https://cdn.example/flat.webp', src_meta: authored })
  })
})

describe('normalizeApiData()', () => {
  it('keeps a keepRootKeys-listed key as the full object at the root, flattens everything else', () => {
    const input = { seo: { image: media }, cover: media }
    expect(normalizeApiData(input, new Set(['seo']))).toEqual({
      seo: { image: media },
      cover: 'https://cdn.example/a.webp',
    })
  })

  it('applies keepRootKeys per item when data is a list, not to the list itself', () => {
    const input = [
      { seo: { image: media }, cover: media },
      { seo: { image: media }, cover: media },
    ]
    expect(normalizeApiData(input, new Set(['seo']))).toEqual([
      { seo: { image: media }, cover: 'https://cdn.example/a.webp' },
      { seo: { image: media }, cover: 'https://cdn.example/a.webp' },
    ])
  })

  it('does NOT keep a same-named key raw when it appears below the root — only the root field is exempt', () => {
    // An admin-defined custom_fields entry, or a future block field, could plausibly be named
    // "seo" or "logo". Only the page/footer's own top-level field of that name is exempt.
    const input = {
      seo: { image: media },
      custom_fields: [{ key: 'seo', value: media }],
      blocks: [{ type: 'promo_split', data: { logo: media } }],
    }
    expect(normalizeApiData(input, new Set(['seo']))).toEqual({
      seo: { image: media },
      custom_fields: [{ key: 'seo', value: 'https://cdn.example/a.webp' }],
      blocks: [{ type: 'promo_split', data: { logo: 'https://cdn.example/a.webp' } }],
    })
  })

  it('flattens everything when no keepRootKeys are given', () => {
    expect(normalizeApiData({ cover: media })).toEqual({ cover: 'https://cdn.example/a.webp' })
  })
})
