/**
 * What a `pricing_table` billing tab is CALLED.
 *
 * The default pair below used to be the only answer, hardcoded in the renderer — and a single
 * pair cannot be right everywhere. The same two billing types read as "One-time / Subscription"
 * on a band pricing products and as "One-time services / Monthly services" on a page pricing the
 * same work by engagement, so whichever pair core hardcodes is wrong on the other, on every
 * build (#1416). The block's `tab_labels` field is the per-table override.
 *
 * Shared rather than inlined for the reason `sectionAnchorId` is: a client site may register its
 * OWN PricingTable component, which replaces core's renderer instead of extending it — that is
 * how four of six anchors stayed dead after point 1's pin bump (diligently.pl#155). An override
 * that calls this resolves labels identically to core, including the blank-row rule, instead of
 * reinventing a subtly different one. `defaults` is a parameter for exactly that case: a site
 * whose own wording differs ("One-time payment") passes its pair and still inherits the order.
 */
/**
 * Mirrors the `billing_type` select's option labels in the backend (`config/cms.php`, the
 * `plan` item field) — verified identical, pair for pair. The mirror is hand-kept, and it
 * degrades rather than breaking: a third billing type added to the backend before a core bump
 * has no entry here, so its button renders the raw enum value and `tab_labels` is the way to
 * name it without waiting for a release.
 */
export const DEFAULT_TAB_LABELS: Record<string, string> = {
  one_time: 'One-time',
  subscription: 'Subscription',
}

export interface TabLabelEntry {
  billing_type: string
  label?: string
}

/**
 * Most specific answer first: this table's own label, then the default pair, then the raw enum
 * value so an unknown billing type still names its button something.
 *
 * `||` and not `??` throughout: a repeater row saved with a billing_type but a blank label must
 * fall through. Nullish coalescing would accept `''` and render a nameless button — the one
 * outcome worse than the wrong name.
 */
export function tabLabel(
  billingType: string,
  tabLabels?: TabLabelEntry[] | null,
  defaults: Record<string, string> = DEFAULT_TAB_LABELS,
): string {
  const own = tabLabels?.find((entry) => entry.billing_type === billingType)?.label

  return own || defaults[billingType] || billingType
}
