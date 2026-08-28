import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, test } from 'vitest'
import { coreShortcuts } from '../core/uno.core'

/**
 * Every class hook `Footer.astro` emits has a shortcut that paints it (dashboard#1852).
 *
 * The failure this pins is invisible to everything else: an unstyled element is a rendering, not an
 * error, so the build, `astro check` and the whole suite stayed green while a generated client site
 * ended in a black-on-white column of browser-default bullet lists at the viewport edge. It went
 * unnoticed for as long as it did because the paint was nobody's job — the component deferred it to
 * a site stylesheet that ships empty.
 *
 * It lives in CORE's suite rather than the site's, and that placement is load-bearing.
 * `packages/` is stripped from every generated client repo (`StarterTemplate::EXCLUDED_PREFIXES`)
 * while `tests/` is copied verbatim and the client CI runs `pnpm test:unit` — so the same
 * assertions under `frontend/tests/unit/` would ENOENT at module load in every client repo, and,
 * worse, would fail a client that had legitimately rewritten its own footer. Here it asserts only
 * what CORE owes, in the one tree where core exists.
 */

const CORE = join(dirname(fileURLToPath(import.meta.url)), '..', 'core')

const footerSource = readFileSync(join(CORE, 'Footer.astro'), 'utf8')

/** Static class hooks in the component's markup, minus Astro's dynamic forms. */
function hooksOf(source: string): string[] {
  // `indexOf` from past the opening fence, not `lastIndexOf`: the latter finds the last `---`
  // ANYWHERE, so one inside a template comment would silently shrink the scan.
  const markup = source.slice(source.indexOf('---', 3) + 3)
  const hooks = [
    ...markup.matchAll(/\bclass="([^"{}]+)"/g),
    ...markup.matchAll(/\bclass:list=\{\[([^\]]*)\]\}/g),
  ].flatMap(([, value]) =>
    value
      .replace(/['"`,]/g, ' ')
      .trim()
      .split(/\s+/),
  )

  return [...new Set(hooks.filter(Boolean))]
}

/**
 * Hooks core deliberately leaves unpainted. May shrink; an addition needs a stated reason — an entry
 * here is a class the markup carries and no shortcut paints, which is a gap unless the element
 * genuinely needs nothing of its own.
 */
// `footer-column` is a bare grid item: `footer-columns` sets the track and the heading and list own
// the rest, so there is nothing for it to declare.
const UNPAINTED = new Set(['footer-column'])

describe('the footer hooks core emits are painted by core', () => {
  test('the scan actually sees the hooks', () => {
    // Without this the suite passes vacuously the moment the markup or the scan changes shape —
    // the failure mode a "nothing found, therefore fine" assertion always has.
    const hooks = hooksOf(footerSource)
    expect(hooks).toContain('site-footer')
    expect(hooks.length).toBeGreaterThan(5)
  })

  test('every hook has a shortcut', () => {
    const unpainted = hooksOf(footerSource).filter((hook) => !UNPAINTED.has(hook) && !(hook in coreShortcuts))

    expect(unpainted, `no coreShortcuts entry paints: ${unpainted.join(', ')}`).toEqual([])
  })

  test('the allowlist names only hooks the markup still carries', () => {
    const hooks = new Set(hooksOf(footerSource))
    expect([...UNPAINTED.keys()].filter((hook) => !hooks.has(hook))).toEqual([])
  })

  test('the footer composes the shared primitives instead of restating them', () => {
    // A hand-rolled `w-[90%] max-w-[var(--layout-container)] mx-auto` would render identically today
    // and then silently stop following a site that retunes `container-global` — the seam tokens.css
    // calls "the default channel". section-widths.spec.ts polices that invariant by SELECTOR, so it
    // cannot see a footer that only happens to match.
    expect(coreShortcuts['footer-inner']).toContain('container-global')
    expect(coreShortcuts['footer-links']).toContain('list-reset')
    expect(coreShortcuts['footer-social']).toContain('list-reset')
    expect(coreShortcuts['site-footer']).toContain('section-y')
  })

  test('no shortcut hardcodes a colour outside a var() fallback', () => {
    // Core ships to every client, so a literal would bake one client's palette into all of them.
    // Same rule verify-core-styleless.mjs enforces on core's scoped CSS — including its carve-out:
    // a hex INSIDE `var(--token, #fff)` is that token's own last resort, not a brand value, which
    // is why `section-band` legitimately carries six. Whole object rather than the footer's keys:
    // with the carve-out it passes today, so the wider net costs nothing and covers every future
    // key too.
    for (const [key, value] of Object.entries(coreShortcuts)) {
      const outsideFallbacks = value.replace(/var\([^)]*\)/g, ' ')
      expect(outsideFallbacks, `${key} hardcodes a colour`).not.toMatch(/#[0-9a-fA-F]{3,8}\b/)
    }
  })
})
