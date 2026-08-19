// The core UnoCSS layer: the shortcut vocabulary the shipped blocks in core/blocks/ are written
// against, plus the brand-color → theme mapping. It lives in the PACKAGE, not in each client's
// uno.config.ts, so bumping the core dependency updates the shortcuts with the components that
// consume them. Before this, the set was copy-pasted into every client repo and drifted silently
// (a client's uno.config.ts and its core blocks could disagree about a width).
//
// Deliberately free of a `unocss` import: shortcuts are plain `Record<string, string>` and the
// theme is a plain object, so the package needs no new peer dependency and stays loadable from
// any config style. The site does the `defineConfig` call.
//
// Shared measures — the container widths and the section rhythm — read `--layout-*` tokens from
// core/styles/tokens.css, so one token override retunes every block at once. Per-block values
// (a radius, a shadow, a font size) are literals right here on purpose: they differ block by
// block, so a shared token would fit none of them. Either way a site overrides by redefining the
// shortcut key in its src/uno.ts (site keys win on collision) — no !important, ever.

/**
 * Palette keys the core shortcuts resolve as theme colors. UnoCSS emits NOTHING for an unknown
 * color name, so a key that reaches a shortcut without a value is a silently unstyled block
 * rather than an error - which is why this list exists and why resolveThemeColors checks against
 * it at build time.
 *
 * A site no longer has to DECLARE all of them: core ships a neutral value for every key (see
 * NEUTRAL_PALETTE_DEFAULTS), so `brand.colors` carries only what this brand wants to differ.
 */
export const REQUIRED_PALETTE_KEYS = [
  'primary',
  'primary-soft',
  'accent',
  'secondary',
  'body',
  'section-bg',
  'surface',
  'surface-alt',
  'surface-tint',
  'border',
  'heading',
  'eyebrow',
  'muted',
  'text-primary',
  'text-secondary',
  'button-primary',
  'button-primary-text',
  'button-secondary',
  'button-secondary-text',
] as const

/**
 * A complete, deliberately neutral value for every REQUIRED_PALETTE_KEYS entry.
 *
 * These are the values the reference site used to spell out in its own cms.config.ts, moved here
 * unchanged (dashboard #1195): they were already chosen to carry no brand - "a client's brand must
 * never leak in here", as that file put it - so they are exactly what a site with no opinion
 * should get. Nothing renders differently because of the move.
 *
 * A site overrides any subset in `brand.colors`, and the CMS overrides nine of them per client at
 * build time (Layout.astro emits `--color-*` from /api/branding, which wins over the theme value).
 * So this is the bottom rung of three, not a design decision imposed on anyone.
 */
export const NEUTRAL_PALETTE_DEFAULTS: Record<(typeof REQUIRED_PALETTE_KEYS)[number], string> = {
  primary: '#3b5aff',
  'primary-soft': '#8296ff',
  accent: '#ff5c21',
  secondary: '#101841',
  body: '#ffffff',
  'section-bg': '#f3f7fb',
  surface: '#ffffff',
  'surface-alt': '#f5f6f8',
  'surface-tint': '#eceff5',
  border: '#e3e5ea',
  heading: '#151516',
  eyebrow: '#3b5aff',
  muted: '#757575',
  'text-primary': '#151516',
  'text-secondary': '#4a4a57',
  'button-primary': '#3b5aff',
  'button-primary-text': '#ffffff',
  'button-secondary': '#101841',
  'button-secondary-text': '#ffffff',
}

/**
 * Shortcuts covering exactly the blocks shipped in core/blocks/. A site adding its own block types
 * adds its own shortcuts alongside these — spread AFTER this set so its keys win — and never edits
 * this one.
 */
