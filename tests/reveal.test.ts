import { describe, it, expect } from 'vitest'
import { createGenerator } from 'unocss'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { revealClass, revealsOnScroll } from '../lib/reveal'
import { coreShortcuts } from '../core/uno.core'
import unoConfig from '../../../uno.config'

// The `reveal` select is a SHARED schema field, and until #1985 every renderer dropped it: the
// panel offered "Fade in on scroll" on eight blocks, the API returned the value and the page was
// unchanged. Third in the line `background` (#1498) and `align` (#1643) started — and the one that
// hid the longest, because `frontend/scripts/field-coverage.mjs` carried an allowlist entry saying
// core could not ship it. The entry read as a decision; it was a deferral.
//
// Sibling to align.test.ts and background.test.ts, and structured like them for the same reason:
// the helper being correct is the cheap half. The original defect was renderers that never called
// anything at all, so the walk-the-sources block below is the half that would have caught it.

describe('revealClass()', () => {
  it('maps every schema option to its modifier', () => {
    expect(revealClass('on')).toBe('is-reveal')
    expect(revealClass('off')).toBe('is-reveal-off')
  })

  // The additive half of the contract: `default` and an absent value emit nothing, so every page
  // built before the field was wired up renders byte-identically — the class vanishes from the
  // markup entirely rather than landing there inert.
  it('emits no class for default or absent', () => {
    expect(revealClass('default')).toBeUndefined()
    expect(revealClass(undefined)).toBeUndefined()
    expect(revealClass(null)).toBeUndefined()
    expect(revealClass('')).toBeUndefined()
  })

  // A value the frontend does not know (an option added to config/cms.php before a core bump)
  // leaves the block alone rather than emitting a class nothing styles.
  it('ignores an unknown value', () => {
    expect(revealClass('fade')).toBeUndefined()
    expect(revealClass('  on  ')).toBe('is-reveal')
  })

  // Why the lookup is a Map, exactly as in lib/background.ts: an object literal would resolve
  // these up Object.prototype and put a function into the class attribute.
  it('does not resolve a prototype key as a reveal', () => {
    expect(revealClass('constructor')).toBeUndefined()
    expect(revealClass('toString')).toBeUndefined()
  })
})

// The MOUNT predicate. Every renderer asks the question twice — once for the class, once to decide
// whether to bring core/SectionReveal.astro — and the second was originally re-derived on the spot
// as `reveal === 'on'`, which looks equivalent to `revealClass()` and is not: that one trims.
describe('revealsOnScroll()', () => {
  it('agrees with revealClass on every value, whitespace included', () => {
    for (const value of ['on', ' on ', '  on  ', 'off', ' off ', 'default', '', 'fade', 'constructor']) {
      expect(revealsOnScroll(value), `disagreed on ${JSON.stringify(value)}`).toBe(revealClass(value) === 'is-reveal')
    }
  })

  it('is false for off, default and absent', () => {
    expect(revealsOnScroll('off')).toBe(false)
    expect(revealsOnScroll('default')).toBe(false)
    expect(revealsOnScroll(undefined)).toBe(false)
    expect(revealsOnScroll(null)).toBe(false)
  })
})

const CORE_DIR = fileURLToPath(new URL('../core', import.meta.url))
const SCHEMA = fileURLToPath(new URL('../../../schema/blocks.json', import.meta.url))

const blockSource = (name: string) => readFileSync(join(CORE_DIR, 'blocks', `${name}.astro`), 'utf8')

// Same strip align.test.ts uses: these components explain in prose what they now do, and a check
// that matched the prose would be satisfied by the comment describing the fix.
const withoutComments = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*/g, '')

// READ FROM THE COMMITTED SCHEMA, never retyped here — the call testimonials-layout.test.ts makes
// for the same reason. A NINTH block given the `reveal` part in config/cms.php fails this file
// until its renderer reads the field too, so the gate is on the class of mistake rather than on
// the eight blocks this change happens to fix.
const schema = JSON.parse(readFileSync(SCHEMA, 'utf8')) as Record<string, { fields?: Record<string, unknown> }>

const componentOf = (type: string) =>
  type
    .split('_')
    .map((w) => w[0].toUpperCase() + w.slice(1))
    .join('')

const REVEAL_BLOCKS = Object.keys(schema)
  .filter((type) => schema[type].fields && 'reveal' in schema[type].fields!)
  .map(componentOf)

