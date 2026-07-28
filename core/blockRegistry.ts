import type { Block } from '../types/blocks'
import type { BlockLoader } from './config'

/**
 * The starter core's default block registry: every block type the core ships, mapped to its
 * component. A site spreads this into its own `blocks` map — `blocks: { ...coreBlocks, ...overrides }`
 * — so a NEW core block renders on every site without a per-site edit, while a site can still
 * override a type (re-declare it after the spread) or add its own site-specific blocks.
 *
 * The seam the npm-core epic (#843) formalized: the core is a package now, and a site keeps only
 * its overrides. Paths are relative to this file, so the map travels with the core.
 */
export const coreBlocks: Partial<Record<Block['type'], BlockLoader>> = {
  promo_split: () => import('./blocks/PromoSplit.astro'),
  hero: () => import('./blocks/Hero.astro'),
  rich_content: () => import('./blocks/RichContent.astro'),
  paragraph: () => import('./blocks/Paragraph.astro'),
  cta_banner: () => import('./blocks/CtaBanner.astro'),
  faq: () => import('./blocks/Faq.astro'),
  image_block: () => import('./blocks/ImageBlock.astro'),
  button: () => import('./blocks/Button.astro'),
  button_group: () => import('./blocks/ButtonGroup.astro'),
  heading: () => import('./blocks/Heading.astro'),
  separator: () => import('./blocks/Separator.astro'),
  features: () => import('./blocks/Features.astro'),
  video_section: () => import('./blocks/VideoSection.astro'),
  nav_tiles: () => import('./blocks/NavTiles.astro'),
  custom_html: () => import('./blocks/CustomHtml.astro'),
  quote: () => import('./blocks/Quote.astro'),
  // hours / map / contact — split out of the former combined hours_location; map reuses MapEmbed.astro.
  hours: () => import('./blocks/Hours.astro'),
  map: () => import('./blocks/Map.astro'),
  contact: () => import('./blocks/Contact.astro'),
  team: () => import('./blocks/Team.astro'),
  // Columns (layout container) — nests other blocks per column; ColumnsBlock/ColumnChild are
  // hand-authored in src/types/blocks.ts. Renders a grid, delegating children back to BlockRenderer.
  columns: () => import('./blocks/Columns.astro'),
  tabs: () => import('./blocks/Tabs.astro'),
  pricing_teaser: () => import('./blocks/PricingTeaser.astro'),
  mainfeatures: () => import('./blocks/MainFeatures.astro'),
  highlights: () => import('./blocks/Highlights.astro'),
  // Documents — a titled list of downloadable files from the Files library; the API resolves each
  // file id into { id, name, description, url, size }. DocumentFile is hand-authored in blocks.ts.
  documents: () => import('./blocks/Documents.astro'),
  // Ref blocks — the API resolves the referenced collection/component into the block data; their
  // interfaces are hand-maintained in src/types/blocks.ts above the codegen marker.
  testimonials: () => import('./blocks/Testimonials.astro'),
  pricing_table: () => import('./blocks/PricingTable.astro'),
  component_ref: () => import('./blocks/ComponentRef.astro'),
  section_teaser: () => import('./blocks/SectionTeaser.astro'),
}