export const coreShortcuts: Record<string, string> = {
  // ── Containers ──────────────────────────────────────────────────────────────
  // The only place in core allowed to set a max-width. A section is full-bleed (background +
  // vertical rhythm) and delegates its measure to an inner element carrying one of these.
  'container-global': 'w-[90%] max-w-[var(--layout-container)] mx-auto',
  'container-wide': 'w-[90%] max-w-[var(--layout-container-wide)] mx-auto',
  'container-narrow': 'w-[90%] max-w-[var(--layout-container-narrow)] mx-auto',
  'container-prose': 'w-[90%] max-w-[var(--layout-container-prose)] mx-auto',
  // Vertical rhythm between sections.
  'section-y': 'py-[var(--layout-space-y)]',
  // The site's display face, set by `--font-primary` in the site's stylesheet. The explicit
  // `inherit` fallback keeps the declaration valid on a site that defines no brand font.
  'font-brand': '[font-family:var(--font-primary,inherit)]',

  // ── Shared typography primitives ────────────────────────────────────────────
  // ONE eyebrow treatment for every block. The same semantic label used to have five different
  // looks in core — 20px/normal (`section-eyebrow`, 10 blocks), 13px/bold (`faq-eyebrow`),
  // 14px/semibold (`cta-eyebrow`), a 12px chip (`promo-split-eyebrow`) and a hardcoded copy in
  // CtaBanner's markup. Blocks now compose this and add only their own spacing or panel color, so
  // a site retunes every eyebrow on the page by redefining this one key.
  eyebrow: 'text-[13px] font-bold uppercase tracking-[0.08em] text-eyebrow',
  // Resetting a <ul>/<ol> that is only there for semantics, and a centred row of buttons — both
  // appeared verbatim in three blocks each before being named here.
  'list-reset': 'list-none p-0 m-0',
  'actions-row': 'flex flex-wrap justify-center gap-4',

  // ── Hero block ──────────────────────────────────────────────────────────
  // Hero used to nest three arbitrary measures (1080 / 1040 / 990) inside each other. One
  // container is enough: the inner rows sit inside it and centre their own content.
  'container-hero': 'container-global pt-[100px]',
  'section-hero': 'relative overflow-hidden bg-transparent',
  'hero-wrapper': 'flex flex-col items-stretch pb-12 pt-[60px]',
  'hero-col': 'flex flex-col items-stretch text-center gap-8',
  'hero-text': 'flex flex-col items-center gap-3',
  'hero-ctas': 'actions-row',
  'buttons-lottie-group':
    'flex flex-row justify-between items-center self-stretch gap-4 max-md:justify-center',
  // Hidden until the animation loads (see the reveal listeners in the component). The 220x220 box
  // stays reserved so revealing shifts nothing, and lottie-player's error-emoji fallback stays
  // suppressed when the /documents/*.json assets are absent.
  'image-hero-lottie':
    'flex-none w-[220px] h-[220px] self-start max-md:hidden ' +
    'opacity-0 transition-opacity duration-300 [&.is-loaded]:opacity-100',
  // Multi-column hero — structure only. Whatever a column holds (an image, a form, buttons) brings
  // its own styling. `flex-[1_1_0]` so the inline flex-grow from the layout token decides the split;
  // without the 0 basis the tracks would size to their content first. The stack breakpoint is Uno's
  // `lg` rather than the 991px this inherited from a Webflow export.
  'hero-2col':
    'flex flex-row items-center justify-center gap-10 pt-[5vh] pb-[10vh] ' +
    'max-lg:flex-col max-lg:gap-12',
  'hero-2col-left': 'flex-[1_1_0] text-center max-lg:w-full',
  'hero-2col-right': 'flex-[1_1_0] min-w-0 max-lg:w-full',

  // ── Buttons (button_group block + shared CTAs) ─────────────────────────────
  'btn-primary':
    'inline-flex items-center justify-center gap-2 ' +
    'bg-button-primary text-button-primary-text border-[3px] border-solid border-button-primary rounded-[8px] ' +
    'px-7 py-4 font-bold text-[20px] leading-6 tracking-[0.01em] ' +
    'no-underline cursor-pointer select-none ' +
    'transition-colors duration-300 ' +
    'hover:bg-transparent hover:text-button-primary',

  'btn-outline':
    'inline-flex items-center justify-center gap-2 ' +
    'bg-transparent text-button-primary border-[3px] border-solid border-button-primary rounded-[8px] ' +
    'px-7 py-4 font-bold text-[20px] leading-6 tracking-[0.01em] ' +
    'no-underline cursor-pointer select-none ' +
    'transition-colors duration-500 ' +
    'hover:bg-button-primary hover:text-button-primary-text',

  'btn-secondary':
    'inline-flex items-center justify-center gap-2 ' +
    'bg-button-secondary text-button-secondary-text border-[3px] border-solid border-button-secondary rounded-[8px] ' +
    'px-7 py-4 font-bold text-[20px] leading-6 tracking-[0.01em] ' +
    'no-underline cursor-pointer select-none ' +
    'transition-colors duration-300 ' +
    'hover:bg-transparent hover:text-button-secondary',

  'btn-white':
    'inline-flex items-center justify-center ' +
    'bg-white text-black border-[3px] border-solid border-white rounded-[8px] ' +
    'px-7 py-4 font-bold text-[16px] leading-6 tracking-[0.01em] ' +
    'no-underline cursor-pointer select-none ' +
    'transition-colors duration-500 ' +
    'hover:bg-transparent hover:text-white',

  // ── Navbar CTAs ────────────────────────────────────────────────────────────
  'navbar-cta-primary':
    'inline-flex items-center justify-center gap-2 ' +
    'bg-button-primary text-button-primary-text rounded-[8px] px-4 py-2 ' +
    'font-bold no-underline cursor-pointer select-none ' +
    'transition-opacity duration-300 hover:opacity-90',
  'navbar-cta-secondary':
    'inline-flex items-center justify-center gap-2 ' +
    'bg-button-secondary text-button-secondary-text rounded-[8px] px-4 py-2 ' +
    'font-bold no-underline cursor-pointer select-none ' +
    'transition-opacity duration-300 hover:opacity-90',

  // ── Image block ───────────────────────────────────────────────────────────
  'section-image': 'py-8 container-narrow',

  // ── Button group block ─────────────────────────────────────────────────────
  'section-buttons': 'py-8 container-narrow actions-row',

  // ── Rich content block ───────────────────────────────────────────────────────
  'section-content': 'section-y',
  'content-inner': 'container-narrow',

  // ── Custom HTML block ───────────────────────────────────────────────────────
  // The `full_width` variant skips this and bleeds edge to edge. This replaced an inline style
  // built from `cmsConfig.layout.containerWidth` — the one place a width bypassed the Uno layer.
  'custom-html-inner': 'container-global',
  'rich-heading': 'text-[40px] font-bold leading-[1.2] mb-6',
  'rich-body':
    'text-[18px] font-normal leading-[1.7] text-text-secondary [&_p]:mb-4 [&_p:last-child]:mb-0 [&_img]:max-w-full [&_img]:h-auto',

  // ── Features block ───────────────────────────────────────────────────────
  // The step cards alternate sides, so `features-card-top`/`-bottom` are alignment only. The
  // number badge takes the brand accent rather than the `--color-jonquil` it used to fall back
  // to — that token was never in any palette, so the yellow came from a hardcoded fallback.
  'section-features': 'section-y',
  'features-inner': 'container-narrow',
  // `w-full max-w-[720px]` rather than the `w-[720px] max-w-full` it used to carry: identical
  // rendering, but it states the measure as a max-width like every other container in core.
  'features-component': 'flex flex-col gap-16 w-full max-w-[720px] mx-auto',
  'features-steps': 'flex flex-col gap-16',
  'features-card':
    'flex flex-row items-center gap-5 p-6 max-w-[400px] bg-surface rounded-[12px] ' +
    'max-sm:max-w-full max-sm:self-stretch',
  'features-card-top': 'self-start',
  'features-card-bottom': 'self-end',
  'features-number-badge':
    'flex items-center justify-center shrink-0 w-14 h-14 bg-accent rounded-[8px]',

  // ── FAQ block ───────────────────────────────────────────────────────────────
  // A single-open accordion, or the same cards always open (`faq-item-static`, at the end of this
  // group). Full content width, like every other section: the smbp design pins
  // FAQ at the same measure as its neighbours and the question list at `max-width: none`
  // (smbp-preview.dc.html:296/305). A site wanting a reading measure remaps `faq-inner` to
  // `container-prose`. Only the parts no utility can express (::marker, the <details> open state,
  // keyframes) stay in the component's scoped CSS.
  'section-faq': 'section-y',
  'faq-inner': 'container-global',
  'faq-header': 'mb-7',
  // With a CTA the heading block and the link sit on one baseline-aligned row, wrapping on narrow
  // viewports; without one the row is a plain block and changes nothing.
  'faq-header-row': 'flex flex-wrap items-end justify-between gap-4',
  // A quiet pill: this is the way out for someone the answers did not help, not the section's
  // primary action. A site that wants its own button remaps this one key.
  'faq-action':
    'inline-flex items-center gap-2 shrink-0 whitespace-nowrap no-underline cursor-pointer ' +
    'rounded-full border border-solid border-border px-[18px] py-[10px] ' +
    'bg-surface text-heading font-semibold text-[14px] ' +
    'transition-colors hover:border-primary hover:text-primary',
  'faq-eyebrow': 'eyebrow m-0 mb-[0.6rem]',
  'faq-heading': 'm-0 font-brand font-bold text-[32px] leading-[1.15] tracking-[-0.02em] text-heading',
  'faq-intro': 'mt-2 mb-0 max-w-[60ch] text-[16px] leading-[1.5] text-muted',
  'faq-list': 'flex flex-col gap-3 list-reset',
  'faq-item':
    'bg-surface border border-solid border-border rounded-[16px] overflow-hidden ' +
    'shadow-[0_4px_16px_rgb(0_0_0_/_4%)] transition-colors duration-200 hover:border-primary-soft',
  'faq-summary':
    'flex items-center gap-[1.1rem] px-6 py-5 cursor-pointer list-none ' +
    'transition-colors duration-150 hover:bg-surface-alt',
  'faq-question': 'flex-1 min-w-0 font-brand font-semibold text-[17px] leading-[1.35] text-heading',
  'faq-chevron':
    'flex items-center justify-center shrink-0 w-[34px] h-[34px] rounded-full ' +
    'bg-surface-tint text-primary transition-transform duration-200 motion-reduce:transition-none',
  // The hairline above the answer is a ::before rather than a border so it can be inset from the
  // padding edge; `animate-*` carries the reveal, disabled under reduced motion.
  'faq-answer-wrap':
    'pt-1 px-6 pb-[22px] before:content-[""] before:block before:h-px before:mb-4 before:bg-border ' +
    'motion-reduce:animate-none',
  'faq-answer': 'text-[15.5px] leading-[1.7] max-w-[74ch] text-text-secondary',
  // The `list` layout adds ONE key, worn alongside `faq-item` — it is the same card, minus the
  // disclosure. Deliberately not a second card definition: a site that remaps `faq-item`,
  // `faq-question` or `faq-answer` (most do) must not have to discover a parallel set of keys to
  // keep the two layouts looking alike. All this adds is what the summary and answer-wrap were
  // providing in the accordion — the padding, and the gap between question and answer.
  'faq-item-static': 'flex flex-col gap-[0.6rem] px-6 py-5',

  // ── Columns block ───────────────────────────────────────────────────────────
  // The container sits on the grid (the inner element), not on the <section>. Tracks come from
  // block data through the inline `--cols` custom property; below `md` they collapse to one column
  // in authoring order.
  'section-columns': 'py-8',
  'columns-grid': 'container-global grid gap-8 items-start grid-cols-[var(--cols)] max-md:grid-cols-1',

  // ── Testimonials block ──────────────────────────────────────────────────────
  // Stacked cards at a reading measure are the default; `.is-slider` on the wrapper switches the
  // same markup into a sliding track. The switch rides `[.is-slider_&]:` variants so the whole
  // block stays in this file — the ancestor class is set by the renderer, not by a stylesheet.
  'testimonial-mask': '[.is-slider_&]:overflow-hidden [.is-slider_&]:w-[88%] [.is-slider_&]:mx-auto',
  'testimonial-track':
    'mx-auto w-full max-w-[var(--layout-container-prose)] flex flex-col gap-6 ' +
    '[.is-slider_&]:flex-row [.is-slider_&]:gap-0 [.is-slider_&]:max-w-none ' +
    '[.is-slider_&]:transition-transform [.is-slider_&]:duration-500',
  'testimonial-slide': '[.is-slider_&]:w-full [.is-slider_&]:shrink-0',

  // ── Tabs block ──────────────────────────────────────────────────────────────
  // The selected state rides `[aria-selected='true']` rather than a class: the tab strip's source
  // of truth is the ARIA attribute the script already maintains, so styling it directly keeps the
  // two from drifting.
  'section-tabs': 'py-12',
  'tabs-inner': 'container-narrow',
  'tablist': 'flex flex-wrap gap-1 mb-6 border-b-2 border-b-solid border-b-section-bg',
  tab:
    'appearance-none bg-none border-none px-[1.1rem] py-3 [font:inherit] font-semibold cursor-pointer ' +
    'text-text-secondary border-b-2 border-b-solid border-b-transparent -mb-0.5 ' +
    'hover:text-primary [&[aria-selected="true"]]:text-primary ' +
    '[&[aria-selected="true"]]:border-b-primary',
  tabpanel: '[&[hidden]]:hidden',

  // ── Quote block ─────────────────────────────────────────────────────────────
  // `quote-text` is handed to the RichText child, so it styles that component's own element —
  // which is why this block needs no scoped CSS to reach into it.
  'section-quote': 'section-y',
  'quote-inner': 'container-narrow',
  'quote-has-image': 'grid gap-10 items-center md:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]',
  'quote-figure': 'm-0',
  'quote-image': 'block w-full h-auto rounded-[12px]',
  'quote-source-tag': 'eyebrow m-0 mb-3',
  'quote-headline': 'm-0 mb-4 text-[clamp(1.75rem,3vw,2.5rem)] font-bold leading-[1.2]',
  'quote-lede': 'm-0 mb-6 text-[1.125rem] leading-[1.7] text-text-secondary',
  // A leading rule plus oversized type sets the pull-quote apart from prose.
  'quote-mark': 'm-0 pl-6 border-l-4 border-solid border-primary',
  'quote-text': 'text-[clamp(1.35rem,2.5vw,1.75rem)] font-medium leading-[1.4] [&_p]:mb-3 [&_p:last-child]:mb-0',
  'quote-cite': 'flex flex-wrap items-baseline gap-x-3 gap-y-1 mt-6 text-[1rem]',
  'quote-attribution': 'font-bold',
  'quote-source-link': 'text-primary underline underline-offset-2',

  // ── Separator block ─────────────────────────────────────────────────────────
  // Each variant resets the <hr> border and states its own, in one shortcut, so the reset cannot
  // lose a cascade race against the variant that follows it.
  'section-separator': 'container-narrow py-6',
  separator: 'mx-auto',
  'separator-default': 'w-[100px] border-0 border-t-2 border-solid border-t-muted',
  'separator-wide': 'w-full border-0 border-t border-solid border-t-muted',
  'separator-dots':
    'w-full h-6 border-0 flex items-center justify-center gap-3 text-muted ' +
    "before:content-['•••'] before:tracking-[0.5rem] before:text-[1.25rem] before:leading-[1]",

  // ── Shared section header (used across several blocks) ─────────────────────
  // Kept as its own key because ten blocks and any site override already reference it; it is now
  // an alias so the treatment has a single definition.
  'section-eyebrow': 'eyebrow',
  'section-heading': 'font-brand font-bold text-[40px] leading-[1.2]',
  'section-intro': 'text-[18px] text-text-secondary leading-[1.7]',
  // Centred by default. With an `action` slot filled it becomes a row — heading block left, action
  // right, wrapping on narrow viewports — which is why the text gets its own wrapper.
  'section-header': 'text-center mb-12 flex flex-col items-center gap-2',
  'section-header-text': 'flex flex-col items-center gap-2',
  'section-header-with-action': 'flex-row flex-wrap items-end justify-between text-left [&>.section-header-text]:items-start',
  'link-inline': 'text-text-primary underline hover:no-underline',

  // ── Pricing teaser block ──────────────────────────────────────────────────
  'pricing-teaser-inner': 'container-narrow',

  // ── Highlights block ──────────────────────────────────────────────────────
  'highlights-inner': 'container-prose',

  // ── Pricing table block ───────────────────────────────────────────────────
  // The section carries its own dark styling via the `.is-dark` variant, so the
  // component sets exactly one class for the background select (single source of
  // truth — inner text inherits, cards restate their own colors).
  'section-pricing-table': 'bg-section-bg [&.is-dark]:bg-secondary [&.is-dark]:text-white',
  // Tab button carries its own active styling via `.is-active` variants, so the
  // client script only toggles that one class (single source of truth).
  'pricing-tab':
    'font-bold text-[14px] px-6 py-2 rounded-full border-2 border-current bg-transparent ' +
    'transition-colors duration-200 cursor-pointer flex items-center gap-2 ' +
    '[&.is-active]:bg-button-primary [&.is-active]:text-button-primary-text [&.is-active]:border-button-primary',
  // Tier illustration. Full card width, its own aspect kept — these are drawings sized by the
  // designer, so no crop and no fixed height; the margin below matches the card's own gap.
  'pricing-plan-image': 'block w-full h-auto mb-2',
  'pricing-card': 'bg-white text-text-primary rounded-[16px] p-7 flex flex-col gap-4 border border-gray-200',
  'pricing-chip':
    'self-start text-[11px] font-bold tracking-[0.12em] uppercase text-text-secondary border border-gray-200 rounded-full px-3 py-1',
  'pricing-badge': 'self-start text-[12px] font-semibold bg-primary text-button-primary-text rounded-full px-3 py-1',
  'pricing-price': 'text-[36px] font-bold leading-[1.1]',

  // ── Hours & location block ────────────────────────────────────────────────
  'section-hours-location': 'bg-section-bg',

  // ── Promo split block ─────────────────────────────────────────────────────
  // Values ported from the smbp design handoff (export_smbp_preview, "ODK" home section);
  // colors stay brand-token driven (`secondary` panel + white/alpha text) so the same core
  // renderer rethemes per site.
  //
  'section-promo-split': 'section-y',
  // The container is its own node so the panel keeps its styling when a site remaps the measure —
  // and it takes the documented `-inner` name, leaving the styled grid as `-panel`. The 1180px this
  // used to hardcode was a client's design value; the width is the shared one now.
  'promo-split-inner': 'container-global',
  // Panel: grid-template-columns minmax(0,1.05fr) minmax(0,.95fr); radius 24px;
  // shadow 0 18px 42px rgba(31,36,32,.13). The 2-col split is applied by the renderer only
  // when an image is set (a copy-only panel stays single-column).
  'promo-split-panel': 'grid bg-secondary rounded-[24px] overflow-hidden shadow-[0_18px_42px_rgba(31,36,32,0.13)]',
  // Copy column: padding 48px 46px (reduced on mobile), left-aligned, vertically centered.
  'promo-split-content': 'flex flex-col items-start justify-center p-7 md:px-[46px] md:py-12',
  // The shared eyebrow, worn as a chip: rgba(255,255,255,.12) pill, 7px 14px, tinted for the dark
  // panel. Size and color come after `eyebrow` so they win.
  'promo-split-eyebrow':
    'eyebrow inline-flex items-center gap-2 bg-white/12 rounded-full px-3.5 py-[7px] ' +
    'text-[12px] text-white/85',
  // Heading: clamp(30px,3.4vw,40px)/1.08, -0.02em, white, 20px above.
  'promo-split-heading': 'text-[clamp(30px,3.4vw,40px)] font-bold leading-[1.08] tracking-[-0.02em] text-white mt-5',
  // Body: 16.5px/1.6, tinted white (#c4d6c6 in the handoff → white/75 on the token panel),
  // measure capped at 46ch.
  'promo-split-body': 'text-[16.5px] leading-[1.6] text-white/75 max-w-[46ch] mt-4',
  // CTA: white pill 13px 22px, bold 15px, panel-colored text, arrow icon; lifts on hover.
  'promo-split-cta':
    'inline-flex items-center gap-[9px] bg-white text-secondary rounded-full px-[22px] py-[13px] ' +
    'font-bold text-[15px] no-underline cursor-pointer mt-7 ' +
    'transition duration-200 hover:bg-white/90 hover:-translate-y-px',
  // Photo column: bleeds to the panel edge; min-height 360px (280px stacked on mobile).
  'promo-split-media': 'relative min-h-[280px] md:min-h-[360px]',
  'promo-split-image': 'absolute inset-0 w-full h-full object-cover',

  // ── Team block ──────────────────────────────────────────────────────────────
  'section-team': 'section-y',
  'team-inner': 'container-global',
  'team-grid': 'grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-x-6 gap-y-10 list-reset',
  'team-card': 'flex flex-col items-center text-center',
  'team-photo':
    'flex items-center justify-center w-40 h-40 rounded-full overflow-hidden bg-section-bg ' +
    '[&_img]:block [&_img]:w-full [&_img]:h-full [&_img]:object-cover',
  'team-photo-placeholder': 'font-brand font-bold text-[48px] leading-[1] text-muted',
  'team-name': 'mt-5 font-bold text-[20px] leading-[1.3] text-text-primary',
  'team-role': 'mt-1 text-[16px] leading-[1.5] text-text-secondary',

  // ── Cards block ──────────────────────────────────────────────────────────
  // One block, three layouts (context/changes/unify-cards-block/). Core carries what every layout
  // agrees on — the grid, the media/marker slots, the label/value typography. The DIFFERENCES
  // between layouts are the site layer's: the renderer emits `is-cards` / `is-tiles` / `is-steps`
  // on the section purely as a hook to style against.
  //
  // Core deliberately ships no per-variant look (#1035). Eight shortcuts used to sit here written
  // as descendant selectors (`'.is-cards .card'`), which a shortcut key cannot be — the key IS a
  // class name — so they generated nothing while reading in the source like working style. Anything
  // needing a real descendant selector is not a shortcut; it belongs in a site stylesheet.
  // `verify:core-styles` now fails on a selector-shaped key so the same silence cannot return.
  'section-cards': 'section-y',
  'cards-inner': 'container-global',
  'cards-grid': 'grid grid-cols-[repeat(auto-fit,minmax(240px,1fr))] gap-[18px] list-reset mt-6',
  card: 'flex items-start gap-[14px] h-full no-underline',
  'card-media':
    'shrink-0 flex items-center justify-center w-10 h-10 rounded-[11px] bg-section-bg text-primary ' +
    '[&>svg]:w-5 [&>svg]:h-5 [&>img]:w-full [&>img]:h-full [&>img]:object-contain',
  'card-marker':
    'shrink-0 flex items-center justify-center w-10 h-10 rounded-full bg-primary text-white font-bold text-[15px]',
  'card-label': 'font-semibold text-text-primary',
  'card-value': 'mt-1 leading-[1.5] text-text-secondary whitespace-pre-line',

  // ── Gallery block ────────────────────────────────────────────────────────
  // Square-ish tiles on an auto-fill grid, so the column count follows the measure instead of
  // being pinned to a number a narrower page cannot honour. A site retunes any of these.
  'section-gallery': 'section-y',
  'gallery-inner': 'container-global',
  'gallery-note': 'text-[14px] text-muted m-0',
  'gallery-grid': 'grid grid-cols-[repeat(auto-fill,minmax(240px,1fr))] gap-4 list-reset mt-5',
  // Enlarge-on-click (Gallery.astro). Shortcuts, not scoped CSS, for the same reason every other
  // class in this block is one — and because a viewport clamp written in a component's <style>
  // trips the styling contract, which reads any `max-width` there as a content measure.
  // `select-none`: dragging across a photo would otherwise select it and paint the selection
  // highlight over the image — visible as a tinted block behind it, and easy to trigger because
  // the tile and the enlarged view are both things people click and drag on.
  'gallery-zoom': 'block w-full h-full p-0 border-0 bg-transparent cursor-zoom-in select-none',
  // Fills the viewport rather than shrinking to the photo, so the area AROUND the photo belongs
  // to the dialog — that is what makes "click outside to dismiss" a real target instead of a few
  // stray pixels. `max-w`/`max-h` override the UA's own dialog clamp.
  // `hidden` first, `grid` only while [open]: a bare `display: grid` here OVERRIDES the UA's
  // `dialog:not([open]) { display: none }`, so the closed dialog stays laid out at 100vw × 100dvh
  // and swallows every click on the page behind it. Invisible, and it breaks the whole page —
  // smbp's pricing-tab test caught it as a click that timed out on an element it could see.
  'gallery-dialog':
    'hidden [&[open]]:grid w-[100vw] h-[100dvh] max-w-[100vw] max-h-[100dvh] p-0 border-0 ' +
    'bg-transparent place-items-center [&::backdrop]:bg-black/80',
  'gallery-dialog-figure': 'block w-auto h-auto max-w-[92vw] max-h-[92dvh] select-none',
  // 44px: the smallest target comfortably hittable on a phone.
  'gallery-dialog-button':
    'fixed flex items-center justify-center w-11 h-11 border-0 rounded-full bg-black/55 text-white cursor-pointer',
  // `[&_img]`, a DESCENDANT selector, not `[&>img]`: the tile's photo is wrapped in the zoom
  // button, so a direct-child rule stopped matching the moment the lightbox landed and the tiles
  // silently lost `object-fit: cover` — photos stretched to the tile instead of filling it.
  'gallery-tile':
    'relative h-[200px] rounded-[14px] overflow-hidden border border-solid border-border ' +
    '[&_img]:w-full [&_img]:h-full [&_img]:object-cover',
  // ── CTA banner block ──────────────────────────────────────────────────────
  'section-cta': 'bg-black text-white py-20',
  'cta-content': 'flex flex-col gap-4 text-center',
  'cta-actions': 'actions-row mt-8',
  'cta-badges': 'flex flex-wrap justify-center gap-2',
  // Optional highlight tags (`badges` repeater) — a brand-neutral pill that reads on the dark CTA
  // background. It used to pulse on a self-contained keyframe; a shared engine has no business
  // animating a client's badge, so the motion is gone rather than tokenized.
  'cta-badge':
    'inline-block px-3 py-1 rounded-full border border-solid border-white/40 ' +
    'bg-white/12 text-white text-xs font-bold uppercase tracking-[0.03em]',
  'cta-inner': 'container-prose text-center',
  // On the dark banner the label stays white, as CtaBanner's markup rendered it before the
  // shortcut existed; the treatment itself is the shared one.
  'cta-eyebrow': 'eyebrow text-white mb-4',
  'cta-heading': 'font-brand font-bold text-[36px] leading-[1.2] mb-4',
  'cta-body': 'text-[18px] text-gray-300 mb-8',
  'btn-primary-white':
    'inline-flex items-center justify-center ' +
    'bg-primary text-black border-[3px] border-primary rounded-[8px] ' +
    'px-7 py-4 font-bold text-[20px] leading-6 ' +
    'no-underline cursor-pointer ' +
    'transition-colors duration-300 ' +
    'hover:bg-transparent hover:text-primary',

  // ── Cookie consent banner (CookieConsent.astro, #521 / #1191) ──────────────
  // The component itself ships no visual CSS by design (like Footer.astro); these are the theme's
  // default look, on the site's own brand tokens, so a fresh client isn't stuck with a bare
  // unstyled bar the moment consent is switched on. A site overrides by redefining any of these
  // keys in its own src/uno.ts — site keys win on collision, no !important. `btn-primary`/
  // `btn-outline` above are sized for hero CTAs (px-7 py-4, 20px type) and would dwarf a slim
  // banner, so this is its own compact scale rather than a reuse.
  //
  // `[&[hidden]]:hidden` (the same fix `tabpanel` already needed, above) is load-bearing, not
  // decorative: `flex` and the browser's own `[hidden]{display:none}` are BOTH single-class/
  // attribute specificity, so on a tie the later-loaded stylesheet wins — and this one loads
  // after the UA sheet. Without it, CookieConsent.astro's open()/close() (el.hidden = …) sets
  // the DOM attribute correctly, every click handler fires, consent really is recorded — the
  // banner just never visually leaves the screen. Confirmed live on the Diligently client
  // (dashboard #1191): `computedDisplay` stayed `flex` with `hidden` already true. This
  // shortcut's own compound selector always wins regardless of load order.
  'cookie-consent':
    'fixed inset-x-0 bottom-0 z-50 flex flex-col gap-4 ' +
    'border-t border-solid border-border bg-surface p-5 shadow-[0_-8px_24px_rgb(0_0_0_/_10%)] ' +
    'sm:flex-row sm:items-center sm:justify-between sm:gap-6 sm:p-6 ' +
    '[&[hidden]]:hidden',

  'cookie-consent__message': 'm-0 text-[14px] leading-relaxed text-text-primary sm:flex-1',

  'cookie-consent__link': 'text-primary underline underline-offset-2 hover:text-primary-soft',

  'cookie-consent__actions': 'flex flex-row shrink-0 gap-3',

  'cookie-consent__button':
    'inline-flex items-center justify-center gap-2 ' +
    'rounded-[8px] border-[2px] border-solid px-4 py-2 ' +
    'text-[14px] font-semibold leading-5 no-underline cursor-pointer select-none ' +
    'transition-colors duration-200',

  // Same footprint as --reject below (equal size and weight) — the "not a dark pattern" the
  // component's own comment calls for; only fill vs outline differs, not prominence.
  'cookie-consent__button--accept':
    'bg-button-primary text-button-primary-text border-button-primary ' +
    'hover:bg-transparent hover:text-button-primary',

  'cookie-consent__button--reject':
    'bg-transparent text-button-primary border-button-primary ' +
    'hover:bg-button-primary hover:text-button-primary-text',
}

