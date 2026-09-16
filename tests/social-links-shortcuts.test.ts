import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, test } from 'vitest'
import { coreShortcuts } from '../core/uno.core'

/**
 * Every class hook `SocialLinks.astro` emits has a shortcut that paints it - the same guard
 * `footer-shortcuts.test.ts` holds for the footer, for the same reason: an unstyled element is a
 * rendering, not an error, so the build, `astro check` and the e2e suite all stay green over a row
 * of browser-default bullet points (dashboard#1852). This block is the first the fleet meets with
 * an inline SVG per link, where a missing paint shows as 300px glyphs.
 *
 * `sr-only` is not a hook: it is a preset utility the markup applies for the icons-only variant,
 * which is why it is allowlisted below rather than expected in coreShortcuts.
 */
const CORE = join(dirname(fileURLToPath(import.meta.url)), '..', 'core')
const source = readFileSync(join(CORE, 'blocks', 'SocialLinks.astro'), 'utf8')

/**
 * Static class hooks in the component's markup. A `class="…"` is split on whitespace; a
 * `class:list={[…]}` contributes only its STRING LITERALS, so the expression halves of a
 * conditional entry (`variant === 'icons' && 'sr-only'`) are not mistaken for class names.
 */
function hooksOf(src: string): string[] {
  const markup = src.slice(src.indexOf('---', 3) + 3)
  const plain = [...markup.matchAll(/\bclass="([^"{}]+)"/g)].flatMap(([, value]) => value.trim().split(/\s+/))
  const listed = [...markup.matchAll(/\bclass:list=\{\[([^\]]*)\]\}/g)].flatMap(([, value]) =>
    [...value.matchAll(/'([^']+)'/g)].map(([, literal]) => literal),
  )

  return [...new Set([...plain, ...listed].filter(Boolean))]
}

/** Preset utilities the markup applies directly; anything else the markup carries must be a core shortcut. */
const UTILITIES = new Set(['sr-only'])

describe('the social-links hooks core emits are painted by core', () => {
  test('the scan actually sees the hooks', () => {
    const hooks = hooksOf(source)
    expect(hooks).toContain('social-links')
    expect(hooks).toContain('social-link-icon')
    expect(hooks.length).toBeGreaterThan(4)
  })

  test('every hook has a shortcut', () => {
    // `'icons'` is a class:list literal too - the variant VALUE compared against, not a class. It is
    // filtered by name rather than allowlisted, since a shortcut for it would be the real mistake.
    const unpainted = hooksOf(source).filter(
      (hook) => hook !== 'icons' && hook !== 'labels' && !UTILITIES.has(hook) && !(hook in coreShortcuts),
    )

    expect(unpainted, `no coreShortcuts entry paints: ${unpainted.join(', ')}`).toEqual([])
  })

  test('the block composes the shared primitives instead of restating them', () => {
    expect(coreShortcuts['social-links']).toContain('container-narrow')
    expect(coreShortcuts['social-links-list']).toContain('list-reset')
    expect(coreShortcuts['social-link']).toContain('focus-visible:outline')
  })

  test('the anchor paints with a TEXT role, not the page background', () => {
    // `body` is the page background (#ffffff in the neutral palette), and `text-body` is a legal
    // utility that renders the glyph white on white. It shipped in the first build of this block
    // and only the built CSS showed it — the gate above cannot, since the class exists.
    expect(coreShortcuts['social-link']).toMatch(/\btext-text-primary\b/)
    expect(coreShortcuts['social-link']).not.toMatch(/\btext-body\b/)
  })
})
