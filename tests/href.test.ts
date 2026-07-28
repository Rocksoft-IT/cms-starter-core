import { describe, it, expect } from 'vitest'
import { href } from '../lib/href'

// The starter ships `trailingSlash: 'always'`, so an internal link without the slash 404s in dev.
// The API is inconsistent about it — a section_teaser item's `path` has no slash, a page's
// `translations[].path` does — which is what these cases pin down.
describe('href()', () => {
  it('adds the slash to an internal path that lacks one', () => {
    expect(href('/blog/some-post')).toBe('/blog/some-post/')
    expect(href('/about')).toBe('/about/')
  })

  it('leaves an already-normalized path alone', () => {
    expect(href('/blog/some-post/')).toBe('/blog/some-post/')
    expect(href('/')).toBe('/')
  })

  it('never rewrites another origin', () => {
    expect(href('https://ebok.example.pl')).toBe('https://ebok.example.pl')
    expect(href('mailto:office@example.pl')).toBe('mailto:office@example.pl')
    expect(href('tel:+48221234567')).toBe('tel:+48221234567')
    expect(href('//cdn.example.pl/asset')).toBe('//cdn.example.pl/asset')
  })

  it('puts the slash on the path, not after a fragment or query', () => {
    expect(href('/contact#office')).toBe('/contact/#office')
    expect(href('/search?q=roof')).toBe('/search/?q=roof')
    expect(href('#section')).toBe('#section')
  })

  it('leaves a real file alone', () => {
    expect(href('/sitemap.xml')).toBe('/sitemap.xml')
    expect(href('/files/regulamin.pdf')).toBe('/files/regulamin.pdf')
  })

  it('answers undefined for nothing to link to', () => {
    expect(href(null)).toBeUndefined()
    expect(href(undefined)).toBeUndefined()
    expect(href('   ')).toBeUndefined()
  })
})
