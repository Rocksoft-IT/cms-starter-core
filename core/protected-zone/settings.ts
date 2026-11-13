// The BUILD-TIME half of the protected zone: whether this client has it, where its API lives, and
// the one line a build prints when a page carries the block while it is off. Kept apart from the
// component because a .astro file cannot be imported by vitest — the split unregisteredBlocks.ts
// makes.
//
// The switch is `site-settings.protected_zone`. ABSENT means off: a mock build, an older panel and
// a failed settings fetch all look like that, and each must render the "unavailable" notice rather
// than a form posting to nowhere.
//
// `[cms]` is the prefix the panel lifts onto the build's warnings (see unregisteredBlocks.ts), so an
// editor who placed the block before the zone was switched on sees why the page shows a notice.
import type { SiteSettingsData } from '../../lib/api'
import { onceLatch } from '../onceLatch'
import { normalizeZoneEndpoint } from './api'

export type ProtectedZoneSettings =
  { enabled: true; endpoint: string } | { enabled: false; reason: 'disabled' | 'no_endpoint' }

/**
 * The zone as this build should render it. `enabled` with an endpoint that is not an absolute
 * http(s) URL is treated as off (`no_endpoint`): the form's action and every fetch are built from
 * it, so a malformed value would ship a form that cannot work.
 */
export function resolveProtectedZone(settings: SiteSettingsData | null | undefined): ProtectedZoneSettings {
  const zone = settings?.protected_zone
  if (!zone || zone.enabled !== true) return { enabled: false, reason: 'disabled' }

  const endpoint = normalizeZoneEndpoint(zone.endpoint)

  return endpoint ? { enabled: true, endpoint } : { enabled: false, reason: 'no_endpoint' }
}

/** Once per build — a block placed on four pages in three locales prints one line, not twelve. */
const reported = onceLatch()

/**
 * Report a protected_zone block rendered as the "unavailable" notice.
 *
 * @param where   the page being built (a path), so the first sighting is findable
 * @param reason  why the zone is off, from resolveProtectedZone()
 */
export function reportZoneUnavailable(where: string, reason: 'disabled' | 'no_endpoint'): void {
  if (!reported.first('protected_zone')) return

  const why =
    reason === 'disabled'
      ? 'the Protected zone is not enabled for this client (site-settings `protected_zone.enabled`)'
      : 'site-settings `protected_zone.endpoint` is not an absolute http(s) URL'

  console.warn(
    `[cms] A protected_zone block (first seen on "${where}") renders only an "unavailable" notice — ${why}. ` +
      'A Super Admin enables it in Client settings → Protected zone, then rebuilds; or remove the block.',
  )
}

/** Test seam: forget what has been reported. */
export function resetZoneUnavailableReports(): void {
  reported.reset()
}
