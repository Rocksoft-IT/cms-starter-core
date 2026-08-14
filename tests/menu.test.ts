import { describe, it, expect } from 'vitest'
import type { MenuLink } from '../lib/api'
import { isDropdown, groupHref, linkTarget, linkRel, dropdownId } from '../lib/menu'

// The shape rules these pin are the ones that produced dashboard #1077: every client's
// Navbar.astro re-derived them by hand, and `children.length > 0 ⇒ group` threw the parent's own
// destination away. The point of the module under test is that there is now one definition to pin.

const link = (over: Partial<MenuLink> = {}): MenuLink => ({
  label: 'Item',
  href: '/about',
  target: 'page',
  children: [],
  ...over,
})

const child = link({ label: 'Child', href: '/about/team' })

describe('isDropdown()', () => {
  it('is true for an explicit group', () => {
    // A `group` item has no destination of its own — the target alone says "dropdown", and it says
    // so even before the editor has hung anything under it.
    expect(isDropdown(link({ target: 'group', href: null }))).toBe(true)
  })

  it('is true for a page item that owns children', () => {
    expect(isDropdown(link({ target: 'page', href: '/about', children: [child] }))).toBe(true)
  })

  it('is false for a leaf, internal or external', () => {
    expect(isDropdown(link({ target: 'page' }))).toBe(false)
    expect(isDropdown(link({ target: 'url', href: 'https://ebok.example.pl' }))).toBe(false)
  })

  it('treats a payload with no children array as a leaf rather than throwing', () => {
    // `MenuApiController::resolveNode()` always emits the key, so the live payload is safe — but
    // `getMenu()` casts unvalidated JSON and every site hand-writes its own fixture menus. A
    // fixture that omits `children` should render a plain link, not fail the build.
    expect(isDropdown({ label: 'Item', href: '/about', target: 'page' } as MenuLink)).toBe(false)
    expect(isDropdown({ ...link(), children: null } as unknown as MenuLink)).toBe(false)
  })
})

describe('groupHref()', () => {
  it('keeps the destination of a group that links a page of its own', () => {
    // The whole of #1072/#1077: this item is BOTH a link and a dropdown, and the href survives.
    // Normalized through href(), so the starter's `trailingSlash: 'always'` holds.
    expect(groupHref(link({ target: 'page', href: '/about', children: [child] }))).toBe('/about/')
  })

  it('is undefined for a group with nothing to navigate to', () => {
    expect(groupHref(link({ target: 'group', href: null, children: [child] }))).toBeUndefined()
  })

  it('is undefined for a leaf — it answers a question only a dropdown asks', () => {
    // A plain link renders from `item.href` directly; this helper exists to decide whether a
    // dropdown's LABEL is a link, so a leaf has no group href by construction.
    expect(groupHref(link({ target: 'page', href: '/about' }))).toBeUndefined()
  })

  it('leaves another origin alone', () => {
    const external = link({ target: 'url', href: 'https://ebok.example.pl', children: [child] })

    expect(groupHref(external)).toBe('https://ebok.example.pl')
  })
})

describe('linkTarget() / linkRel()', () => {
  it('opens an external item in a new tab, safely', () => {
    const external = link({ target: 'url', href: 'https://ebok.example.pl' })

    expect(linkTarget(external)).toBe('_blank')
    expect(linkRel(external)).toBe('noopener noreferrer')
  })

  it('leaves an internal item to navigate in place', () => {
    expect(linkTarget(link({ target: 'page' }))).toBeUndefined()
    expect(linkRel(link({ target: 'page' }))).toBeUndefined()
  })
})

describe('dropdownId()', () => {
  it('derives a stable DOM id from the label', () => {
    // The label is what distinguishes one group from another in a CMS-driven header, so it is what
    // `aria-controls` has to key on.
    expect(dropdownId(link({ label: 'O Spółdzielni' }))).toBe('nav-group-o-sp-dzielni')
    expect(dropdownId(link({ label: 'News & Events' }))).toBe('nav-group-news-events')
  })

  it('never emits a bare prefix for a label that slugifies to nothing', () => {
    // Two such groups would otherwise share an id, and `aria-controls` would point both triggers
    // at the same panel.
    expect(dropdownId(link({ label: '—' }))).toBe('nav-group-group')
    expect(dropdownId(link({ label: '' }))).toBe('nav-group-group')
  })
})
