import { describe, it, expect } from 'vitest'
import { tabLabel, DEFAULT_TAB_LABELS } from '../lib/tab-label'

// `tab_labels` exists because core's default pair cannot be right on every site: the same two
// billing types read as "One-time / Subscription" on a product-priced band and as "One-time
// services / Monthly services" where the same work is priced by engagement (#1416). The helper is
// shared so a client override that replaces this renderer resolves labels identically instead of
// reinventing the precedence — the failure mode point 1 of that issue hit (diligently.pl#155).
describe('tabLabel()', () => {
  it("prefers the table's own label over the default pair", () => {
    const labels = [
      { billing_type: 'one_time', label: 'One-time services' },
      { billing_type: 'subscription', label: 'Monthly services' },
    ]

    expect(tabLabel('one_time', labels)).toBe('One-time services')
    expect(tabLabel('subscription', labels)).toBe('Monthly services')
  })

  // The additive half of the contract: every table authored before this field existed must
  // render byte-identically, so absent/empty input has to reach the default pair untouched.
  it('falls back to the default pair when no label is given', () => {
    expect(tabLabel('one_time')).toBe('One-time')
    expect(tabLabel('subscription', undefined)).toBe('Subscription')
    expect(tabLabel('one_time', null)).toBe('One-time')
    expect(tabLabel('subscription', [])).toBe('Subscription')
  })

  // A row for a DIFFERENT billing type must not leak onto this one — the whole point of keying
  // by billing_type rather than by position, exactly as tab_icons does.
  it('ignores rows keyed to another billing type', () => {
    expect(tabLabel('one_time', [{ billing_type: 'subscription', label: 'Monthly services' }])).toBe('One-time')
  })

  // The blank-row rule, and the reason the helper uses `||` rather than `??`: a repeater row
  // saved with a billing_type but no label is half-filled input, not an instruction to render a
  // nameless button. Nullish coalescing would accept '' and produce exactly that.
  it('falls back when the row exists but its label is blank or missing', () => {
    expect(tabLabel('one_time', [{ billing_type: 'one_time', label: '' }])).toBe('One-time')
    expect(tabLabel('one_time', [{ billing_type: 'one_time' }])).toBe('One-time')
  })

  // An unknown billing type still has to name its button something: a value the frontend does not
  // know (an enum option added to config/cms.php before a core bump) renders raw rather than
  // rendering blank.
  it('falls back to the raw billing type when nothing else matches', () => {
    expect(tabLabel('annual')).toBe('annual')
    expect(tabLabel('annual', [{ billing_type: 'annual', label: 'Yearly' }])).toBe('Yearly')
  })

  // A site whose own wording differs passes its pair and still inherits the precedence order —
  // the seam that lets a client override share this helper instead of forking it.
  it('accepts a caller-supplied default pair', () => {
    const clientDefaults = { one_time: 'One-time payment', subscription: 'Subscription' }

    expect(tabLabel('one_time', undefined, clientDefaults)).toBe('One-time payment')
    expect(tabLabel('one_time', [{ billing_type: 'one_time', label: 'Jednorazowo' }], clientDefaults)).toBe(
      'Jednorazowo',
    )
  })

  it('exports the default pair it falls back to', () => {
    expect(DEFAULT_TAB_LABELS).toEqual({ one_time: 'One-time', subscription: 'Subscription' })
  })
})
