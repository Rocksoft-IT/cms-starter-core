// Which repo's list a harness run reads — the cwd it is invoked from, or another checkout named on
// the environment.
//
// Both harnesses resolve the site's half of themselves (`tests/vrt.routes.json`,
// `tests/measure.targets.json`, `tests/measure.baseline/`) from `process.cwd()`, because Playwright
// sets that to the consuming repo's root and a package cannot relative-import a consumer's file.
// That is right for a site testing itself and wrong for the case this adds: the tooling, the skills
// and the agent guidance live in the STARTER DEV TREE, while a client repo receives them once at
// provisioning and never again (dashboard#1694). Pointing the harness at a client checkout is
// cheaper than shipping the guidance seven ways — and it is the difference between "core owns the
// walk" reaching a repo that has not been re-stamped since July, and not.
//
//   MEASURE_REPO=../../www/allteck NEW_BASE_URL=https://allteck.no \
//   OLD_BASE_URL=https://old.allteck.no pnpm test:measure
//
// Reads only. Artefacts a run produces to be LOOKED AT (`test-results/`) stay in the cwd of
// whoever ran it: they are scratch, git-ignored, and belong to the operator. The one artefact that
// is COMMITTED — the measure baseline — is written under this root instead, because it is the
// measured site's own data and belongs in the measured site's repo.
import { existsSync, statSync } from 'node:fs'
import path from 'node:path'

/**
 * The repo whose lists this run reads.
 *
 * @param {string} envVar  `MEASURE_REPO` or `VRT_REPO`
 * @param {string} tool    prefix for the error message, e.g. `measure`
 * @returns {string} an absolute path — `process.cwd()` when the variable is unset
 */
export function siteRoot(envVar, tool) {
  const named = process.env[envVar]?.trim()
  if (!named) return process.cwd()

  // Relative to the cwd, so `MEASURE_REPO=../allteck` reads the way it looks from a shell.
  const root = path.resolve(process.cwd(), named)

  // Checked here rather than left to the "no list at <path>" error below it: a typo'd or moved
  // checkout would otherwise be reported as a site that has not wired the harness up, which sends
  // the reader to the wrong file entirely.
  if (!existsSync(root) || !statSync(root).isDirectory()) {
    throw new Error(`[${tool}] ${envVar}=${named} is not a directory (resolved to ${root}).`)
  }

  return root
}
