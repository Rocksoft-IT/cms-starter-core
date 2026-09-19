// The one line a build prints when a page carries a block nobody renders — shared by
// BlockRenderer.astro (which decides the skip) and its test. Kept apart from the component for the
// reason customCode.ts is: the part worth testing is the sentence and the once-per-type memory,
// and a .astro file cannot be imported by vitest.
//
// Before this the skip was SILENT — `return null`, a hole in the page, no log line. The only guard
// was the type-drift gate in each client repo's `scripts/`, a client-owned file frozen at
// provisioning; this ships with core, so a pin bump delivers it to every client, and it reports
// the ACTUAL drop rather than the possible one. The story is in the dashboard's
// docs/agents/frontend-and-fleet.md → "The block gate must not fail a production build" (#2307).
//
// `[cms]` is the contract with the panel: `App\Services\Deploy\BuildWarnings::PREFIXES` lifts
// every deploy-log line that opens with it onto the build's `warnings`, shown by
// `frontend_build_status` and the Frontend Deploys page (dashboard #2064). See
// tests/warning-prefixes.test.ts, which pins the opening.

import { onceLatch } from './onceLatch'

/** Once per type per build — a 750-page site prints one line per type, not 750. */
const reported = onceLatch()

/**
 * Report a block the renderer is about to skip because `cms.config.ts` registers no component
 * for its type. Later sightings of the same type are silent.
 *
 * @param type   the block's `type`, as the CMS emits it
 * @param where  the page being built (a path), so the first sighting is findable
 */
export function reportUnregisteredBlock(type: string, where: string): void {
  if (!reported.first(type)) return

  console.warn(
    `[cms] Skipped block(s) of unregistered block type "${type}" (first seen on "${where}") — they render as nothing. ` +
      'Register the type in cms.config.ts `blocks`, or bump the core pin to a release that ships it.',
  )
}

/** Test seam: forget what has been reported. */
export function resetUnregisteredBlockReports(): void {
  reported.reset()
}
