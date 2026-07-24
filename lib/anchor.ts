/**
 * Normalize a CMS `anchor_id` into a usable URL fragment / section id: whitespace collapses
 * to hyphens, empty input yields undefined (no `id` attribute at all). Shared by every block
 * that exposes an anchor (team, pricing_table, …).
 */
export function sectionAnchorId(anchorId?: string | null): string | undefined {
  return anchorId?.trim().replace(/\s+/g, '-') || undefined
}
