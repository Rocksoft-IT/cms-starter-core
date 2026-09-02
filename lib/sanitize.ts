import sanitizeHtml from 'sanitize-html'

// A style value with no request/eval vector: url(), expression() and @import are rejected
// (the `[\s\S]*` scans across newlines so a value can't smuggle url() on a second line).
// Defence-in-depth — none of the ALLOWED_STYLE_PROPS below meaningfully accept url() anyway,
// since the url()-bearing shorthands (background, background-image, list-style…) are excluded.
const SAFE_VALUE = [/^(?![\s\S]*(url|expression|@import))[^;{}]+$/i]

// Inline-style property allowlist. Everything here is a *formatting / typography / box-model*
// property — safe to let authored (incl. Webflow-migrated) CMS content carry. The genuinely
// dangerous props are deliberately EXCLUDED: `position`/`inset`/`top|right|bottom|left`/
// `z-index`/`transform` (the clickjacking full-page-overlay vector) and the `background`/
// `background-image` shorthands (the `background:url(evil)` CSS-exfil vector; `background-color`
// is safe and kept). Any property not listed is stripped, so new props are denied by default.
const ALLOWED_STYLE_PROPS = [
  // typography
  'color',
  'background-color',
  'font',
  'font-family',
  'font-size',
  'font-weight',
  'font-style',
  'font-variant',
  'line-height',
  'letter-spacing',
  'word-spacing',
  'text-align',
  'text-decoration',
  'text-transform',
  'text-indent',
  'white-space',
  'vertical-align',
  'direction',
  // box model
  'margin',
  'margin-top',
  'margin-right',
  'margin-bottom',
  'margin-left',
  'padding',
  'padding-top',
  'padding-right',
  'padding-bottom',
  'padding-left',
  'border',
  'border-top',
  'border-right',
  'border-bottom',
  'border-left',
  'border-width',
  'border-style',
  'border-color',
  'border-radius',
  'border-collapse',
  'border-spacing',
  'box-sizing',
  'outline',
  // sizing
  'width',
  'height',
  'max-width',
  'min-width',
  'max-height',
  'min-height',
  // flow (safe without positioning)
  'display',
  'float',
  'clear',
  'overflow',
  'overflow-x',
  'overflow-y',
  'list-style-type',
  'list-style-position',
] as const

const OPTS: sanitizeHtml.IOptions = {
  // Rich prose + media embeds authors legitimately use. Scripts and unlisted tags are
  // dropped; iframes survive only for the video hosts below (see allowedIframeHostnames).
  allowedTags: [
    ...sanitizeHtml.defaults.allowedTags,
    'img',
    'figure',
    'figcaption',
    's',
    'u',
    'sub',
    'sup',
    'mark',
    'span',
    'iframe',
    'video',
    'audio',
    'source',
  ],
  allowedAttributes: {
    ...sanitizeHtml.defaults.allowedAttributes,
    // `id` kept so in-content anchors / TOC jump links keep working.
    '*': ['class', 'style', 'id'],
    a: ['href', 'name', 'target', 'rel'],
    img: ['src', 'alt', 'width', 'height', 'loading'],
    iframe: ['src', 'width', 'height', 'title', 'allow', 'allowfullscreen', 'frameborder', 'loading'],
    video: ['src', 'controls', 'width', 'height', 'poster', 'preload'],
    audio: ['src', 'controls', 'preload'],
    source: ['src', 'type', 'srcset', 'media'],
  },
  // See ALLOWED_STYLE_PROPS above for the allowlist rationale. Every allowed prop is gated by
  // SAFE_VALUE (rejects url()/expression()/@import) as defence-in-depth.
  allowedStyles: {
    '*': Object.fromEntries(ALLOWED_STYLE_PROPS.map((prop) => [prop, SAFE_VALUE])),
  },
  // Reverse-tabnabbing: any link opening a new tab gets rel="noopener" so the opened page
  // can't reach back through window.opener. `noopener` (not `noreferrer`) so authored outbound
  // links keep sending a Referer for affiliate/analytics attribution. `_blank` is matched
  // case-insensitively (browsers treat the keyword ASCII-case-insensitively). Runs before
  // attribute filtering; `rel` is in allowedAttributes.a so the injected token survives.
  transformTags: {
    a: (tagName, attribs) => {
      if (attribs.target?.toLowerCase() === '_blank') {
        const rel = new Set((attribs.rel ?? '').split(/\s+/).filter(Boolean))
        rel.add('noopener')
        attribs.rel = [...rel].join(' ')
      }
      return { tagName, attribs }
    },
  },
  // `tel` kept for click-to-call links (sanitize-html's default set includes it; our
  // override must re-list it). No `data:`/`javascript:` — those are the injection vectors.
  allowedSchemes: ['http', 'https', 'mailto', 'tel'],
  // iframes are dropped unless their src host is one of these — blocks arbitrary-URL
  // iframe injection while preserving embedded videos.
  allowedIframeHostnames: [
    'www.youtube.com',
    'youtube.com',
    'www.youtube-nocookie.com',
    'youtube-nocookie.com',
    'player.vimeo.com',
    'www.loom.com',
  ],
}

