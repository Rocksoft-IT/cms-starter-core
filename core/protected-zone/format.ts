// Value formatters for a protected-zone document row. They run in the BROWSER — the list is
// fetched after sign-in, so nothing here can be done at build time — and they are pure, so vitest
// pins them and a site override formats exactly as the core renderer does.
import { formatDate } from '../format'

const UNITS = ['B', 'KB', 'MB', 'GB'] as const
// Between the number and its unit, so a narrow row never wraps "1,2" away from "MB". Spelled as a
// code point because the character itself is invisible in source.
const NBSP = String.fromCharCode(0xa0)

/**
 * A byte count for people: `1,2 MB` in Polish, `1.2 MB` in English — binary multiples, one
 * decimal from MB up, whole numbers below (a "12,4 KB" is precision nobody reads). Null for
 * anything that is not a non-negative finite number, so a missing size renders no element at all.
 */
export function formatBytes(bytes: unknown, locale: string): string | null {
  if (typeof bytes !== 'number' || !Number.isFinite(bytes) || bytes < 0) return null

  let value = bytes
  let unit = 0
  while (value >= 1024 && unit < UNITS.length - 1) {
    value /= 1024
    unit++
  }

  const digits = unit >= 2 ? 1 : 0
  const number = new Intl.NumberFormat(locale, { maximumFractionDigits: digits, minimumFractionDigits: 0 }).format(
    value,
  )

  return `${number}${NBSP}${UNITS[unit]}`
}

/**
 * A document's date in the page's language — `15 lutego 2024` / `February 15, 2024`.
 *
 * Delegates to core's own `formatDate` rather than restating it, so a zone row and a `documents`
 * block row on the same site cannot disagree on the style (long month, UTC, so a date-only value
 * never slips a day west of Greenwich). Null for an absent value; an unparseable one comes back
 * verbatim, as it does everywhere else in core.
 */
export function formatDocDate(iso: unknown, locale: string): string | null {
  return formatDate(iso, locale)
}

/**
 * A short type badge — `PDF` — from the file name's extension, else the MIME subtype.
 *
 * The extension first because it is what the visitor will see in their downloads folder; the MIME
 * type is what the server checked, and the fallback when the stored name has no extension. Null
 * when neither says anything a badge could carry (no extension, no or a vendor-tree subtype).
 */
export function typeLabel(fileName: unknown, mime: unknown): string | null {
  if (typeof fileName === 'string') {
    const ext = /\.([a-z0-9]{1,5})$/i.exec(fileName.trim())
    if (ext) return ext[1].toUpperCase()
  }

  if (typeof mime === 'string') {
    const subtype = /^[a-z]+\/([a-z0-9]{1,10})(?:[;+\s]|$)/i.exec(mime.trim())
    if (subtype) return subtype[1].toUpperCase()
  }

  return null
}
