import { describe, expect, it } from 'vitest'
import { footerColumns } from '../lib/footer'
import type { FooterLink, MenuLink } from '../lib/api'

/**
 * The footer's two link sources and the rules between them (dashboard#1852).
 *
 * This is the half of the change an end-to-end run cannot see. The `footer` component is GLOBAL, so
 * one build renders exactly one of the three states, and the mock fixtures ship the component —
 * which means the menu source and the precedence rule would otherwise be covered by nothing but a
 * developer setting ASTRO_MOCK_FOOTER by hand. Every case below is a rule the live fleet depends
 * on, most of all the first: a client that already filled `footer_links` in must see no change when
 * its core pin moves.
 */

const link = (over: Partial<FooterLink> = {}): FooterLink => ({ label: 'Link', href: '/a/', ...over })

const item = (over: Partial<MenuLink> = {}): MenuLink =>
  ({ label: 'Item', href: '/a/', target: 'page', children: [], ...over }) as MenuLink

describe('footerColumns', () => {
  it('takes footer_links when they name anything, and never consults the menu', () => {
    const columns = footerColumns(
      [link({ label: 'Features', href: '/features/', column: 'Product' })],
      [item({ label: 'Should not appear', href: '/nope/' })],
    )

    expect(columns).toHaveLength(1)
    expect(columns[0].heading).toBe('Product')
    expect(columns[0].links.map((l) => l.label)).toEqual(['Features'])
  })

  it('groups footer_links by column, in first-seen order, and drops one with no destination', () => {
    const columns = footerColumns(
      [
        link({ label: 'Pricing', href: '/pricing/', column: 'Product' }),
        link({ label: 'About', href: '/about/', column: 'Company' }),
        link({ label: 'Features', href: '/features/', column: 'Product' }),
        link({ label: 'Dangling', href: undefined, column: 'Product' }),
      ],
      null,
    )

    expect(columns.map((c) => c.heading)).toEqual(['Product', 'Company'])
    expect(columns[0].links.map((l) => l.label)).toEqual(['Pricing', 'Features'])
  })

  it('falls through to the menu when footer_links is absent or empty', () => {
    for (const empty of [undefined, []]) {
      const columns = footerColumns(empty, [item({ label: 'Home', href: '/' })])

      expect(columns).toHaveLength(1)
      expect(columns[0]).toEqual({
        heading: '',
        links: [{ label: 'Home', href: '/', target: undefined, rel: undefined }],
      })
    }
  })

  it('renders a menu group as a labelled column of its children', () => {
    const columns = footerColumns(undefined, [
      item({
        label: 'Company',
        href: null,
        target: 'group',
        children: [item({ label: 'About', href: '/about/' }), item({ label: 'Contact', href: '/contact/' })],
      } as Partial<MenuLink>),
    ])

    expect(columns).toHaveLength(1)
    expect(columns[0].heading).toBe('Company')
    expect(columns[0].links.map((l) => l.label)).toEqual(['About', 'Contact'])
  })

  it('keeps a linked group’s own page, instead of dropping the overview it points at', () => {
    // The #1072 shape: an item that links a page AND owns children. "Has children ⇒ is a group ⇒ has
    // no link of its own" is exactly the derivation lib/menu.ts exists to stop being re-invented.
    const columns = footerColumns(undefined, [
      item({
        label: 'Services',
        href: '/services/',
        children: [item({ label: 'Wiring', href: '/services/wiring/' })],
      }),
    ])

    expect(columns[0].heading).toBe('Services')
    expect(columns[0].links.map((l) => l.href)).toEqual(['/services/', '/services/wiring/'])
  })

  it('keeps an empty group as a column rather than losing its heading', () => {
    // A `target: 'group'` item an editor has not filled yet. Treated as a leaf it would have no
    // href and be dropped, taking the heading with it.
    const columns = footerColumns(undefined, [item({ label: 'Legal', href: null, target: 'group', children: [] })])

    expect(columns).toEqual([{ heading: 'Legal', links: [] }])
  })

  it('opens an external item in a new tab, with the rel that has to accompany it', () => {
    const columns = footerColumns(undefined, [item({ label: 'Docs', href: 'https://example.com', target: 'url' })])

    expect(columns[0].links[0].target).toBe('_blank')
    expect(columns[0].links[0].rel).toBe('noopener noreferrer')
  })

  it('leaves an internal link with no target or rel', () => {
    const columns = footerColumns(undefined, [item({ label: 'Home', href: '/' })])

    expect(columns[0].links[0].target).toBeUndefined()
    expect(columns[0].links[0].rel).toBeUndefined()
  })

  it('returns nothing when the CMS holds neither source, so the caller can fall back', () => {
    expect(footerColumns(undefined, null)).toEqual([])
    expect(footerColumns([], [])).toEqual([])
  })
})
