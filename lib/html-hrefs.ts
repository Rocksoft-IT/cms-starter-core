import { canResolve, href, type HrefLocaleContext } from './href'

/**
 * Rewrite the internal links inside a block of editor-authored HTML to the current locale's
 * addresses.
 *
 * `custom_html` and rich-text bodies are the one place an editor's internal links never reached
 * `href()` at all: the HTML goes to `set:html` as a string, so the block renderer sees no href to
 * resolve. Those links have exactly the problem the rest of this fix solves and one degree worse —
 * an editor writing `<a href="/contact">` in the Polish copy of a `custom_html` block has no
 * "pick a page" control, no locale hint, and no rendered warning that the link leaves the language.
 *
 * ## Deliberately narrow
 *
 * It rewrites the `href` of `<a>` START TAGS only, and only when `ctx` says there is something to
 * resolve — on the default-locale tree, or a build with no path index, the HTML is returned
 * byte-identical. That matters for a field whose whole contract is "the editor's markup, verbatim":
 * this can only ever change a link's destination on a translated tree, never the markup around it.
 *
 * Anchor start tags rather than a bare `href=` scan, because a literal `href="/contact"` shown as
 * sample text inside `<code>` is ordinary content and must not be rewritten — and it cannot match
 * here, since a literal `<a …>` in text has to arrive escaped to be text at all. A start tag
 * carrying a `>` inside an attribute value is not matched and is left alone; the result is the
 * untouched literal, which is this module's fallback everywhere.
 *
 * Each matched value goes through `href()` itself, so every rule there holds unchanged: an
 * external URL, a `mailto:`, a bare `#fragment` and a file-like path are all returned as they were.
 */
const ANCHOR_START_TAG = /<a\b[^>]*>/gi
const HREF_ATTRIBUTE = /(\shref\s*=\s*)(["'])(.*?)\2/i

export function localizeHtmlHrefs<T extends string | null | undefined>(html: T, ctx?: HrefLocaleContext): T {
  // `canResolve` rather than a truthy `ctx`: a context for the DEFAULT tree, or one with no index,
  // resolves nothing — and running the markup through `href()` anyway would still rewrite trailing
  // slashes, editing a field whose contract is "verbatim" for no gain.
  if (!canResolve(ctx) || typeof html !== 'string' || html === '') return html

  return html.replace(ANCHOR_START_TAG, (tag) =>
    tag.replace(HREF_ATTRIBUTE, (whole, lead: string, quote: string, value: string) => {
      const resolved = href(value, ctx)

      return resolved === undefined ? whole : `${lead}${quote}${resolved}${quote}`
    }),
  ) as T
}
