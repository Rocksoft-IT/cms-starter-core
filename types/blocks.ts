// Hand-maintained: a project's own `ref` blocks (e.g. testimonials, pricing tables) merge
// additional data at resolve time from a referenced collection/component's own field
// registry — not derivable from cms.blocks alone, so `pnpm cms:types` never touches this
// section. Add your project's ref-block interfaces above the marker. Everything below it
// is generated from GET /api/blocks/schema and safe to overwrite.

// Blocks whose fields hold OTHER blocks — a recursive shape the flat schema can't express, so
// they are hand-authored here rather than generated (`pnpm cms:types` skips any block with a
// `blocks`-typed field but still adds it to the Block union by name; a regenerate would
// otherwise drop the interface while leaving the union member, which fails to compile).
// `ColumnChild` is now RECURSIVE (ADR-0003, superseding the depth-1 ADR-0002): a column/panel
// child may itself be a nesting block, so a `columns` (or a future `tabs`) can sit inside
// another container. The type is structurally recursive; the actual nesting DEPTH is bounded at
// runtime to Blocks::NESTING_CAP (=2) by the engine (childPalette + BlockResolver), not by the
// type — TS can't cleanly express "recursive but at most 2 deep", and the renderer recurses via
// BlockRenderer regardless of depth.

// One resolved column of a nesting block. `width` is optional: the live API always materializes
// it from the layout preset (BlockResolver iterates ColumnLayouts::widths()), but hand-authored
// payloads — fixtures, mock builds — may omit it and rely on the renderers' layout-share
// fallback (src/lib/layout-shares.ts).
export interface ResolvedColumn {
  width?: string
  blocks: ColumnChild[]
}

export interface ColumnsBlock {
  type: 'columns'
  data: {
    layout: string
    columns: ResolvedColumn[]
  }
}

// `hero` nests too: its optional `columns` area lets an editor compose the slots beside the
// heading (diligently-dashboard#570), replacing the old `right_kind` + `right_*` fields, which
// could only ever put content on the right and only one of four hardcoded kinds.
export interface HeroBlock {
  type: 'hero'
  data: {
    heading?: string
    subheading?: string
    image?: string | null
    variant?: 'image-right' | 'image-left' | 'no-image'
    ctas?: Array<{ label?: string; href?: string }>
    columns_layout?: string
    columns?: ResolvedColumn[]
  }
}
// Recursive (ADR-0003): a container child may itself be any block, including another container.
// Depth is bounded at runtime (Blocks::NESTING_CAP = 2), not in the type. `HeroBlock` stays
// excluded — a page hero is never a column/panel child (it's a top-level, full-width block).
export type ColumnChild = Exclude<Block, HeroBlock>

// `tabs` is a `panels`-kind nesting block (#894, ADR-0003): a set of named tabs, each holding
// its own block array — the same recursive `ColumnChild` set a column accepts, so a `columns`
// layout can live inside a tab (bounded to NESTING_CAP). `anchor` is derived server-side from
// `name` per locale (slug + de-dup); the renderer uses it for the tab/panel element ids.
export interface TabPanel {
  name?: string
  anchor?: string
  blocks: ColumnChild[]
}

export interface TabsBlock {
  type: 'tabs'
  data: {
    tabs: TabPanel[]
  }
}

// Ref blocks (testimonials, pricing_table, component_ref): the block data merges content
// resolved server-side from a referenced collection's field registry (cms.item_fields) or a
// Component's own fields — which GET /api/blocks/schema does not expose, so these shapes are
// hand-maintained here (`pnpm cms:types` skips ref blocks but still adds them to the Block
// union by name).

// The resolved shape of one `testimonial` collection item.
export interface TestimonialsItem {
  id: number
  quote?: string
  author?: string
  company?: string
  company_url?: string
  role?: string
  rating?: number
  photo?: string
}

export interface TestimonialsBlock {
  type: 'testimonials'
  data: {
    eyebrow?: string
    heading?: string
    layout?: 'slider' | 'single'
    items?: TestimonialsItem[]
  }
}