/**
 * A site's `brand.colors` as UnoCSS theme colors, and the guard that the palette is complete:
 *
 *   export default defineConfig({
 *     presets: [presetUno()],
 *     content: { filesystem: [...] },
 *     theme: { colors: resolveThemeColors(cmsConfig.brand.colors) },
 *     shortcuts: { ...coreShortcuts, ...siteUno.shortcuts },
 *   })
 *
 * Each color resolves to a CSS custom property with the site value as fallback, so a build-time
 * palette injected from the CMS API (see Layout.astro) rethemes everything without touching
 * components.
 *
 * A site's palette is merged OVER core's neutral defaults, so it declares only the keys it wants
 * to differ (dashboard #1195) and a partial palette can no longer render an unstyled block. Keys
 * the site adds beyond the required set pass through untouched, as they always did.
 *
 * The throw is kept, but it can now only fire on a key added to REQUIRED_PALETTE_KEYS without a
 * matching NEUTRAL_PALETTE_DEFAULTS entry - i.e. a core authoring mistake, not a site's problem.
 * tests/uno.core.test.ts pins the two lists in sync so that stays theoretical.
 *
 * Keep `theme` an inline object literal at the call site: assigning a pre-typed one makes
 * TypeScript infer UnoCSS's Theme generic from it, which then rejects `presetUno()`.
 */
export function resolveThemeColors(colors: Record<string, string>): Record<string, string> {
  const merged: Record<string, string> = { ...NEUTRAL_PALETTE_DEFAULTS, ...colors }

  const missing = REQUIRED_PALETTE_KEYS.filter((key) => !(key in merged))
  if (missing.length > 0) {
    throw new Error(
      `Core palette keys have no value: ${missing.join(', ')}. Core blocks reference these as ` +
        'theme colors and UnoCSS emits nothing for an unknown color name, so the affected blocks ' +
        'would render unstyled. Every REQUIRED_PALETTE_KEYS entry needs a NEUTRAL_PALETTE_DEFAULTS ' +
        'value in core/uno.core.ts; a site may then override any subset in cms.config.ts.',
    )
  }

  return Object.fromEntries(Object.entries(merged).map(([key, value]) => [key, `var(--color-${key}, ${value})`]))
}
