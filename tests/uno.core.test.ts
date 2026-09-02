import { readFileSync, readdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, test } from 'vitest'
import { NEUTRAL_PALETTE_DEFAULTS, REQUIRED_PALETTE_KEYS, coreShortcuts, resolveThemeColors } from '../core/uno.core'
import { cmsConfig } from '~site/cms.config'

const BLOCKS_DIR = join(dirname(fileURLToPath(import.meta.url)), '../core/blocks')

/**
 * True when a word in the color slot of a `bg-`/`text-`/`border-` utility is not a brand color:
 * a preset color from the Uno preset, a keyword (`border-solid`, `text-center`), a type scale step
 * (`text-lg`), or a box side (`border-b`, `border-t-0`) — none of which need a palette key.
 */
function isNotAColor(name: string): boolean {
  return (
    /^(?:white|black|transparent|current|inherit|gray-\d+|slate-\d+)$/.test(name) ||
    /^(?:solid|dashed|dotted|none|center|left|right|justify|balance|nowrap|wrap|ellipsis|clip|opacity)$/.test(name) ||
    /^(?:xs|sm|base|lg|\d*xl)$/.test(name) ||
    /^[trblxy](?:-|$)/.test(name)
  )
}

// Unit coverage for the core Uno layer. It lives in the package rather than the starter's
// tests/e2e/ because it tests package internals: the mirror drops this directory before a client
// sees it, and a client's Playwright run could not load these modules anyway (core is Vite-only). What matters here is the failure mode: UnoCSS emits NOTHING for an
// unknown color name, so a palette missing a key the core shortcuts reference would render an
// unstyled block with a green build. resolveThemeColors turns that into a build error, and these
// tests are what keep the guard honest.

