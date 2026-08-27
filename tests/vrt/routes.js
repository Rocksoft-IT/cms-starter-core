// The route list a VRT run compares, read from the CONSUMING site rather than from core.
//
// Core owns the harness; the site owns what to point it at. That is the whole of the split, and
// it is the conformance floor's (context/discovery/decisions/0004-conformance-floor-ships-with-
// core.md): everything in `compare-old-vs-new.spec.js` is engine-level — base URLs, viewport,
// scroll-before-capture, the diff — while the addresses are irreducibly per-site.
//
// Resolved from `process.cwd()`, which Playwright sets to the consuming repo's root, exactly as
// `tests/conformance/exemptions.js` resolves `tests/conformance.exemptions.json`. A package cannot
// relative-import a consumer's file, and it must not try: in the dev tree core is a workspace
// symlink whose realpath escapes `node_modules`, so anything that works by relative path here
// works nowhere else.
//
// JSON, not `routes.ts`, for the reason `../conformance/README.md` records at length. Core's own
// spec must be JavaScript because Node refuses to strip types under `node_modules`; a `.ts` file
// in the SITE is outside that jail, but reaching it means a runtime `import()` whose type
// stripping depends on the consumer's Node minor (off by default before 22.18, and this fleet
// pins `node >= 22.12`). A JSON file has none of that surface. Prose lives under `_`-prefixed
// keys, the convention `conformance.exemptions.json` already uses.
import { readFileSync, existsSync } from 'node:fs'
import path from 'node:path'

export const ROUTES_FILE = path.join('tests', 'vrt.routes.json')

/**
 * @typedef {object} VrtRoute
 * @property {string} name       filename stem for this route's artefacts, and what VRT_ROUTE_NAMES filters on
 * @property {string} path       the address on the NEW build
 * @property {string} oldPath    the address on the reference — `path` unless the entry overrode it
 */

/**
 * Reads the site's list, or THROWS with the path it looked at.
 *
 * Deliberately not tolerant, for the reason the conformance fixtures are not: a harness that
 * quietly falls back to `['/']` reports a green-looking single-route run and hides that ~90% of
 * the comparison never happened. A tool whose entire premise is "nobody was looking" must not have
 * that failure mode.
 *
 * @param {string} [cwd] the consuming repo's root; defaults to Playwright's cwd
 * @returns {{ routes: VrtRoute[], oldDismiss: string | null }}
 */
export function loadRoutes(cwd = process.cwd()) {
  const file = path.join(cwd, ROUTES_FILE)
  if (!existsSync(file)) {
    throw new Error(
      `[vrt] no route list at ${file}. The harness ships with @rocksoft/cms-starter-core but the ` +
        `addresses are this site's — create ${ROUTES_FILE} with one entry per DISTINCT LAYOUT ` +
        `(not per page: each entry is two full-page screenshots and a pixel diff).`,
    )
  }

  const raw = JSON.parse(readFileSync(file, 'utf8'))
  const listed = raw.routes ?? []
  const routes = []
  const seen = new Set()

  for (const entry of listed) {
    if (!entry?.name || !entry?.path) {
      // Loud rather than skipped in silence: a typo'd key would otherwise shorten the run by one
      // route and read exactly like a route that passed.
      throw new Error(
        `[vrt] ${ROUTES_FILE}: every route needs a \`name\` and a \`path\` — got ${JSON.stringify(entry)}`,
      )
    }
    if (seen.has(entry.name)) {
      // Artefacts are keyed by name, so a duplicate silently overwrites the earlier route's PNGs
      // and report while both tests report green.
      throw new Error(`[vrt] ${ROUTES_FILE}: duplicate route name "${entry.name}" — artefacts are keyed by name`)
    }
    seen.add(entry.name)
    // `old_path` is what makes this usable for porting a STATIC PROTOTYPE and not only for
    // replacing a live site: a prototype answers at `/kontakt.html` where the built site answers
    // at `/kontakt/`, so the two sides need separate addresses. Defaults to `path`, which is the
    // old-site case where they agree.
    routes.push({ name: entry.name, path: entry.path, oldPath: entry.old_path ?? entry.path })
  }

  if (!routes.length) {
    // Names the shape, because "lists no routes" is also what a file written as a bare array
    // produces, and that is the likeliest way to get here.
    throw new Error(
      `[vrt] ${ROUTES_FILE} lists no routes — nothing to compare. Expected ` +
        `{ "routes": [ { "name": "home", "path": "/" } ] }.`,
    )
  }

  // A selector clicked on the REFERENCE side before capture, since a consent modal covers most of
  // the viewport and makes every diff meaningless. It belongs to the site because it belongs to
  // whatever stack the reference runs (Cookiebot's is
  // `#CybotCookiebotDialogBodyButtonDecline`); a static prototype has none and sets nothing, and
  // then the run pays nothing for it. The NEW side's banner is core's own and the spec knows it.
  const oldDismiss = (typeof raw.old_dismiss === 'string' ? raw.old_dismiss.trim() : '') || null

  return { routes, oldDismiss }
}