export function sanitize(html: string | null | undefined): string {
  if (!html) return ''
  return sanitizeHtml(html, OPTS)
}

// Strip all markup to a whitespace-collapsed plain-text string. Use for previews/snippets
// where rich HTML must not render — e.g. a card excerpt inside a link (an <a> from the
// source would otherwise nest inside the card's <a>, which browsers force-close).
export function toText(html: string | null | undefined): string {
  if (!html) return ''
  return sanitizeHtml(html, { allowedTags: [], allowedAttributes: {} }).replace(/\s+/g, ' ').trim()
}

// SVG-safe sanitizer for inline icon SVGs (e.g. PricingTable tabIcon / icon_svg config field, and
// the `heading_icon` universal part — dashboard#1968).
// The prose sanitize() allowlist strips <svg>/<path>, so icon markup needs its own pass.
// Allowed: structural/shape/text SVG elements only. Dangerous elements are dropped:
//   <script>, <use> (SSRF via href to external resource), <image> (pixel-tracking),
//   <foreignObject> (HTML injection back door), <animate*>/<set> (timing/JS bridge).
// Allowed attributes: presentation + aria only — no event handlers (on*), no xlink:href
// (external fetch), no <a href> inside SVG (navigation injection), and no `style` (below).
//
// EVERY NAME BELOW IS LOWERCASE, AND THAT IS THE FIX, NOT A TYPO (dashboard#1968). `sanitize-html`
// parses as HTML, which lowercases tag and attribute names, and then matches them against these
// lists verbatim — so a camelCase entry can never match anything. This file shipped with
// `viewBox`, `preserveAspectRatio`, `gradientUnits`, `gradientTransform`, `spreadMethod`,
// `stdDeviation`, `maskUnits` and the tags `linearGradient` / `radialGradient` / `clipPath` /
// `textPath` / all seven `fe*` filters spelled in camelCase, and every one of them was silently
// dropped from every SVG that came through. The decisive case is the ordinary one: an unmodified
// Lucide icon came back WITHOUT its `viewBox`, so CSS-sizing it scaled the box and not the
// drawing and the glyph rendered at raw user units in a corner. Nobody noticed because a 24-unit
// drawing in a 20px box still shows something.
//
// Emitting lowercase is correct rather than a compromise: in an HTML document the parser's
// "adjust SVG attributes" / "adjust SVG tag names" tables map `viewbox` back to `viewBox` and
// `lineargradient` back to `linearGradient` inside foreign content. Astro emits static HTML that
// goes through exactly that parser, so the browser restores the SVG casing. Add new entries in
// LOWERCASE or they will not survive their first test.
const SVG_OPTS: sanitizeHtml.IOptions = {
  allowedTags: [
    'svg',
    'g',
    'defs',
    'symbol',
    'title',
    'desc',
    'path',
    'rect',
    'circle',
    'ellipse',
    'line',
    'polyline',
    'polygon',
    'text',
    'tspan',
    'textpath',
    'lineargradient',
    'radialgradient',
    'stop',
    'clippath',
    'mask',
    'filter',
    'feblend',
    'fecolormatrix',
    'fecomposite',
    'feflood',
    'fegaussianblur',
    'femerge',
    'femergenode',
    'feoffset',
  ],
  allowedAttributes: {
    '*': [
      // geometry / presentation
      //
      // NO `style` (dashboard#1968). It used to be here, and `sanitize-html` does not filter a
      // declaration value unless `allowedStyles` is set — which it is not — so the attribute came
      // through verbatim. Measured, two vectors: `position:fixed;top:0;left:0;width:100vw;
      // height:100vh;z-index:9999` is a full-viewport defacement authored from a content field,
      // and `background-image:url(https://evil.tld/pixel.png)` is exactly the pixel-tracking that
      // dropping <image> above was meant to prevent, walking back in through CSS. An icon needs
      // none of it: presentation travels on the SVG attributes below, and its SIZE comes from the
      // call site's shortcut. Do not re-add it — add an `allowedStyles` allowlist instead, and
      // only with a reason written here.
      'id',
      'class',
      'viewbox',
      'width',
      'height',
      'x',
      'y',
      'x1',
      'y1',
      'x2',
      'y2',
      'cx',
      'cy',
      'r',
      'rx',
      'ry',
      'points',
      'd',
      'fill',
      'fill-opacity',
      'fill-rule',
      'stroke',
      'stroke-width',
      'stroke-linecap',
      'stroke-linejoin',
      'stroke-dasharray',
      'stroke-dashoffset',
      'stroke-opacity',
      'opacity',
      'transform',
      'clip-path',
      'mask',
      'filter',
      'preserveaspectratio',
      'xmlns',
      // gradient / filter
      'offset',
      'stop-color',
      'stop-opacity',
      'gradientunits',
      'gradienttransform',
      'spreadmethod',
      'maskunits',
      'fx',
      'fy',
      'fr',
      'in',
      'in2',
      'result',
      'type',
      'values',
      'mode',
      'stddeviation',
      'dx',
      'dy',
      'k1',
      'k2',
      'k3',
      'k4',
      'flood-color',
      'flood-opacity',
      // text
      'font-family',
      'font-size',
      'font-weight',
      'text-anchor',
      'dominant-baseline',
      'letter-spacing',
      // a11y
      'aria-label',
      'aria-hidden',
      'role',
    ],
  },
  // No schemes needed — SVG icons carry no src/href in the allowed tag set.
  allowedSchemes: [],
}