describe('resolveThemeColors', () => {
  test('accepts this site’s palette', () => {
    // The reference site must satisfy the contract it documents — and REQUIRED_PALETTE_KEYS must
    // not drift ahead of the palette that every client repo is generated from.
    expect(() => resolveThemeColors(cmsConfig.brand.colors)).not.toThrow()
  })

  test('maps each color to its CSS custom property with the site value as fallback', () => {
    const resolved = resolveThemeColors({ ...cmsConfig.brand.colors, primary: '#123456' })
    expect(resolved.primary).toBe('var(--color-primary, #123456)')
  })

  test('fills an incomplete palette from core’s neutral defaults instead of throwing', () => {
    // Reversed since dashboard #1195: a site declares only what it wants to differ, so a palette
    // missing keys is the NORMAL case, not a build error. What must still hold is that every
    // required key ends up with a value - an unset one renders an unstyled block.
    const resolved = resolveThemeColors({ primary: '#123456' })

    expect(() => resolveThemeColors({ primary: '#123456' })).not.toThrow()
    expect(resolved.primary).toBe('var(--color-primary, #123456)')
    expect(resolved.surface).toBe(`var(--color-surface, ${NEUTRAL_PALETTE_DEFAULTS.surface})`)
    for (const key of REQUIRED_PALETTE_KEYS) {
      expect(resolved[key], `${key} must resolve to a value`).toBeTruthy()
    }
  })

  test('an empty palette is legal and yields the full neutral set', () => {
    // The end state this change unlocks: `brand: { colors: {} }` in a freshly generated repo.
    const resolved = resolveThemeColors({})
    expect(Object.keys(resolved)).toEqual(expect.arrayContaining([...REQUIRED_PALETTE_KEYS]))
    expect(resolved.heading).toBe(`var(--color-heading, ${NEUTRAL_PALETTE_DEFAULTS.heading})`)
  })

  test('heading and eyebrow derive from the roles /api/branding actually sets (dashboard#1941)', () => {
    // The CMS has no branding field for either role, so a flat hex default here painted core's
    // neutral on every client site — on allteck, `#151516` headings for a brand that says
    // `#080808`, and core's neutral BLUE on every eyebrow across twelve blocks. Deriving them
    // makes each follow a role the client already owns: `heading` → `text-primary`,
    // `eyebrow` → `primary`. Both are written as a `var()` chain in NEUTRAL_PALETTE_DEFAULTS
    // rather than resolved in Layout.astro, because Layout.astro is a PER-SITE file — a fix there
    // reaches newly provisioned repos only, while this one travels on a core release + pin bump.
    const resolved = resolveThemeColors({})

    expect(resolved.heading).toBe('var(--color-heading, var(--color-text-primary, #151516))')
    expect(resolved.eyebrow).toBe('var(--color-eyebrow, var(--color-primary, #3b5aff))')

    // The inner hex is the neutral each entry used to be, so a site with no branding at all
    // renders exactly as it did before the change.
    expect(NEUTRAL_PALETTE_DEFAULTS.heading).toContain(NEUTRAL_PALETTE_DEFAULTS['text-primary'])
    expect(NEUTRAL_PALETTE_DEFAULTS.eyebrow).toContain(NEUTRAL_PALETTE_DEFAULTS.primary)

    // Each derives from a role the CMS DOES set, or the derivation buys nothing.
    expect(NEUTRAL_PALETTE_DEFAULTS.heading).toContain('--color-text-primary')
    expect(NEUTRAL_PALETTE_DEFAULTS.eyebrow).toContain('--color-primary')
  })

  test('a site’s own value still beats the derivation', () => {
    // Precedence is unchanged: `brand.colors` REPLACES the key in the merge, so a repo that
    // hand-wrote `heading`/`eyebrow` as a workaround for #1941 keeps its value and can drop it
    // later. The same slot is what a CMS branding override uses in Layout.astro.
    const resolved = resolveThemeColors({ heading: '#080808', eyebrow: '#080808' })

    expect(resolved.heading).toBe('var(--color-heading, #080808)')
    expect(resolved.eyebrow).toBe('var(--color-eyebrow, #080808)')
  })

  test('every required key has a neutral default, so the throw can never fire on a site', () => {
    // The two lists are hand-maintained and this is what keeps them in sync: adding a key to
    // REQUIRED_PALETTE_KEYS without a default would re-introduce the build error for every site.
    const missing = REQUIRED_PALETTE_KEYS.filter((key) => !(key in NEUTRAL_PALETTE_DEFAULTS))
    expect(missing).toEqual([])
  })

  test('a site key outside the required set still passes through', () => {
    const resolved = resolveThemeColors({ 'brand-x': '#abcdef' })
    expect(resolved['brand-x']).toBe('var(--color-brand-x, #abcdef)')
  })

  test('every color core references is a required key', () => {
    // REQUIRED_PALETTE_KEYS is hand-maintained, so this is the sync check. It scans BOTH the
    // shortcut values and the class attributes in the block components: a color used only in
    // markup bypasses the shortcut layer entirely, which is how `text-grey` survived in
    // ImageBlock's caption — `grey` is not a palette key, so the caption simply had no color.
    const paletteColors = new Set<string>(REQUIRED_PALETTE_KEYS)
    const referenced = new Set<string>()

    const sources = Object.values(coreShortcuts).concat(
      readdirSync(BLOCKS_DIR)
        .filter((file) => file.endsWith('.astro'))
        .flatMap((file) => [...readFileSync(join(BLOCKS_DIR, file), 'utf8').matchAll(/class="([^"]*)"/g)])
        .map(([, classList]) => classList),
    )

    for (const value of sources) {
      for (const [, color] of value.matchAll(/(?:^|[\s:])(?:bg|text|border)-([a-z][a-z0-9-]*)\b/g)) {
        referenced.add(color)
      }
    }

    const unknown = [...referenced].filter((name) => !paletteColors.has(name) && !isNotAColor(name))

    // Both directions are asserted, because a scanner that finds nothing would pass vacuously:
    // real palette colors ARE seen, and a name that is not a palette key IS reported.
    expect([...referenced]).toEqual(expect.arrayContaining(['primary', 'surface', 'heading', 'border']))
    expect(isNotAColor('grey'), 'the filter must not swallow a plausible-looking color name').toBe(false)
    expect(unknown, 'core references palette colors missing from REQUIRED_PALETTE_KEYS').toEqual([])
  })
})

describe('coreShortcuts', () => {
  // Regression for dashboard #1191: `.cookie-consent` sets `flex` unconditionally and
  // CookieConsent.astro toggles visibility via the `hidden` DOM attribute (el.hidden = true/false).
  // The browser's own `[hidden]{display:none}` and a plain `.cookie-consent{display:flex}` rule
  // are BOTH single-class/attribute specificity, so on a tie the later-loaded stylesheet wins —
  // and this one loads after the UA sheet, so `flex` silently won and the banner never visually
  // closed even though every click handler fired and consent was genuinely recorded. Confirmed
  // live on the Diligently client: `hidden` was `true` on the element, `getComputedStyle().display`
  // stayed `flex`. `[&[hidden]]:hidden` raises this one rule's specificity so it always wins
  // regardless of load order — the same fix `tabpanel` already needed for the same reason.
  test('the cookie-consent banner actually hides when its hidden attribute is set', () => {
    expect(coreShortcuts['cookie-consent']).toMatch(/\[&\[hidden\]\]:hidden/)
  })

  // Same bug class, second element: the granular category panel (#1226) toggles its OWN `hidden`
  // attribute independently of the outer banner (customizeBtn reveals it) — a plain `flex` here
  // would be exposed to the identical specificity tie, and the fix does not inherit from the
  // parent's shortcut.
  test('the granular category panel also actually hides when its hidden attribute is set', () => {
    expect(coreShortcuts['cookie-consent__panel']).toMatch(/\[&\[hidden\]\]:hidden/)
  })
})
