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
