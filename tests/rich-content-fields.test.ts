import { describe, it, expect } from 'vitest'
import { createGenerator } from 'unocss'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { coreShortcuts } from '../core/uno.core'
import unoConfig from '../../../uno.config'

// `rich_content` declares eleven fields and core read eight of them. `eyebrow` and `animation_url`
// are two of the three that evaporated at render time (dashboard#1693) — the block's own panel
// description promises the eyebrow, and three client repos forked this one component to draw the
// fields core dropped.
//
// WHY THIS FILE EXISTS RATHER THAN LEANING ON `cms:blocks:verify`. That gate cannot see a
// regression here, measured rather than assumed: with the emit deleted from a renderer it still
// reported "no drift", because `verify-block-coverage.mjs`'s FOLLOWABLE (`/[\\/](blocks|lib)[\\/]/`)
// appends a followed helper's source to the haystack, and a `lib/` helper names the field many
// times over. A MISS there is conclusive; a hit is weak evidence, exactly as frontend/CLAUDE.md
// says. So the guard for "the renderer still places the field" is here.
const source = readFileSync(fileURLToPath(new URL('../core/blocks/RichContent.astro', import.meta.url)), 'utf8')

// The component explains in prose what it now does, and a check that matched the prose would be
// satisfied by the very comment documenting the fix. Same strip align.test.ts and
// background.test.ts use.
const withoutComments = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*/g, '')
const code = withoutComments(source)

describe('RichContent renders its eyebrow', () => {
  it('reads the field off the block', () => {
    expect(code).toMatch(/const \{[^}]*\beyebrow\b[^}]*\} = block\.data/)
  })

  // Placed, not merely destructured. The gate's blind spot is a component that reads a field and
  // forgets to put it anywhere, so this asserts the element.
  it('places it in the markup, guarded so an empty eyebrow emits nothing', () => {
    expect(code).toMatch(/\{eyebrow && <p[^>]*rich-eyebrow/)
  })

  // `align` is documented as SECTION HEADER alignment and the eyebrow is part of that cluster, so
  // a centred rich_content must centre its label too — not just its heading.
  it('aligns it with the heading', () => {
    expect(code).toMatch(/rich-eyebrow',\s*\.\.\.alignClasses\(align, 'align-text'\)/)
  })

  // Inline rather than through SectionHeader, and this is the reason: that component draws a fixed
  // <h2>. Routing this block through it would silently drop `heading_level`, a field the panel
  // offers and this block still uses — trading one dead field for another.
  it('keeps drawing its own heading level', () => {
    expect(code).toMatch(/headingTag\(heading_level\)/)
  })
})

describe('RichContent renders its animation', () => {
  it('reads the field off the block', () => {
    expect(code).toMatch(/const \{[^}]*\banimation_url\b[^}]*\} = block\.data/)
  })

  // The SAME element, class and attribute `SectionHeader` emits, so a site that already mounts
  // players picks this block up with no extra wiring. A second spelling here would be a second
  // contract, and only one of them would be documented.
  it('emits the shared DOM contract, guarded so an absent url emits nothing', () => {
    expect(code).toMatch(
      /\{animation_url && <div class="section-animation" data-animation-src=\{animation_url\} aria-hidden="true"/,
    )
  })

  // The half that is easy to lose to a well-meant "improvement": core deliberately ships no
  // player and makes no third-party request. It used to hardcode one client's Lottie files and
  // pull a player from unpkg.com on every page carrying a hero, which 404'd for everyone else -
  // the defect SectionHeader's docblock calls "the second half of #1647".
  it('pulls in no player and adds no script', () => {
    expect(code).not.toMatch(/<script/)
    expect(code).not.toMatch(/lottie/i)
    expect(code).not.toMatch(/unpkg|cdn\./i)
  })
})

describe('the styling layer paints the eyebrow', () => {
  // Reuses the shared treatment rather than restating it — eleven other blocks draw their eyebrow
  // through `section-eyebrow`, and a second spelling here is how the two drift.
  it('rich-eyebrow composes the shared eyebrow treatment', () => {
    const shortcut = String(coreShortcuts['rich-eyebrow' as keyof typeof coreShortcuts])
    expect(shortcut, 'rich-eyebrow is not a core shortcut').toBeTruthy()
    expect(shortcut).toContain('section-eyebrow')
  })

  // The one thing that does NOT carry over from SectionHeader: it spaces its eyebrow with `gap-2`
  // on a flex column, while `.content-inner` is plain block flow and `rich-heading` has only a
  // bottom margin. Without a margin here the label sits flush against the heading.
  it('rich-eyebrow carries its own spacing, since block flow has no gap', () => {
    expect(String(coreShortcuts['rich-eyebrow' as keyof typeof coreShortcuts])).toMatch(/\bmb-/)
  })

  // The lesson this guards: "a shortcut that generates nothing still looks correct in source".
  // UnoCSS emits nothing for a key it cannot resolve, and every assertion above stays green while
  // the rendered page carries a class nothing paints.
  it('generates real CSS', async () => {
    const uno = await createGenerator(unoConfig)
    const { css } = await uno.generate('rich-eyebrow', { preflights: false })

    expect(css, 'rich-eyebrow paints nothing').toContain('.rich-eyebrow')
    expect(css, 'the eyebrow treatment did not come through').toMatch(/text-transform:\s*uppercase/)
    expect(css, 'the eyebrow has no spacing below it').toMatch(/margin-bottom/)
  })
})

// An eyebrow on an INVERTED band kept the brand accent it carries on white — #3b5aff on #000 is
// 4.09:1 at 13px/700, under the 4.5:1 that size needs. `--color-eyebrow` was the one text role
// missing from the band re-maps; every other one had been added by #1498 / #1578. Twelve blocks
// draw an eyebrow and five hand it to SectionHeader inside a band, so this was never specific to
// `rich_content` — that block is only what finally made it visible in the fixtures.
describe('an inverted band re-maps the eyebrow role', () => {
  const tokens = readFileSync(fileURLToPath(new URL('../core/styles/tokens.css', import.meta.url)), 'utf8')

  // The rule body for one band, so a token asserted below cannot be satisfied by an occurrence in
  // the surrounding prose or in the other band's block.
  const bandRule = (modifier: string) =>
    tokens.match(new RegExp(String.raw`\.section-band\.is-${modifier}\s*\{([^}]*)\}`))?.[1] ?? ''

  it.each(['dark', 'brand'])('is-%s remaps every text role, eyebrow included', (modifier) => {
    const rule = bandRule(modifier)
    expect(rule, `.section-band.is-${modifier} has no rule`).not.toBe('')

    // Asserted as a SET rather than one token: the defect was a role quietly left out, so the
    // check that matters is "none of them is missing", not "the new one is present".
    for (const role of ['--color-heading', '--color-text-primary', '--color-text-secondary', '--color-eyebrow']) {
      expect(rule, `${role} is not re-mapped on the ${modifier} band`).toContain(role)
    }
  })

  // The default has to be the band's own text colour. Left to resolve against the palette it would
  // be the brand accent again, which is the unreadable case this exists to remove.
  it('the eyebrow falls back to the band text colour, not the palette accent', () => {
    expect(bandRule('dark')).toMatch(/--color-eyebrow:\s*var\(--band-dark-eyebrow,\s*var\(--band-dark-text/)
    expect(bandRule('brand')).toMatch(/--color-eyebrow:\s*var\(--band-brand-eyebrow,\s*var\(--band-brand-text/)
  })
})
