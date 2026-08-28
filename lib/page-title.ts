import type { Block } from '../types/blocks'

/*
 * Does the page's own body already carry its `<h1>`?
 *
 * IN THE CORE PACKAGE, not in a site's `src/lib/`, and that move is the point (dashboard#1838).
 * The rule is a fact about CORE'S OWN BLOCKS — which of them can put an `<h1>` on the page, and
 * which slot keys they nest others under — so every site was keeping its own copy of an answer it
 * does not own. A copy is only correct until core ships a block, and then it is wrong everywhere
 * at once, silently: the layout adds its `<h1 class="sr-only">` on top of the authored headline,
 * the page builds, nothing looks amiss, and the page name outranks the headline for assistive tech
 * and search. `columns` cost client 22 exactly that; `slides` would have cost it to every client
 * that put a hero in a carousel, one repo at a time.
 *
 * Here it travels with the pin instead, like the blocks it describes.
 */

/**
 * The slot keys a layout block nests other blocks under: `columns` (the `columns` block and
 * `hero`'s optional multi-column area), `tabs` (panels) and `slides` (a carousel's panels, which
 * is where a rotating hero's headline lives — dashboard#1838). All three hold an array of objects
 * with their own `blocks` array, which is the only shape this needs to know.
 *
 * A key missing here is not a crash but a SECOND `<h1>`: the layout supplies its own when it
 * believes the body has none, and the page then carries the layout's page name outranking the
 * authored headline. That is what `columns` cost client 22 before it was added.
 */
const NESTING_KEYS = ['columns', 'tabs', 'slides'] as const

/**
 * The blocks one level inside `block`'s layout slots.
 *
 * Exported: a site's own title-fallback chain (`firstBlockHeading()` in the site's
 * `lib/page-title.ts`) walks the SAME slots looking for a headline rather than an `<h1>`, and must
 * see `slides` too — a carousel-slide hero's heading is a legitimate page-title fallback exactly as
 * much as a `columns`-nested one is. One list of nesting keys, read by both questions.
 *
 * Written defensively — this runs over API data, and a malformed slot must not throw during a
 * build.
 */
export function nestedBlocks(block: Block): Block[] {
  return NESTING_KEYS.flatMap((key) => {
    const slots = (block.data as Record<string, unknown>)[key]
    if (!Array.isArray(slots)) return []

    return slots.flatMap((slot) => {
      const blocks = (slot as { blocks?: unknown } | null)?.blocks
      return Array.isArray(blocks) ? (blocks as Block[]) : []
    })
  })
}

/**
 * Does this one block put an `<h1>` into the document?
 *
 * Two block types can:
 *
 * - `hero` renders its heading as RICH TEXT (`Hero.astro` -> `RichText` -> `div.heading-h1`), so
 *   whatever markup the editor saved reaches the page intact, and `sanitize()` keeps `h1`-`h6`.
 *   Its heading is only an `<h1>` when the editor actually wrote one.
 * - `heading` renders the authored level AS the element (`Heading.astro` -> `<Tag>`), and `h1` is
 *   one of the four levels its schema offers. No markup is involved: the level IS the answer.
 *
 * Every other block renders its heading as text inside an element core chooses (`SectionHeader`
 * emits `h2`), so markup in those fields is escaped rather than honoured, and none of them can
 * ever contribute an `<h1>`.
 */
function rendersH1(block: Block): boolean {
  if (block.type === 'hero') {
    return /<h1[\s/>]/i.test(String((block.data as { heading?: unknown }).heading ?? ''))
  }

  return block.type === 'heading' && (block.data as { level?: unknown }).level === 'h1'
}

/**
 * Does this page's own blocks already put a real `<h1>` into the document?
 *
 * Layout supplies the page's `<h1>` when nothing else does; this is how a page type answers
 * "something in my body already did". Get it wrong and the page carries two `<h1>`s with
 * different text, the layout's page name outranking the authored headline for assistive tech
 * and search.
 *
 * Nested blocks count, which is the case this missed before: a two-column hero is authored as a
 * `columns` block holding a `heading` (level `h1`), a `paragraph` and a `button`, because `hero`'s
 * own multi-column branch renders no CTAs. That put the headline one level down where this only
 * looked at the top level, so client 22's home page shipped both its real headline and the
 * layout's `<h1 class="sr-only">Home</h1>`.
 */
export function blocksCarryHeading(blocks: Block[]): boolean {
  // Recursive, not one level: ADR-0003 lifted the depth-1 limit this used to assume, and a
  // carousel makes the deep case ordinary — a rotating hero is `carousel → slide → hero`, and that
  // hero may compose its own `columns` a level below again. The tree is bounded at cap 2 by the
  // backend, so this terminates on the data rather than on a counter.
  return blocks.some((block) => rendersH1(block) || blocksCarryHeading(nestedBlocks(block)))
}
