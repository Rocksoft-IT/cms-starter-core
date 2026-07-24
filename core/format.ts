// Shared value formatters for CMS payload fields, kept in core so every renderer (custom
// fields, section landings, project components) formats the same field the same way.

/**
 * A `date` field is a raw ISO string; render it for the page's locale, never verbatim. Parse as
 * UTC (append no time → midnight UTC) and format in UTC so a "2027-01-22" never slips a day in a
 * negative-offset build environment. An unparseable value degrades to the raw string rather than
 * surfacing "Invalid Date"; an absent/empty one yields null (render nothing).
 */
export function formatDate(value: unknown, loc: string): string | null {
  if (typeof value !== 'string' || value.trim() === '') return null
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return value
  return new Intl.DateTimeFormat(loc, { year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC' }).format(d)
}