/** One resolved `plan` item (section-engine item type), referenced by pricing_table. */
export interface PricingPlan {
  id: number
  name: string
  size_label?: string
  price?: string
  billing_type?: string
  badge?: string
  description?: string
  features?: Array<{ title: string; description?: string }>
  cta_label?: string
  cta_href?: string
  fine_print?: string
}

/** One billing-type tab: the resolver folds `plans` into `tabs` when billing_toggle is set. */
export interface PricingTab {
  billing_type: string
  plans: PricingPlan[]
}

export interface PricingTableBlock {
  type: 'pricing_table'
  data: {
    anchor_id?: string
    eyebrow?: string
    heading?: string
    body?: string
    background?: 'light' | 'dark'
    billing_toggle?: boolean
    plans?: PricingPlan[]
    tabs?: PricingTab[]
    tab_icons?: Array<{ billing_type: string; icon_svg?: string }>
  }
}

export interface ComponentRefBlock {
  type: 'component_ref'
  data: {
    // The referenced Component's own type (footer | cta_default | mainfeatures_global),
    // stamped by the API so the renderer can dispatch; its resolved per-locale fields are
    // merged in flat alongside it (shape varies by component_type).
    component_id: number
    component_type?: string
    [key: string]: unknown
  }
}

/**
 * One resolved section item, as the `section_teaser` resolver embeds it. Unlike a plain
 * collection item, it carries a routable `path` and (when present) an `attachment_count`; any
 * other field the referenced section defines — e.g. a `status` the list layout shows as a pill —
 * flows through verbatim (hence the index signature).
 */
export interface SectionTeaserItem {
  id: number
  /** Localized title. */
  name?: string
  /** Routable path to the item (already locale-resolved server-side), or null if unrouteable. */
  path?: string | null
  /** Raw ISO date from the item's `date` field, or null. */
  date?: string | null
  /** Resolved featured image (MediaUrls.for shape); a bare string is tolerated for fixtures. */
  thumbnail?: { url?: string; alt?: string | null; width?: number | null; height?: number | null } | string
  /** Present only when the section defines a `status` field (list layout renders it as a pill). */
  status?: string
  /** Present only when the item has attachments (list layout shows the count). */
  attachment_count?: number
  /** Short plain-text excerpt of the item's content, resolved server-side (cards layout). */
  lead?: string
  [key: string]: unknown
}

export interface SectionTeaserBlock {
  type: 'section_teaser'
  data: {
    eyebrow?: string
    heading?: string
    layout?: 'cards' | 'list'
    limit?: number
    action_label?: string
    action_href?: string
    /** Per-item "read more" CTA label shown on each card (cards layout). */
    item_action_label?: string
    /** Noun for the list layout's attachment count, rendered as "{count} {label}". */
    attachments_label?: string
    items?: SectionTeaserItem[]
  }
}

// --- GENERATED BELOW: do not edit, run `pnpm cms:types` ---
export interface RichContentBlock {
  type: 'rich_content'
  data: {
    eyebrow?: string
    heading?: string
    body?: string
    image?: string | null
    alt?: string
    animation_url?: string
  }
}

export interface ParagraphBlock {
  type: 'paragraph'
  data: { body?: string }
}

export interface ButtonBlock {
  type: 'button'
  data: { label?: string; href?: string; style?: 'primary' | 'outline' }
}

export interface HeadingBlock {
  type: 'heading'
  data: { text?: string; level?: 'h1' | 'h2' | 'h3' | 'h4' }
}

export interface SeparatorBlock {
  type: 'separator'
  data: { style?: 'default' | 'wide' | 'dots' }
}

export interface VideoSectionBlock {
  type: 'video_section'
  data: { video_url?: string; heading?: string; body?: string }
}

export interface FeaturesBlock {
  type: 'features'
  data: {
    eyebrow?: string
    heading?: string
    intro?: string
    steps?: Array<{ number?: string; title?: string; description?: string }>
  }
}

export interface CtaBannerBlock {
  type: 'cta_banner'
  data: {
    eyebrow?: string
    heading?: string
    body?: string
    badges?: Array<{ label?: string }>
    ctas?: Array<{ label?: string; href?: string }>
  }
}

export interface PromoSplitBlock {
  type: 'promo_split'
  data: {
    eyebrow?: string
    heading?: string
    body?: string
    cta_label?: string
    cta_href?: string
    src?: string | null
    alt?: string
    reverse?: boolean
  }
}

