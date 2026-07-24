// Column-track sizing for nesting blocks (`columns`, `hero`) — the single home of the
// width-token/layout-share rules, so the two renderers can't drift.
//
// A layout preset token ("2-1", "1-1-1", …) encodes per-slot shares as its dash-separated
// numbers. Each resolved column ALSO carries a `width` token ("2/3") whose numerator is the
// same share — the live API always materializes it from the layout per request (BlockResolver
// iterates ColumnLayouts::widths(); ADR-0001 presets, fractions guaranteed to add up). `width`
// is authoritative; the layout share is a fallback for hand-authored payloads (fixtures, mock
// builds) and resolver regressions — never a live-API case.

/** The per-slot shares of a layout preset token: "2-1" -> [2, 1]. Unknown/missing -> [NaN]s/[]. */
export const parseLayoutShares = (layout: string | undefined): number[] =>
  (layout ?? '').split('-').map((n) => parseInt(n, 10))

/**
 * A column's track share: the `width` numerator when present, else the layout share of the
 * column's `slot`, else 1 — first positive number wins (NaN/0 fall through; a non-positive
 * result clamps to 1, so a malformed payload can never emit a zero/negative track).
 */
export const shareAt = (width: string | undefined, shares: number[], slot: number): number => {
  const share = parseInt(width ?? '', 10) || shares[slot] || 1
  return share > 0 ? share : 1
}
