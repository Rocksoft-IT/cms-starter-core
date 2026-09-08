import { describe, expect, it } from 'vitest'
import { localizeHtmlHrefs } from '../lib/html-hrefs'

// Editor prose and `custom_html` are the one place an internal link never reached href() at all:
// the markup arrives as a string and goes straight to set:html, so no renderer ever saw an href.
// Those links have the same default-locale problem as every CTA field and one degree less warning.
describe('localizeHtmlHrefs', () => {
  const ctx = {
    locale: 'pl',
    defaultLocale: 'en',
    pathIndex: { '/contact/': { pl: '/pl/kontakt/' }, '/about/': { pl: '/pl/o-nas/' } },
  }

  it('rewrites an internal link inside prose', () => {
    expect(localizeHtmlHrefs('<p>Zob. <a href="/contact">kontakt</a>.</p>', ctx)).toBe(
      '<p>Zob. <a href="/pl/kontakt/">kontakt</a>.</p>',
    )
  })

  it('rewrites every anchor in the fragment, not just the first', () => {
    expect(localizeHtmlHrefs('<a href="/contact">a</a><a href="/about/">b</a>', ctx)).toBe(
      '<a href="/pl/kontakt/">a</a><a href="/pl/o-nas/">b</a>',
    )
  })

  it('keeps the surrounding attributes and the original quoting', () => {
    expect(localizeHtmlHrefs(`<a class="btn" href='/contact' rel="nofollow">x</a>`, ctx)).toBe(
      `<a class="btn" href='/pl/kontakt/' rel="nofollow">x</a>`,
    )
  })

  it('leaves an unknown path, an external URL, a mailto and a bare fragment alone', () => {
    const html =
      '<a href="/nope">a</a><a href="https://example.com/contact">b</a>' +
      '<a href="mailto:hi@example.com">c</a><a href="#top">d</a>'
    // `/nope` still gets href()'s trailing slash — the same normalization it has always applied.
    expect(localizeHtmlHrefs(html, ctx)).toBe(
      '<a href="/nope/">a</a><a href="https://example.com/contact">b</a>' +
        '<a href="mailto:hi@example.com">c</a><a href="#top">d</a>',
    )
  })

  it('does not touch an href written as sample text in a code block', () => {
    // A literal `<a …>` shown as content arrives escaped, so it cannot match an anchor start tag —
    // which is exactly why this scans start tags rather than every `href=` in the string.
    const html = '<pre><code>&lt;a href="/contact"&gt;</code></pre>'
    expect(localizeHtmlHrefs(html, ctx)).toBe(html)
  })

  it('returns the markup byte-identical with no context — the default tree never changes', () => {
    const html = '<p><a href="/contact">kontakt</a></p>'
    expect(localizeHtmlHrefs(html, undefined)).toBe(html)
    expect(localizeHtmlHrefs(html, { locale: 'en', defaultLocale: 'en', pathIndex: ctx.pathIndex })).toBe(html)
  })

  it('passes null, undefined and empty strings straight through', () => {
    expect(localizeHtmlHrefs(null, ctx)).toBeNull()
    expect(localizeHtmlHrefs(undefined, ctx)).toBeUndefined()
    expect(localizeHtmlHrefs('', ctx)).toBe('')
  })

  it('leaves a start tag it cannot parse rather than mangling it', () => {
    // A `>` inside an attribute value defeats the start-tag match; the literal is the fallback
    // everywhere in this module, so the link is simply not resolved.
    const html = '<a title="a > b" href="/contact">x</a>'
    expect(localizeHtmlHrefs(html, ctx)).toBe('<a title="a > b" href="/contact">x</a>')
  })
})
