// The target list a measure run compares, read from the CONSUMING site rather than from core.
//
// Same split, and for the same reason, as `../vrt/routes.js`: core owns the harness, the site owns
// what to point it at. Everything in `compare-metrics.spec.js` is engine-level — base URLs,
// viewport, which CSS properties are worth reading, the diff — while the addresses and the
// selectors are irreducibly per-site.
//
// Resolved from `process.cwd()`, which Playwright sets to the consuming repo's root, exactly as
// `../vrt/routes.js` and `../conformance/exemptions.js` do. A package cannot relative-import a
// consumer's file, and it must not try: in the dev tree core is a workspace symlink whose realpath
// escapes `node_modules`, so anything that works by relative path here works nowhere else.
//
// JSON, not `.ts`, for the reason `../conformance/README.md` records: Node refuses to strip types
// under `node_modules`, and reaching a `.ts` file in the SITE means a runtime `import()` whose type
// stripping depends on the consumer's Node minor. Prose lives under `_`-prefixed keys.
import { readFileSync, existsSync } from 'node:fs'
import path from 'node:path'

export const TARGETS_FILE = path.join('tests', 'measure.targets.json')

/**
 * @typedef {object} MeasureTarget
 * @property {string} name                    filename stem for artefacts, and what MEASURE_NAMES filters on
 * @property {string} path                    the address on the NEW build
 * @property {string} oldPath                 the address on the reference — `path` unless overridden
 * @property {Record<string,string>} selectors label → CSS selector, measured on BOTH sides
 */

/**
 * Reads the site's list, or THROWS with the path it looked at.
 *
 * Deliberately not tolerant, for the same reason `../vrt/routes.js` is not: a harness that quietly
 * falls back to something reports a green-looking run and hides that the comparison never
 * happened. A tool whose entire premise is "nobody was looking" must not have that failure mode.
 *
 * @param {string} [cwd] the consuming repo's root; defaults to Playwright's cwd
 * @returns {{ targets: MeasureTarget[], oldDismiss: string | null }}
 */
export function loadTargets(cwd = process.cwd()) {
  const file = path.join(cwd, TARGETS_FILE)
  if (!existsSync(file)) {
    throw new Error(
      `[measure] no target list at ${file}. The harness ships with @rocksoft/cms-starter-core but ` +
        `the addresses and selectors are this site's — create ${TARGETS_FILE} with one entry per ` +
        `layout you are porting, e.g. ` +
        `{ "targets": [ { "name": "post", "path": "/blogg/x/", "selectors": { "cover": ".post-cover img" } } ] }.`,
    )
  }

  const raw = JSON.parse(readFileSync(file, 'utf8'))
  const listed = raw.targets ?? []
  const targets = []
  const seen = new Set()

  for (const entry of listed) {
    if (!entry?.name || !entry?.path) {
      // Loud rather than skipped in silence: a typo'd key would otherwise shorten the run by one
      // target and read exactly like a target that matched.
      throw new Error(
        `[measure] ${TARGETS_FILE}: every target needs a \`name\` and a \`path\` — got ${JSON.stringify(entry)}`,
      )
    }
    if (seen.has(entry.name)) {
      // Artefacts are keyed by name, so a duplicate silently overwrites the earlier one's report
      // while both tests report green.
      throw new Error(`[measure] ${TARGETS_FILE}: duplicate target name "${entry.name}" — artefacts are keyed by name`)
    }
    const selectors = entry.selectors ?? {}
    if (!Object.keys(selectors).length) {
      // A target with no selectors measures nothing and passes, which is the same lie as a missing
      // file — just scoped to one entry.
      throw new Error(
        `[measure] ${TARGETS_FILE}: target "${entry.name}" lists no selectors, so it would measure ` +
          `nothing and still pass. Give it { "selectors": { "<label>": "<css>" } }.`,
      )
    }
    seen.add(entry.name)
    // `old_path` is what makes this usable for porting a STATIC PROTOTYPE and not only for
    // replacing a live site: a prototype answers at `/kontakt.html` where the built site answers at
    // `/kontakt/`. Defaults to `path`, which is the old-site case where they agree.
    targets.push({ name: entry.name, path: entry.path, oldPath: entry.old_path ?? entry.path, selectors })
  }

  if (!targets.length) {
    throw new Error(
      `[measure] ${TARGETS_FILE} lists no targets — nothing to compare. Expected ` +
        `{ "targets": [ { "name": "post", "path": "/blogg/x/", "selectors": { … } } ] }.`,
    )
  }

  // Clicked on the REFERENCE side before measuring: a consent modal covers the viewport and shifts
  // what is under it, which moves every box this reads. Belongs to the site because it belongs to
  // whatever stack the reference runs (Cookiebot's is `#CybotCookiebotDialogBodyButtonDecline`).
  // Shares the key name with `vrt.routes.json` so a site that has already worked it out once for
  // VRT can paste the same value.
  const oldDismiss = (typeof raw.old_dismiss === 'string' ? raw.old_dismiss.trim() : '') || null

  return { targets, oldDismiss }
}
