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

// SVG-safe sanitizer for inline icon SVGs (e.g. PricingTable tabIcon / icon_svg config field).
// The prose sanitize() allowlist strips <svg>/<path>, so icon markup needs its own pass.
// Allowed: structural/shape/text SVG elements only. Dangerous elements are dropped:
//   <script>, <use> (SSRF via href to external resource), <image> (pixel-tracking),
//   <foreignObject> (HTML injection back door), <animate*>/<set> (timing/JS bridge).
// Allowed attributes: presentation + aria only — no event handlers (on*), no xlink:href
// (external fetch), no <a href> inside SVG (navigation injection).
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
    'textPath',
    'linearGradient',
    'radialGradient',
    'stop',
    'clipPath',
    'mask',
    'filter',
    'feBlend',
    'feColorMatrix',
    'feComposite',
    'feFlood',
    'feGaussianBlur',
    'feMerge',
    'feMergeNode',
    'feOffset',
  ],
  allowedAttributes: {
    '*': [
      // geometry / presentation
      'id',
      'class',
      'style',
      'viewBox',
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
      'preserveAspectRatio',
      'xmlns',
      // gradient / filter
      'offset',
      'stop-color',
      'stop-opacity',
      'gradientUnits',
      'gradientTransform',
      'spreadMethod',
      'cx',
      'cy',
      'fx',
      'fy',
      'fr',
      'in',
      'in2',
      'result',
      'type',
      'values',
      'mode',
      'stdDeviation',
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

export function sanitizeSvg(svg: string | null | undefined): string {
  if (!svg) return ''
  return sanitizeHtml(svg, SVG_OPTS)
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
