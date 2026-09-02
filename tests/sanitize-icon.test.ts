import { describe, expect, it } from 'vitest'
import { sanitizeIcon, sanitizeSvg } from '../lib/sanitize'

/**
 * The icon render path (dashboard#1968), which is the thing that let `heading_icon` exist at all:
 * `config/cms.php:978` refused a raw-`<svg>` field as "both unthemeable and an injection hole",
 * and both halves are answered here rather than in help text.
 *
 * Two suites, because they are two different promises. `sanitizeSvg` promises nothing hostile
 * survives; `sanitizeIcon` promises nothing UNTHEMEABLE survives. A regression in either is
 * silent on a page — a stripped `viewBox` still draws *something*, and a surviving `fill="#1a3d7c"`
 * looks right until the rebrand — so both are pinned by value rather than by eyeball.
 *
 * The end-to-end half of this lives in `frontend/tests/e2e/heading-icon.spec.ts`, which asserts on
 * built HTML: a correct sanitizer reached through a `set:html` that forgot to call it is the
 * failure mode a unit test cannot see.
 */

/** An unmodified Lucide icon — the most likely thing anyone actually pastes. */
const LUCIDE
  = '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" '
    + 'stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">'
    + '<path d="M12 2v20"/></svg>'

describe('sanitizeSvg — nothing hostile survives', () => {
  it.each([
    ['<script>', '<svg viewBox="0 0 24 24"><script>alert(1)</script><path d="M0 0"/></svg>', 'alert'],
    ['on* handlers', '<svg onload="alert(1)" viewBox="0 0 24 24"><path d="M0 0" onclick="x()"/></svg>', 'alert'],
    ['<use href> (SSRF)', '<svg viewBox="0 0 24 24"><use href="https://evil.tld/x.svg#a"/></svg>', 'evil.tld'],
    ['<use xlink:href>', '<svg viewBox="0 0 24 24"><use xlink:href="#b"/></svg>', 'xlink'],
    ['<foreignObject>', '<svg viewBox="0 0 24 24"><foreignObject><iframe src="https://evil.tld"></iframe></foreignObject></svg>', 'iframe'],
    ['<image> (tracking)', '<svg viewBox="0 0 24 24"><image href="https://evil.tld/pixel.png"/></svg>', 'evil.tld'],
    ['<animate>/<set>', '<svg viewBox="0 0 24 24"><animate attributeName="x" to="1"/><set to="2"/></svg>', 'animate'],
    ['<a href="javascript:">', '<svg viewBox="0 0 24 24"><a href="javascript:alert(1)"><path d="M0 0"/></a></svg>', 'javascript:'],
    ['<style> element', '<svg viewBox="0 0 24 24"><style>*{fill:red}</style><path d="M0 0"/></svg>', 'fill:red'],
  ])('drops %s', (_label, payload, forbidden) => {
    expect(sanitizeSvg(payload)).not.toContain(forbidden)
  })

  /**
   * `style` was on the allowed list until #1968 and `sanitize-html` never filtered its VALUE
   * (no `allowedStyles`), so both of these came through verbatim: a full-viewport defacement
   * authored from a content field, and the exact pixel-tracking that dropping `<image>` prevents.
   */
  it.each([
    ['a viewport defacement', '<svg viewBox="0 0 24 24" style="position:fixed;top:0;left:0;width:100vw;height:100vh;z-index:9999"><path d="M0 0"/></svg>'],
    ['an external fetch', '<svg viewBox="0 0 24 24"><path d="M0 0" style="background-image:url(https://evil.tld/pixel.png)"/></svg>'],
  ])('drops the style attribute carrying %s', (_label, payload) => {
    expect(sanitizeSvg(payload)).not.toContain('style=')
  })

  /**
   * The regression that shipped: every camelCase entry in the allowlist was unreachable, because
   * `sanitize-html` lowercases parsed names. `viewBox` went missing from EVERY icon, which makes
   * a CSS-sized glyph render at raw user units in a corner.
   */
  it('keeps the viewBox of an unmodified Lucide icon', () => {
    expect(sanitizeSvg(LUCIDE)).toContain('viewbox="0 0 24 24"')
  })

  it.each([
    ['preserveAspectRatio', '<svg preserveAspectRatio="xMidYMid meet"><path d="M0 0"/></svg>', 'preserveaspectratio'],
    ['linearGradient', '<svg><linearGradient id="g"><stop stop-color="#f00"/></linearGradient></svg>', 'lineargradient'],
    ['clipPath', '<svg><clipPath id="c"><rect x="0"/></clipPath></svg>', 'clippath'],
    ['feGaussianBlur', '<svg><filter id="f"><feGaussianBlur stdDeviation="2"/></filter></svg>', 'fegaussianblur'],
  ])('keeps %s, which the camelCase allowlist silently dropped', (_label, payload, expected) => {
    expect(sanitizeSvg(payload)).toContain(expected)
  })
})