export interface PricingTeaserBlock {
  type: 'pricing_teaser'
  data: {
    eyebrow?: string
    heading?: string
    body?: string
    cards?: Array<{
      eyebrow?: string
      title?: string
      bullets?: string
      price_label?: string
      cta_label?: string
      cta_href?: string
    }>
    footer_label?: string
    footer_href?: string
  }
}

export interface MainFeaturesBlock {
  type: 'mainfeatures'
  data: {
    eyebrow?: string
    heading?: string
    intro?: string
    tiles?: Array<{ icon?: string | null; label?: string; link?: string }>
  }
}

export interface NavTilesBlock {
  type: 'nav_tiles'
  data: {
    heading?: string
    tiles?: Array<{ label?: string; href?: string; icon?: string | null; highlighted?: boolean }>
  }
}

export interface FaqBlock {
  type: 'faq'
  data: { eyebrow?: string; heading?: string; intro?: string; items?: Array<{ question?: string; answer?: string }> }
}

export interface TeamBlock {
  type: 'team'
  data: {
    anchor_id?: string
    eyebrow?: string
    heading?: string
    members?: Array<{ name?: string; role?: string; photo?: string | null }>
  }
}

export interface ImageBlock {
  type: 'image_block'
  data: {
    src?: string | null
    alt?: string
    caption?: string
    maxWidth?: string
    align?: 'left' | 'center' | 'right'
    aspectRatio?: string
    objectFit?: 'cover' | 'contain' | 'fill'
    objectPosition?: string
    maxHeight?: string
    mobileAspectRatio?: string
    mobileObjectFit?: 'cover' | 'contain' | 'fill'
    mobileObjectPosition?: string
    mobileMaxHeight?: string
    desktopAspectRatio?: string
    desktopObjectFit?: 'cover' | 'contain' | 'fill'
    desktopObjectPosition?: string
    desktopMaxHeight?: string
  }
}

export interface ButtonGroupBlock {
  type: 'button_group'
  data: { buttons?: Array<{ label?: string; href?: string; style?: 'primary' | 'outline' }> }
}

export interface HighlightsBlock {
  type: 'highlights'
  data: {
    eyebrow?: string
    heading?: string
    categories?: Array<{
      title?: string
      note?: string
      items?: Array<{ name?: string; description?: string; price?: string }>
    }>
    links?: Array<{ label?: string; href?: string }>
    footnote?: string
  }
}

export interface QuoteBlock {
  type: 'quote'
  data: {
    source_tag?: string
    headline?: string
    lede?: string
    quote?: string
    attribution?: string
    source_link_label?: string
    source_link_href?: string
    image?: string | null
    alt?: string
  }
}

export interface HoursBlock {
  type: 'hours'
  data: {
    eyebrow?: string
    heading?: string
    hours?: Array<{ day_label?: string; hours_label?: string }>
    footnote?: string
  }
}

export interface MapBlock {
  type: 'map'
  data: { heading?: string; map_embed_src?: string }
}

export interface ContactBlock {
  type: 'contact'
  data: {
    eyebrow?: string
    heading?: string
    address?: string
    maps_url?: string
    phone_display?: string
    phone_e164?: string
  }
}

export interface CustomHtmlBlock {
  type: 'custom_html'
  data: { html?: string; full_width?: boolean }
}

export type Block =
  | RichContentBlock
  | ParagraphBlock
  | ButtonBlock
  | HeadingBlock
  | SeparatorBlock
  | VideoSectionBlock
  | FeaturesBlock
  | CtaBannerBlock
  | PromoSplitBlock
  | PricingTeaserBlock
  | MainFeaturesBlock
  | NavTilesBlock
  | FaqBlock
  | TeamBlock
  | ImageBlock
  | ButtonGroupBlock
  | HighlightsBlock
  | QuoteBlock
  | HoursBlock
  | MapBlock
  | ContactBlock
  | CustomHtmlBlock
  | HeroBlock
  | TestimonialsBlock
  | ComponentRefBlock
  | SectionTeaserBlock
  | PricingTableBlock
  | ColumnsBlock
  | TabsBlock
