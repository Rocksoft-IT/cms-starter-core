import type { MenuLink } from './api'
import { href } from './href'

/**
 * The *shape* rules for a header/footer menu item, in one place.
 *
 * Every site renders the menu itself — markup and CSS are per-repo, core carries no visual
 * values — but the questions the markup asks of an item are the same everywhere, and they used to
 * be re-answered by hand in each `Navbar.astro`. That is how dashboard #1077 happened: the CMS
 * learned to accept a top-level item that links a page AND owns children (#1072), and no frontend
 * learned to render it, because "has children ⇒ is a group ⇒ has no link of its own" was written
 * out fresh in every client repo. Hoisting the derivation means the next such change reaches a
 * site through **Update starter** (a core pin bump) instead of a hand-written patch — which is the
 * only propagation path a client repo actually has, since it never re-syncs template files.
 *
 * The failure this guards against is silent end to end: the panel accepts the shape, the API
 * serves `href` + `children` correctly, and the nav simply does not link. Nothing logs.
 */

/**
 * Does this item open a dropdown?
 *
 * Two independent reasons: the editor made it an explicit `group` (a label with no destination,
 * which is a dropdown even before anything hangs under it), or it carries children — including
 * the linked-group case, where it is *also* a link. `isDropdown` deliberately says nothing about
 * whether the label navigates; `groupHref` answers that.
 *
 * `children` is declared non-optional on `MenuLink` and `MenuApiController::resolveNode()` always
 * emits the key (`[]` for a leaf), so the live payload is safe. The array check is for the other
 * source: `getMenu()` casts unvalidated JSON, and each site hand-writes its own
 * `src/fixtures/data/menus.*.json` for mock builds. A fixture that forgot the key should render a
 * plain link, not crash the build with "cannot read properties of undefined".
 */
export function isDropdown(item: MenuLink): boolean {
  return item.target === 'group' || (Array.isArray(item.children) && item.children.length > 0)
}

/**
 * A dropdown's own destination, or `undefined` when it has none.
 *
 * The editor linked the parent item to a page AND gave it children — a section with an overview
 * page plus its sub-pages. The label then has to be a real link, and the caret becomes a separate
 * control; rendering the label as a bare disclosure button is what leaves that overview page with
 * no entry point in the navigation at all. A `target: 'group'` item has no href to begin with, so
 * its label stays the disclosure it has always been.
 *
 * Returns `undefined` rather than `null` to match `href()`, which this wraps and whose result the
 * callsites already consume as `ownHref ? … : …` or `?? '#'`. (`pathForLocale()` returns `null`
 * because it answers a different question — "does this page have an address in this locale" — and
 * matching the function this one actually wraps beats matching one it does not.)
 *
 * Only a dropdown has a "group href": a leaf renders from `item.href` directly, so asking this of
 * one is a category error and gets `undefined`.
 */
export function groupHref(item: MenuLink): string | undefined {
  return isDropdown(item) ? href(item.href) : undefined
}

/** External items (`url`) leave the site, so they open in a new tab; internal ones navigate in place. */
export function linkTarget(item: MenuLink): '_blank' | undefined {
  return item.target === 'url' ? '_blank' : undefined
}

/** The `rel` that has to accompany `linkTarget`'s `_blank` — never one without the other. */
export function linkRel(item: MenuLink): string | undefined {
  return item.target === 'url' ? 'noopener noreferrer' : undefined
}

/**
 * A stable DOM id for a group's panel, so its trigger can point `aria-controls` at it.
 *
 * Derived from the label, which is what distinguishes one group from another in a CMS-driven
 * header — there is no id in the render payload to key on. A label that slugifies to nothing
 * (punctuation only, or empty) falls back to `group` rather than emitting a bare prefix: two such
 * groups would otherwise share an id and their triggers would both claim the same panel.
 */
export function dropdownId(item: MenuLink): string {
  const slug = (item.label ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')

  return `nav-group-${slug || 'group'}`
}