// NO RENDERER IN THIS TREE CALLS THIS DIRECTLY ANY MORE, and that is not a sign it is dead.
// `sanitizeIcon()` below composes it — deleting it takes the icon path with it — and it is a
// package export, so a client repo's own override can reach for it when it wants the SAFE pass
// without the themeability one (an authored illustration rather than a glyph, say).
export function sanitizeSvg(svg: string | null | undefined): string {
  if (!svg) return ''
  return sanitizeHtml(svg, SVG_OPTS)
}

/**
 * A CMS-authored glyph, made SAFE by {@link sanitizeSvg} and THEMEABLE here (dashboard#1968).
 *
 * Composed rather than a second sanitizer, deliberately: one allowlist, one place vectors are
 * enumerated. Two lists is the mistake that produced the `viewBox` bug documented above, and the
 * `heading_icon` DoD forbids a block-local sanitizer for the same reason.
 *
 * WHY THIS EXISTS AT ALL. `config/cms.php:978` refused a raw-`<svg>` field on two grounds — "both
 * unthemeable and an injection hole". The injection half is answered by the allowlist above. The
 * themeability half is real and survives sanitizing: `fill="#1a3d7c"` on a pasted icon comes
 * through untouched and then sits in twenty sections that the next rebrand cannot reach. The
 * issue's own proposal was `help` text asking editors to use `currentColor`, and that is a request
 * rather than a mechanism — the first client who ignores it is the one this has to hold for. So
 * the colour is not requested, it is IMPOSED, which is what lets the field exist.
 *
 * The rules, and the reason each one is not the obvious simpler version:
 *
 *   - `none` is kept verbatim. Blanket-replacing `fill` would fill every stroke-only icon solid —
 *     that is the whole Lucide family, i.e. the most likely thing anyone pastes.
 *   - any OTHER `fill`/`stroke` becomes `currentColor`, on the root and on every descendant, so
 *     the glyph inherits the brand colour wherever it is drawn.
 *   - a root carrying neither gets `fill="currentColor"`, because SVG's initial `fill` is black,
 *     not inherited — an icon with no paint at all would otherwise ignore the brand.
 *   - `class`, `width` and `height` are dropped from EVERY TOP-LEVEL root: size is the call site's
 *     shortcut, not the paste's. A 9999px `width` or a `fixed inset-0` class is not a themeable
 *     icon. A nested `<svg>` keeps its own — see the note at the rewrite for why that differs.
 *
 * Everything geometric — `viewBox`, `d`, `stroke-width`, `fill-rule`, `opacity` — is untouched, so
 * the drawing itself survives exactly as authored.
 *
 * The consequence is deliberate and stated in the field's own help: a glyph here is MONOCHROME.
 * A mark that needs its own colours is a picture, and `cards` already carries that alternative.
 */
