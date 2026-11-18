import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { canonicalHref, canonicalizeHtmlLinks, siteHosts, writeCanonicalLinks } from '../core/canonicalLinks.mjs'

const hosts = siteHosts('https://www.example.com')
const pages = new Set(['/', '/about/', '/contact/', '/services/lights/'])
const isPage = (route: string) => pages.has(route)

describe('canonicalHref()', () => {
  it.each([
    ['/services/lights', '/services/lights/'],
    ['/about?ref=nav', '/about/?ref=nav'],
    ['/about#team', '/about/#team'],
    ['/index.html', '/'],
    ['/about/index.html', '/about/'],
    ['https://example.com/contact', '/contact/'],
    ['http://www.example.com/about/', '/about/'],
    ['https://www.example.com/', '/'],
  ])('%s -> %s', (from, to) => {
    expect(canonicalHref(from, hosts, isPage)).toBe(to)
  })

  it.each([
    ['/about/'], // already canonical
    ['/missing'], // no such page in the build: left as written
    ['/favicon.svg'], // a file
    ['#contact'],
    ['mailto:hello@example.com'],
    ['tel:+4712345678'],
    ['https://elsewhere.com/x'],
    ['//cdn.example.com/x'],
    [''],
  ])('leaves %s alone', (value) => {
    expect(canonicalHref(value, hosts, isPage)).toBeNull()
  })
})

describe('canonicalizeHtmlLinks()', () => {
  it('rewrites anchor hrefs only, and counts them', () => {
    const html =
      '<p>Energy-saving <a href="/services/lights">lighting</a> and <a class="x" href=\'/about\'>us</a></p>' +
      '<link rel="canonical" href="/about"><code>href="/about"</code>'
    const { html: out, changed } = canonicalizeHtmlLinks(html, hosts, isPage)

    expect(changed).toBe(2)
    expect(out).toContain('<a href="/services/lights/">')
    expect(out).toContain('<a class="x" href=\'/about/\'>')
    expect(out).toContain('<link rel="canonical" href="/about">')
    expect(out).toContain('<code>href="/about"</code>')
  })

  it('keeps an escaped query string as it was', () => {
    const { html } = canonicalizeHtmlLinks('<a href="/contact?a=1&amp;b=2">c</a>', hosts, isPage)

    expect(html).toBe('<a href="/contact/?a=1&amp;b=2">c</a>')
  })
})

describe('writeCanonicalLinks()', () => {
  let dist: string

  beforeEach(async () => {
    dist = await mkdtemp(path.join(tmpdir(), 'canonical-links-'))
  })

  afterEach(async () => {
    await rm(dist, { recursive: true, force: true })
  })

  it('knows the pages from the build itself, and rewrites only links to them', async () => {
    await mkdir(path.join(dist, 'about'), { recursive: true })
    await writeFile(path.join(dist, 'index.html'), '<a href="/about">a</a> <a href="/missing">m</a>')
    await writeFile(path.join(dist, 'about', 'index.html'), '<a href="https://example.com/index.html">home</a>')
    await writeFile(path.join(dist, '404.html'), '<a href="/about">a</a>')

    expect(await writeCanonicalLinks(dist, 'https://www.example.com')).toBe(3)

    expect(await readFile(path.join(dist, 'index.html'), 'utf8')).toBe(
      '<a href="/about/">a</a> <a href="/missing">m</a>',
    )
    expect(await readFile(path.join(dist, 'about', 'index.html'), 'utf8')).toBe('<a href="/">home</a>')
    expect(await readFile(path.join(dist, '404.html'), 'utf8')).toBe('<a href="/about/">a</a>')
  })
})
