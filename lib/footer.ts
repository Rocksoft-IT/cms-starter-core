import type { FooterLink, MenuLink } from './api'
import { groupHref, isDropdown, linkRel, linkTarget } from './menu'
import { href } from './href'

/**
 * The footer's link columns, from whichever of the two CMS sources has them.
 *
 * A pure function rather than a loop inside `core/Footer.astro`, because the branch that matters is
 * the one an automated run never reaches: the `footer` component is global, so a single build shows
 * exactly one of the three states and the mock fixtures ship the component — meaning the menu
 * source would otherwise be exercised by nothing but a human with an env var set. Here it is
 * ordinary code with ordinary tests.
 *
 * PRECEDENCE. `footer_links` wins whenever it names anything at all. An editor who filled it in
 * meant those links, and a menu quietly replacing them would be a change nobody asked for arriving
 * on a core pin bump — which is what makes this safe to ship to the existing fleet.
 *
 * THE MENU MAPPING is the panel's model, not a new one: a group becomes a column (its label the
 * heading, its children the links) and a top-level leaf becomes a link in the unlabelled column,
 * which is what a one-item default menu is. Every question about an item's shape is asked through
 * `lib/menu.ts` rather than re-derived here — that module exists because "has children ⇒ is a
 * group ⇒ has no link of its own" had been written out by hand in each frontend and got #1077
 * wrong. Re-deriving it would lose the same three things it did:
 *
 *   - a `target: 'group'` item with no children yet is still a column, not a link with no href;
 *   - a group that ALSO links a page keeps its own entry (`#1072`), instead of the overview page
 *     vanishing from the footer;
 *   - an external `url` item keeps `target="_blank"` and its `rel`, like every other outbound link
 *     core renders.
 */
export interface FooterColumnLink {
  label: string
  href: string
  /** `_blank` for an external item; undefined for an internal one. */
  target?: string
  /** Always accompanies `target`; never one without the other. */
  rel?: string
}

export interface FooterColumn {
  /** The column's heading, or '' for the unlabelled column. */
  heading: string
  links: FooterColumnLink[]
}

/** A `footer_links` entry has no target of its own — the CMS stores a bare href. */
function fromFooterLink(link: FooterLink): FooterColumnLink | null {
  return link.href ? { label: link.label ?? link.href, href: href(link.href) ?? link.href } : null
}

function fromMenuLink(item: MenuLink, ownHref?: string): FooterColumnLink | null {
  const destination = ownHref ?? href(item.href)

  return destination
    ? { label: item.label ?? destination, href: destination, target: linkTarget(item), rel: linkRel(item) }
    : null
}

/** Append to the column named `heading`, creating it in first-seen order. */
function push(columns: Map<string, FooterColumnLink[]>, heading: string, link: FooterColumnLink | null): void {
  if (!link) return
  if (!columns.has(heading)) columns.set(heading, [])
  columns.get(heading)!.push(link)
}

export function footerColumns(footerLinks: FooterLink[] | undefined, menu: MenuLink[] | null): FooterColumn[] {
  const columns = new Map<string, FooterColumnLink[]>()

  if (footerLinks && footerLinks.length > 0) {
    for (const link of footerLinks) push(columns, link.column ?? '', fromFooterLink(link))
  } else {
    for (const item of menu ?? []) {
      if (!isDropdown(item)) {
        push(columns, '', fromMenuLink(item))
        continue
      }

      // A linked group keeps its own entry, at the top of its column — the overview page an editor
      // deliberately attached to the group, which "children ⇒ no link of its own" used to discard.
      const heading = item.label ?? ''
      push(columns, heading, fromMenuLink(item, groupHref(item)))
      for (const child of item.children ?? []) push(columns, heading, fromMenuLink(child))

      // A group an editor has not filled yet is still a column, so its heading does not disappear.
      if (!columns.has(heading)) columns.set(heading, [])
    }
  }

  return [...columns].map(([heading, links]) => ({ heading, links }))
}
