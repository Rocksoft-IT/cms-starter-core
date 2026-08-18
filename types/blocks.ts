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
    // Shared section fields ($sectionBackground / $sectionAlign in config/cms.php). Copied by
    // hand because `pnpm cms:types` skips ref blocks — keep them in step with the config.
    background?: 'default' | 'light' | 'muted' | 'brand' | 'dark'
    align?: 'default' | 'left' | 'center'
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
    // Same shared pair as TestimonialsBlock above, and hand-copied for the same reason.
    // `background` widened from the block's original two-value select to the full
    // $sectionBackground set, which the config has carried since #1152 — the type was left
    // behind there, so `muted`/`brand` failed to type-check while the API accepted them.
    background?: 'default' | 'light' | 'muted' | 'brand' | 'dark'
    align?: 'default' | 'left' | 'center'
    billing_toggle?: boolean
    plans?: PricingPlan[]
    tabs?: PricingTab[]
    tab_icons?: Array<{ billing_type: string; icon_svg?: string }>
  }
}

export interface ComponentRefBlock {
  type: 'component_ref'
  data: {
    // The referenced Component's own type (footer | cta_default | mainfeatures_global | block),
    // stamped by the API so the renderer can dispatch; its resolved per-locale fields are
    // merged in flat alongside it (shape varies by component_type).
    component_id: number
    component_type?: string
    // A `block` component embeds its own page-builder block array, resolved inline by the API
    // (same {type,id,data} shape as a page's blocks) and rendered through BlockRenderer.
    blocks?: Block[]
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
  /**
   * Resolved featured image (MediaUrls.for shape); a bare string is tolerated for fixtures.
   * Carries the same `srcset` the `_meta` siblings do — it comes from the same serializer.
   */
  thumbnail?:
    | { url?: string; alt?: string | null; width?: number | null; height?: number | null; srcset?: string | null }
    | string
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

// One resolved document in a `documents` block. The API's `files`-field resolver expands each
// stored library-file id into this shape (packages/cms-core PagePayload::resolveFileRecord), so
// the generated DocumentsBlock (below the marker) refers to it by name. Hand-maintained because
// the flat block schema only knows the field is of type `files` — the resolved element shape
// (backed by the App\Models\File record) is not derivable from cms.blocks alone.
export interface DocumentFile {
  id: number
  /** Localized document name (default-locale fallback), or null. Always present (resolver emits it). */
  name: string | null
  /** Localized description (default-locale fallback), or null. Always present. */
  description: string | null
  /** Absolute public URL of the document (PDF), or null when no file is attached. Always present. */
  url: string | null
  /** Document size in bytes, or null when unknown. Always present. */
  size: number | null
}

// One resolved entry in a `documents` block's `document_entries` list. The API resolves each stored
// row (a library-file reference or an external link) into this unified shape (packages/cms-core
// BlockResolver::resolveDocumentEntries), so the generated DocumentsBlock (below the marker) refers
// to it by name. Hand-maintained because the resolved element shape is not derivable from the flat
// block schema alone (same pattern as DocumentFile and the `items` ref types).
export interface DocumentEntry {
  /** Whether this entry is a library file (a download) or an external link. */
  source: 'file' | 'link'
  /** Display name: the row's own, else the library file's; null when neither is set. */
  name: string | null
  /** Optional description, or null. */
  description: string | null
  /** Absolute URL: the library file's document URL (file), or the external URL (link). Null drops the entry. */
  url: string | null
  /** Document size in bytes for a file entry, or null (always null for a link). */
  size: number | null
  /** Optional ISO publish date for this entry, or null. */
  published_at: string | null
}

// What a renderer needs to make one `<img>` responsive. The API attaches this to every resolved
// image as a sibling of the URL field — `<key>_meta` for an in-block `image` field, `src_meta` for
// a `media_upload` one — so a template reads ONE shape whichever world the picture came from, even
// though the two produce their variants by completely different means (Spatie conversions vs.
// generated sibling files). See BlockResolver::imageMeta / MediaUrls::responsiveMeta.
//
// Hand-maintained: these keys are added by the RESOLVER, not declared in the block schema, so the
// generator emits the sibling by name (see gen-block-types.mjs) but cannot derive this shape.
export interface ResponsiveImageMeta {
  /** Intrinsic pixel width of the source, or null when the file could not be measured. */
  width: number | null
  /** Intrinsic pixel height, or null. Pair with `width` on the `<img>` to avoid layout shift. */
  height: number | null
  /**
   * Ready-to-emit `srcset`, or null when there is nothing worth offering — fewer than two
   * candidates, or no variants generated yet. Null means: render a plain `src` and NO `sizes`.
   * A one-candidate srcset would become the browser's only choice.
   */
  srcset: string | null
}

// --- GENERATED BELOW: do not edit, run `pnpm cms:types` ---
export interface RichContentBlock {
  type: 'rich_content'
  data: {
    eyebrow?: string
    heading?: string
    body?: string
    image?: string | null
    image_meta?: ResponsiveImageMeta
    alt?: string
    animation_url?: string
    background?: 'default' | 'light' | 'muted' | 'brand' | 'dark'
    align?: 'default' | 'left' | 'center'
  }
}

export interface ParagraphBlock {
  type: 'paragraph'
  data: { body?: string; variant?: 'default' | 'note' }
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
    background?: 'default' | 'light' | 'muted' | 'brand' | 'dark'
    align?: 'default' | 'left' | 'center'
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
    src_meta?: ResponsiveImageMeta
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
    background?: 'default' | 'light' | 'muted' | 'brand' | 'dark'
    align?: 'default' | 'left' | 'center'
  }
}

export interface DocumentsBlock {
  type: 'documents'
  data: { heading?: string; icon?: 'document' | 'folder' | 'download' | 'info' | 'book'; files?: DocumentEntry[] }
}

export interface CardsBlock {
  type: 'cards'
  data: {
    anchor_id?: string
    eyebrow?: string
    heading?: string
    intro?: string
    layout?: 'tiles' | 'cards' | 'steps'
    background?: 'default' | 'light' | 'muted' | 'brand' | 'dark'
    align?: 'default' | 'left' | 'center'
    items?: Array<{
      icon?: 'location' | 'clock' | 'phone' | 'mail' | 'calendar' | 'info' | 'document' | 'folder' | 'download' | 'book'
      image?: string | null
      image_meta?: ResponsiveImageMeta
      marker?: string
      label?: string
      value?: string
      href?: string
      highlighted?: boolean
    }>
  }
}

export interface GalleryBlock {
  type: 'gallery'
  data: {
    anchor_id?: string
    eyebrow?: string
    heading?: string
    note?: string
    images?: Array<{ image?: string | null; image_meta?: ResponsiveImageMeta; alt?: string }>
  }
}

export interface FaqBlock {
  type: 'faq'
  data: {
    eyebrow?: string
    heading?: string
    intro?: string
    layout?: 'accordion' | 'list'
    open_first?: boolean
    cta_label?: string
    cta_href?: string
    items?: Array<{ question?: string; answer?: string }>
  }
}

export interface TeamBlock {
  type: 'team'
  data: {
    anchor_id?: string
    eyebrow?: string
    heading?: string
    members?: Array<{ name?: string; role?: string; photo?: string | null; photo_meta?: ResponsiveImageMeta }>
  }
}

export interface ImageBlock {
  type: 'image_block'
  data: {
    src?: string | null
    src_meta?: ResponsiveImageMeta
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
    image_meta?: ResponsiveImageMeta
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
  | DocumentsBlock
  | CardsBlock
  | GalleryBlock
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
