import type { Block } from '../types/blocks'

/**
 * The placeholder blocks (dashboard #2335): a position on the page, not content. `page_content`
 * marks where the page's `content` rich text renders; `collection_items` where a collection
 * landing's item list does. Neither carries data — the text stays in `page.content` and the list
 * stays the landing's own — so a page type renders the surface ITSELF, handed to `BlockRenderer`
 * as a named slot of the same name, and the renderer emits it where the placeholder sits among
 * the page's blocks. Blocks above the placeholder render before the surface, blocks below it
 * after: the builder order is the page order.
 *
 * A page with no placeholder renders as it always did — the page type appends the surface where
 * it used to — which is what makes the slot opt-in per page type and safe across a pin bump: a
 * site that passes no slot gets core's no-op renderer for the block (`blocks/PageContent.astro`,
 * `blocks/CollectionItems.astro`) and its current layout.
 */
export const PLACEHOLDER_BLOCK_TYPES = ['page_content', 'collection_items'] as const

export type PlaceholderBlockType = (typeof PLACEHOLDER_BLOCK_TYPES)[number]

export function isPlaceholderType(type: string): type is PlaceholderBlockType {
  return (PLACEHOLDER_BLOCK_TYPES as readonly string[]).includes(type)
}

/**
 * Whether the page's TOP-LEVEL blocks carry a placeholder of `type` — the only level the CMS lets
 * one exist at (the panel offers neither inside a column, a tab or a slide, and the write tools
 * refuse a second). A page type reads this to decide whether to render the surface at its
 * default position (no placeholder) or leave it to the slot.
 */
export function hasPlaceholder(blocks: readonly Block[], type: PlaceholderBlockType): boolean {
  return blocks.some((block) => block.type === type)
}