describe('every block that declares reveal actually renders it', () => {
  // Guards the list itself: if the schema export ever stops carrying the field, every assertion
  // below would iterate an empty array and pass while checking nothing.
  it('reads the block list from the committed schema', () => {
    expect(REVEAL_BLOCKS).toEqual(
      expect.arrayContaining([
        'RichContent',
        'Cards',
        'Features',
        'CtaBanner',
        'Testimonials',
        'Videos',
        'PricingTeaser',
        'PricingTable',
      ]),
    )
    expect(REVEAL_BLOCKS).toHaveLength(8)
  })

  it.each(REVEAL_BLOCKS)('%s.astro routes the field through the shared helper', (name) => {
    const src = blockSource(name)
    expect(src).toContain("from '../../lib/reveal'")
    expect(withoutComments(src)).toMatch(/revealClass\(reveal\)/)
  })

  // The modifier on the <section> is the hook a site styles against — the same place `bandClass`
  // sits, so a client repo can reach "this section fades in" without re-deriving it.
  it.each(REVEAL_BLOCKS)('%s.astro puts the modifier on its own section', (name) => {
    expect(withoutComments(blockSource(name))).toMatch(
      /<section[^>]*class:list=\{\[[^\]]*reveal(Modifier|Class\(reveal\))/s,
    )
  })

  // The literal shortcut KEY, carried in a class attribute where UnoCSS's extractor can see it.
  // The `is-reveal*` half comes out of `lib/reveal.ts`, which the extractor never scans — see the
  // note at the foot of align.test.ts. A block that emitted the modifier and dropped this key
  // would carry a class with no rule behind it, which is #1985 again in a smaller hat.
  it.each(REVEAL_BLOCKS)('%s.astro carries the section-reveal key as a literal', (name) => {
    expect(withoutComments(blockSource(name))).toMatch(/['"`\s]section-reveal[\s'"`]/)
  })

  // Emitting the class is useless on its own — that was the allowlist entry's whole argument, and
  // it was right about the class. Nothing hides or reveals a section unless the observer is on the
  // page, so every block that offers the field has to be able to bring it.
  it.each(REVEAL_BLOCKS)('%s.astro mounts the observer when an editor asked for one', (name) => {
    const code = withoutComments(blockSource(name))
    expect(code).toContain("import SectionReveal from '../SectionReveal.astro'")
    expect(code).toMatch(/revealsOnScroll\(reveal\) && <SectionReveal \/>/)
  })

  // The other half of that, and the one a future edit is likeliest to undo: no renderer may compare
  // the raw value itself. Two places encoding one predicate is how ` on ` came to emit `is-reveal`
  // on the section while mounting no observer — a section that then animates or not depending on
  // whether a NEIGHBOURING block happened to bring one, since arm() queries `.is-reveal` page-wide.
  it.each(REVEAL_BLOCKS)('%s.astro does not re-derive the predicate from the raw value', (name) => {
    expect(withoutComments(blockSource(name))).not.toMatch(/reveal\s*===/)
  })
})

describe('the styling layer paints what the blocks emit', () => {
  const shortcut = String(coreShortcuts['section-reveal' as keyof typeof coreShortcuts])

  it('is a core shortcut at all', () => {
    expect(coreShortcuts['section-reveal' as keyof typeof coreShortcuts]).toBeDefined()
  })

  // A compound (`[&.is-reveal-x]:`), never a plain utility: the compound is what lets the modifier
  // reach the CSS without the extractor ever having to see it, and a bare utility here would apply
  // to every section carrying the key — i.e. all eight, revealed or not.
  it('is compounds only, never a bare utility', () => {
    for (const part of shortcut.split(/\s+/).filter(Boolean)) {
      expect(part, `"${part}" is a bare utility, so it would hit every section`).toMatch(
        /^\[&\.is-reveal(-armed|-off)?\]:|^\[&\.is-revealed\]:/,
      )
    }
  })

  // THE SAFETY INVARIANT, and the reason this file exists as much as the coverage one.
  //
  // `is-reveal` is the marker the observer selects on; it must paint NOTHING. The hidden state
  // lives on `is-reveal-armed`, which core/SectionReveal.astro is the sole writer of. Hide on
  // `is-reveal` instead and a visitor with JS off, an older browser with no IntersectionObserver,
  // or a page whose script simply threw gets a permanently invisible section — a dead control
  // upgraded into lost content, which is worse than the bug being fixed.
  it('hides nothing on the marker class alone', () => {
    for (const part of shortcut.split(/\s+/).filter(Boolean)) {
      expect(part, 'the marker class must not carry the hidden state').not.toMatch(/^\[&\.is-reveal\]:/)
    }
  })

  it('the armed state is the hidden one, and the revealed state undoes it', () => {
    expect(shortcut).toContain('[&.is-reveal-armed]:opacity-0')
    expect(shortcut).toContain('[&.is-revealed]:opacity-100')
  })

  // Only `is-revealed` carries a transition. CSS reads the transition out of the AFTER-change
  // style, so swapping armed for revealed animates, while ARMING — a class with no transition on
  // it — is instant. Put the transition on the armed class and the section fades OUT on its way to
  // hidden, in full view, every time the script runs.
  it('transitions on the revealed state only', () => {
    expect(shortcut).toMatch(/\[&\.is-revealed\]:transition-/)
    expect(shortcut).not.toMatch(/\[&\.is-reveal-armed\]:transition-\[/)
  })

  it('respects a reduced-motion preference in CSS as well as in the script', () => {
    expect(shortcut).toContain('[&.is-revealed]:motion-reduce:transition-none')
  })

  // `off` is a real value, not a synonym for the default — the call `align` makes for `left`. Core
  // animates nothing by default so it suppresses nothing here yet; it pins the end state so a site
  // that reveals these bands from its own CSS gets "not this section" by respecting the hook
  // rather than inventing a second spelling.
  it('pins the end state for an explicit off', () => {
    expect(shortcut).toContain('[&.is-reveal-off]:opacity-100')
  })

  // Opacity only. Any `transform` — identity included — makes the section a stacking context and a
  // containing block for `position: fixed` descendants, so a `translate-y-0` here would leave "No
  // animation" as the one value that quietly changes the band's layout semantics while `default`
  // leaves them alone. Nothing translates an un-armed section, so there was never anything to undo.
  it('leaves an explicit off with no transform to change its layout semantics', () => {
    expect(shortcut).not.toMatch(/\[&\.is-reveal-off\]:(translate|transform|scale|rotate)/)
  })

  // A shortcut KEY is a class name, so `'is-reveal': '…'` would generate CSS for a class and then
  // ask the block to carry two. The compound-inside-a-real-key form is the legal one, and this
  // pins the difference — it is easy to "tidy" one into the other.
  it.each(['is-reveal', 'is-reveal-off', 'is-reveal-armed', 'is-revealed'])(
    'has no shortcut key for %s',
    (modifier) => {
      expect(Object.keys(coreShortcuts)).not.toContain(modifier)
    },
  )
})

describe('the reveal key generates real CSS from what the extractor actually sees', () => {
  // Fed ONLY the key — i.e. only the token that genuinely appears in a scanned `.astro` file. If
  // the mechanism needed `is-reveal-armed` to be extracted too, this would come back empty. The
  // REAL config, not a reconstruction, so it cannot pass against a setup production does not have.
  it('paints the armed, revealed and off states', async () => {
    const uno = await createGenerator(unoConfig)
    const { css } = await uno.generate('section-reveal', { preflights: false })

    for (const selector of [
      '.section-reveal.is-reveal-armed',
      '.section-reveal.is-revealed',
      '.section-reveal.is-reveal-off',
    ]) {
      expect(css, `${selector} is not painted`).toContain(selector)
    }

    expect(css, 'the armed state does not hide').toContain('opacity:0')
    expect(css, 'the revealed state does not transition').toContain('transition-property')
  })
})

// The observer itself. It is one inline script shared by up to eight sections on a page, and every
// one of these guards is load-bearing rather than defensive: each is a way the feature turns into
// invisible content instead of no animation.
describe('core/SectionReveal.astro brings the behaviour the class cannot', () => {
  const source = readFileSync(join(CORE_DIR, 'SectionReveal.astro'), 'utf8')
  const code = withoutComments(source)

  // `is:inline`, the idiom Carousel.astro and Testimonials.astro use. A bundled <script> is
  // hoisted onto EVERY page whether or not a block asked for one.
  it('ships its script inline, not bundled onto every page', () => {
    expect(code).toContain('is:inline')
  })

  // Eight revealing sections on a page mount eight copies. Without the page-level flag they would
  // each build an observer and arm the same elements.
  it('runs once per page however many sections mount it', () => {
    expect(code).toContain('revealReady')
  })

  it('arms nothing when it cannot animate', () => {
    expect(code).toContain("'IntersectionObserver' in window")
    expect(code).toContain('prefers-reduced-motion: reduce')
  })

  // The script is the ONLY writer of the hidden state, which is what makes a JS failure render a
  // plain visible section rather than an empty one.
  it('is the sole writer of the armed class', () => {
    expect(code).toContain("classList.add('is-reveal-armed')")
    expect(code).toContain("classList.remove('is-reveal-armed')")
    expect(code).toContain("classList.add('is-revealed')")
  })

  // Twice, deliberately: an inline script runs during parse and sees only the sections ABOVE it,
  // so a revealing block further down the page would never be armed and would sit there
  // un-revealed forever. Losing the second pass is a silent partial regression — the top of the
  // page still animates, which is exactly what a reviewer checks.
  it('arms again once the rest of the document exists', () => {
    expect(code).toContain('DOMContentLoaded')
    expect(code).toMatch(/data(set\.revealArmed|-reveal-armed)/)
  })

  // The observer's negative bottom `rootMargin` shrinks the root, so a section lying entirely
  // inside that band never intersects — and with no scroll room left below it, nothing ever moves
  // it out. It would keep `is-reveal-armed`, i.e. `opacity: 0`, for good. Arming from script rules
  // that out for NO JS; only this pass rules it out for "JS ran and the callback never came".
  it('reveals anything still armed but on screen once loading is done', () => {
    expect(code).toMatch(/window\.addEventListener\('load'|readyState === 'complete'/)
    expect(code).toContain("querySelectorAll('.is-reveal-armed')")
    expect(code).toContain('window.innerHeight')
  })

  // And it must stay a SWEEP, not a reveal-all: a section below the fold is left to the observer,
  // or the feature quietly becomes "everything is revealed at load" with the suite still green.
  it('leaves sections below the fold to the observer', () => {
    expect(code).toMatch(/getBoundingClientRect\(\)\.top >= window\.innerHeight/)
  })
})