export function sanitizeIcon(svg: string | null | undefined): string {
  const safe = sanitizeSvg(svg)
  if (!safe) return ''

  // Attribute-level rewrite rather than a DOM pass: `safe` is already an allowlisted subset, so
  // there is no markup here that a targeted replace can be fooled by, and core stays free of a
  // parser dependency on the render path.
  const themed = safe.replace(
    /\s(fill|stroke)="([^"]*)"/g,
    (whole, attr: string, value: string) => (value.trim().toLowerCase() === 'none' ? whole : ` ${attr}="currentColor"`),
  )

  // No <svg> root means nothing renderable. `sanitizeSvg` keeps allowlisted CHILDREN even when
  // the wrapper was never there — a pasted bare `<path d="…"/>` survives as an orphan — and an
  // SVG child outside an <svg> draws nothing while still occupying the DOM. Returning empty makes
  // that the same "renders nothing" the empty case already gets, rather than an invisible span.
  if (!/<svg\b/i.test(themed)) return ''

  // EVERY top-level root, and only those.
  //
  // This was `^\s*<svg` and normalised just the first one, which had a bypass worth spelling out:
  // anything at all before the tag — `hello <svg …>` from a copy that caught a label — skipped the
  // step entirely, so the paste kept `width="9999"` AND never gained `fill="currentColor"`. SVG's
  // initial fill is black and is not inherited, so that glyph rendered black instead of following
  // the brand: the exact guarantee this function exists to make, quietly absent. A second root in
  // one field failed the same way.
  //
  // Depth-tracked rather than a plain global replace, because a NESTED `<svg>` is legal and its
  // `width`/`height` are its own viewport rather than a size the paste is imposing — stripping
  // those would break the drawing. Only an outermost root takes its size from the call site.
  let depth = 0

  return themed.replace(/<svg\b([^>]*)>|<\/svg\s*>/gi, (whole, attrs?: string) => {
    if (attrs === undefined) {
      depth = Math.max(0, depth - 1)

      return whole
    }

    const isRoot = depth === 0
    depth++

    if (!isRoot) return whole

    const stripped = attrs.replace(/\s(?:class|width|height)="[^"]*"/gi, '')

    return `<svg${stripped}${/\s(?:fill|stroke)="/i.test(stripped) ? '' : ' fill="currentColor"'}>`
  })
}

// Validate a single CSS property value coming from CMS free-text fields (e.g. aspectRatio,
// objectPosition in ImageBlock). These values are interpolated directly into a <style> tag,
// so an unvalidated value like `cover } body{display:none} #x{a` would break out of the
// rule set. The check is simple but effective: no `{`, `}`, `;` (rule-break chars), no `<`/`>`
// (tag injection), and no url()/expression()/@import. Returns undefined if the value is unsafe
// so callers can skip the declaration entirely.
export function sanitizeCssValue(value: string | null | undefined): string | undefined {
  if (!value) return undefined
  return /[{};@<>]|(url\s*\(|expression\s*\(|@import)/i.test(value) ? undefined : value
}