describe('sanitizeIcon — nothing unthemeable survives', () => {
  it('forces an authored brand colour to currentColor', () => {
    const out = sanitizeIcon('<svg viewBox="0 0 24 24" fill="#1a3d7c"><path d="M0 0" fill="#1a3d7c" stroke="rgb(1,2,3)"/></svg>')

    expect(out).not.toContain('#1a3d7c')
    expect(out).not.toContain('rgb(1,2,3)')
    expect(out).toContain('fill="currentColor"')
    expect(out).toContain('stroke="currentColor"')
  })

  /** Blanket-replacing `fill` would fill every stroke-only icon solid — i.e. all of Lucide. */
  it('preserves fill="none" so a stroke-only icon stays an outline', () => {
    const out = sanitizeIcon(LUCIDE)

    expect(out).toContain('fill="none"')
    expect(out).toContain('stroke="currentColor"')
    expect(out).toContain('viewbox="0 0 24 24"')
  })

  /** SVG's initial `fill` is black and is NOT inherited, so an unpainted icon would ignore the brand. */
  it('paints an unpainted root with currentColor', () => {
    expect(sanitizeIcon('<svg viewBox="0 0 24 24"><path d="M0 0"/></svg>')).toContain('<svg viewbox="0 0 24 24" fill="currentColor">')
  })

  it('does not double-paint a root that already carries a colour', () => {
    expect(sanitizeIcon(LUCIDE).match(/fill="/g)).toHaveLength(1)
  })

  /** Size is the call site's shortcut, not the paste's — a 9999px icon is not a themeable one. */
  it('strips class, width and height from the root but keeps the geometry', () => {
    const out = sanitizeIcon('<svg viewBox="0 0 24 24" width="9999" height="9999" class="fixed inset-0"><path d="M12 2v20" stroke-width="2"/></svg>')

    // Leading space on purpose: `stroke-width` is geometry and must survive, so a bare
    // `width=` would match it and assert the opposite of what this test is about.
    expect(out).not.toContain(' width=')
    expect(out).not.toContain(' height=')
    expect(out).not.toContain(' class=')
    expect(out).toContain('viewbox="0 0 24 24"')
    expect(out).toContain('stroke-width="2"')
    expect(out).toContain('d="M12 2v20"')
  })

  /**
   * A gradient cannot smuggle a brand colour past the rule. `stop-color` is left alone — it is
   * not a `fill`/`stroke` — but the `fill="url(#g)"` that REFERENCES the gradient is rewritten to
   * `currentColor`, so the paint server ends up unused and the glyph is monochrome anyway. Pinned
   * because it is the non-obvious half: reading the rewrite alone suggests the opposite.
   */
  it('neutralizes a gradient fill rather than letting it carry a colour', () => {
    const out = sanitizeIcon(
      '<svg viewBox="0 0 24 24"><defs><linearGradient id="g"><stop stop-color="#f00"/></linearGradient></defs>'
      + '<path d="M0 0" fill="url(#g)"/></svg>',
    )

    expect(out).not.toContain('url(#g)')
    expect(out).toContain('fill="currentColor"')
  })

  /**
   * The bypass the first cut shipped with: the root rewrite was anchored `^\s*<svg`, so anything
   * before the tag skipped it entirely — the paste kept its 9999px sizing AND never gained
   * `fill="currentColor"`, so the glyph rendered black instead of following the brand. Text before
   * an icon is an ordinary copy-paste accident, which is what makes this worth a test rather than
   * a note.
   */
  it('normalises the root even when something precedes it', () => {
    const out = sanitizeIcon('hello <svg viewBox="0 0 24 24" width="9999"><path d="M0 0"/></svg>')

    expect(out).not.toContain(' width=')
    expect(out).toContain('fill="currentColor"')
  })

  it('normalises a second root, not just the first', () => {
    const out = sanitizeIcon(
      '<svg viewBox="0 0 24 24"><path d="M0 0"/></svg><svg viewBox="0 0 9 9" width="9999" class="fixed"><path d="M1 1"/></svg>',
    )

    expect(out).not.toContain(' width=')
    expect(out).not.toContain(' class=')
    expect(out.match(/fill="currentColor"/g)).toHaveLength(2)
  })

  /**
   * And the reason the fix is depth-tracked rather than a global replace: a nested `<svg>` is legal
   * and its `width`/`height` are its own viewport, not a size the paste is imposing on the page.
   */
  it('leaves a NESTED svg its own width and height', () => {
    const out = sanitizeIcon('<svg viewBox="0 0 24 24" width="9999"><svg width="8" height="8"><path d="M0 0"/></svg></svg>')

    expect(out).toContain('<svg width="8" height="8">')
    expect(out).not.toContain('width="9999"')
  })

  it.each([
    ['null', null],
    ['undefined', undefined],
    ['empty', ''],
    ['prose with no SVG at all', '<div>hello<img src=x onerror=alert(1)></div>'],
    // `sanitizeSvg` keeps allowlisted children even with no wrapper, and an SVG child outside an
    // <svg> draws nothing while still occupying the DOM.
    ['an orphan child with no <svg> root', '<path d="M12 2v20"/>'],
  ])('renders nothing at all for %s', (_label, input) => {
    expect(sanitizeIcon(input)).toBe('')
  })
})
