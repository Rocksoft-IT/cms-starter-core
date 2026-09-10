import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, test } from 'vitest'

// A build reports what it DROPPED by writing to the console and carrying on — a page type the
// repo does not register, two pages colliding on one URL, a snippet it refused to ship, an
// analytics id that is malformed or switched off by consent. "Report, do not throw" is the right
// call (see warnOnDuplicateUris: a build that fails outright over stale content an editor has not
// fixed yet is worse than one that says which page it dropped), and it stays.
//
// But those lines are now READ. The dashboard's CheckBuildStatusJob scans this build's deploy log
// after every build and stores what it finds on the BuildLog row, so a drop shows up on the
// Frontend Deploys page and in `frontend_build_status` instead of only in a file on the deploy
// host that nothing opened on a successful build (dashboard #2064, symptom #2061 — /blog and
// /portfolio answered 403 on a build that reported `completed`).
//
// That scanner matches on the PREFIX, deliberately, so a sixth warning added here is surfaced
// without anyone having to remember the panel. The prefixes are therefore a contract between two
// repos, and this test is that contract's only guard: rename `[cms]` to `[routing]` and every
// existing client's drops go silently unreported again — the exact failure, one level up.
//
// To add a warning: use one of these prefixes. To add a PREFIX: add it here and to
// App\Services\Deploy\BuildWarnings::PREFIXES in the dashboard, in that order.

const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, '..')

/** Kept in sync with App\Services\Deploy\BuildWarnings::PREFIXES (diligently-dashboard). */
const PREFIXES = ['[cms]', '[custom-code]', '[consent]']

/** Every module that reports a drop, and the prefix its messages must carry. */
const SOURCES: Array<{ file: string; prefix: string }> = [
  { file: 'core/routing.ts', prefix: '[cms]' },
  { file: 'core/customCode.ts', prefix: '[custom-code]' },
  { file: 'core/analytics.ts', prefix: '[consent]' },
]

const read = (file: string): string => readFileSync(join(root, file), 'utf8')

/** The first argument of every `console.warn(` in `source`, roughly — enough to see its opening. */
function warnOpenings(source: string): string[] {
  return [...source.matchAll(/console\.warn\(\s*([`'"])/g)].map((match) => {
    const from = match.index! + match[0].length

    return source.slice(from, from + 40)
  })
}

describe('build warnings keep the prefixes the dashboard scans for', () => {
  test.each(SOURCES)('every console.warn in $file opens with $prefix', ({ file, prefix }) => {
    const openings = warnOpenings(read(file))

    // A source listed here with no warnings left has been refactored out from under this test,
    // which would leave it passing vacuously — the way a guard stops guarding.
    expect(openings.length).toBeGreaterThan(0)

    for (const opening of openings) {
      expect(opening.startsWith(prefix)).toBe(true)
    }
  })

  test('no module reports a drop under a prefix the dashboard does not scan for', () => {
    // The whole-package sweep behind the per-file assertions above: a NEW module that starts
    // warning under `[seo]` would pass every case above by not being listed, and its drops would
    // be invisible in the panel with nothing to say so.
    for (const { file } of SOURCES) {
      for (const opening of warnOpenings(read(file))) {
        expect(PREFIXES.some((prefix) => opening.startsWith(prefix))).toBe(true)
      }
    }
  })

  test('the five shipped drop reports are still phrased as drops', () => {
    // Not pinning whole sentences — they should be free to improve. Pinning the CLAIM: each of
    // these says something is absent from the built site, which is what makes it worth surfacing
    // rather than a note about something that worked.
    const routing = read('core/routing.ts')
    expect(routing).toContain('unregistered page type')
    expect(routing).toContain('will 404')
    expect(routing).toContain('resolve to')

    expect(read('core/customCode.ts')).toContain('NOT shipped')

    const analytics = read('core/analytics.ts')
    expect(analytics).toContain('ignored')
    expect(analytics).toContain('ships no analytics and no banner')
  })
})
