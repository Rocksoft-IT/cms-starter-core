// Section-level breakdown for `compare-old-vs-new.spec.js`.
//
// WHY THIS EXISTS. The whole-page diff below is exact but binary: the instant either side's total
// height differs from the other — which is the NORMAL state for a page being ported section by
// section, not the exception — pixelmatch is skipped entirely (a misaligned diff of everything
// below the first height difference would describe the misalignment, not the page) and the report
// says only "compare the two PNGs directly". That is precisely the case a design port lives in for
// most of its life: one section is still the wrong height while the rest already matches, and the
// whole-page report cannot see past it. A session porting rocksoft's home page hand-rolled this
// exact walk (`document.querySelectorAll('body > *')`, cropped screenshots, one comparison per
// section) because the harness had no answer narrower than "the page differs somewhere" — worth
// keeping in core rather than re-invented per session.
//
// Every core-built page is architecturally `<body><Navbar/><slot/><Footer/>…</body>` (Layout.astro)
// with each CMS block rendering its own top-level `<section>` — so `body > *` on the NEW side
// reliably yields header, one entry per block, footer, in document order. The REFERENCE side's
// markup is whatever the site being replaced authored; `body > *` is still the common case (a
// Webflow export nests a nav + one wrapper per section under body too) but is NOT guaranteed, which
// is why both selectors are overridable per route.
//
// Sections pair by POSITION, not by tag/class/id — the two trees are not expected to agree on
// either. A count mismatch is the finding itself (a section this build dropped or added) and is
// reported loudly rather than papering over it by truncating to the shorter list silently.
import { PNG } from 'pngjs'
import pixelmatch from 'pixelmatch'

/** Elements with zero rendered area (an inline `<script>`/`<noscript>`, a `hidden` banner
 *  container) are not sections — filtered here so they don't inflate the count or shift the
 *  pairing by one for every element after them. */
const MIN_AREA_PX = 1

/**
 * The page's own top-level elements, as document-relative vertical bands.
 *
 * `getBoundingClientRect()` is VIEWPORT-relative; `+ window.scrollY` makes it document-relative,
 * which is what a `fullPage` screenshot's coordinate space is — this must run at whatever scroll
 * position the page is actually at, so callers get true bands regardless of where scrolling left
 * off (`scrollThroughPage` returns to the top, but this does not assume that).
 *
 * @param {import('@playwright/test').Page} page
 * @param {string} selector
 * @returns {Promise<Array<{ top: number, height: number, tag: string, id: string | null, cls: string | null }>>}
 */
export async function sectionBands(page, selector) {
  return page.evaluate(
    ({ selector, minArea }) =>
      Array.from(document.querySelectorAll(selector))
        .map((el) => {
          const r = el.getBoundingClientRect()
          const cs = getComputedStyle(el)
          return {
            top: Math.round(r.top + window.scrollY),
            height: Math.round(r.height),
            tag: el.tagName.toLowerCase(),
            id: el.id || null,
            // A class list identifies the section in the report without needing the full markup —
            // long enough to tell `section-hero` from `section-cards`, short enough that a utility-
            // class-heavy build doesn't dump a paragraph per row.
            cls: typeof el.className === 'string' ? el.className.trim().slice(0, 60) || null : null,
            // NOT whether the box has area — a consent-manager underlay/offscreen-tracking iframe
            // routinely reports a full-viewport or nonzero `getBoundingClientRect()` while
            // contributing nothing to the document's actual layout: `position: fixed` removes an
            // element from normal flow entirely (a real section is static/relative/sticky), and an
            // element pushed off-screen by a large negative offset (the classic a11y/tracking
            // trick, `left: -9999px` or similar) never overlaps the viewport horizontally at all.
            // Both are cheap, general signals — not a Cookiebot-specific check — found while a
            // reference page's own decline-clicked consent banner still injected two extra rows
            // that shifted every real section's pairing by one.
            inFlow: cs.position !== 'fixed' && r.right > 0 && r.left < window.innerWidth,
          }
        })
        .filter((b) => b.height >= minArea && b.inFlow)
        .map(({ inFlow: _inFlow, ...band }) => band),
    { selector, minArea: MIN_AREA_PX },
  )
}

/** One band's short label for the report — its id if it has one (the more stable, more
 *  intentional hook), else its tag + leading class. */
function labelOf(band) {
  if (!band) return '—'
  if (band.id) return `${band.tag}#${band.id}`
  return band.cls ? `${band.tag}.${band.cls.split(/\s+/)[0]}` : band.tag
}

/**
 * Crops a decoded PNG to `[0, top) × [width, top + height)` — the full page width, since a
 * section's OWN bounding box can be narrower than the viewport (a centred content measure inside
 * a full-bleed band) where the band itself is what should line up between build and reference.
 * Clamped to the source's actual height so a band whose reported height overruns the captured
 * page (a race between measuring and screenshotting) still produces a valid, if short, crop
 * instead of reading out of bounds.
 *
 * @param {PNG} png
 * @param {number} top
 * @param {number} height
 */
function cropRows(png, top, height) {
  const clampedTop = Math.max(0, Math.min(top, png.height))
  const clampedHeight = Math.max(0, Math.min(height, png.height - clampedTop))
  const out = new PNG({ width: png.width, height: clampedHeight || 1 })
  if (clampedHeight > 0) {
    PNG.bitblt(png, out, 0, clampedTop, png.width, clampedHeight, 0, 0)
  }
  return out
}

/**
 * One row per paired section: dimensions, a pixel-diff percentage when both bands are the same
 * size, or a plain height delta when they are not (same "skip the pixel diff, still report the
 * gap" rule the whole-page comparison already follows, just at section grain).
 *
 * @param {PNG} oldPng       the reference's full-page screenshot, already decoded
 * @param {PNG} newPng       this build's full-page screenshot, already decoded
 * @param {Array} oldBands   `sectionBands()` output for the reference
 * @param {Array} newBands   `sectionBands()` output for this build
 * @returns {{ rows: Array, oldExtra: Array, newExtra: Array }}
 */
export function compareSections(oldPng, newPng, oldBands, newBands) {
  const pairCount = Math.min(oldBands.length, newBands.length)
  const rows = []

  for (let i = 0; i < pairCount; i++) {
    const oldBand = oldBands[i]
    const newBand = newBands[i]
    const row = {
      index: i,
      oldLabel: labelOf(oldBand),
      newLabel: labelOf(newBand),
      oldHeight: oldBand.height,
      newHeight: newBand.height,
      diffPercent: null,
      diffPixels: null,
      crop: null,
    }

    if (oldBand.height === newBand.height) {
      const oldCrop = cropRows(oldPng, oldBand.top, oldBand.height)
      const newCrop = cropRows(newPng, newBand.top, newBand.height)
      const { width, height } = oldCrop
      const diffPng = new PNG({ width, height })
      const diffPixels = pixelmatch(oldCrop.data, newCrop.data, diffPng.data, width, height, { threshold: 0.1 })
      row.diffPercent = Number(((diffPixels / (width * height || 1)) * 100).toFixed(2))
      row.diffPixels = diffPixels
      row.crop = { old: oldCrop, new: newCrop, diff: diffPng }
    } else {
      // Still worth a crop even unaligned — a side-by-side "this is 200px, that is 940px" image is
      // more useful than the numbers alone, and costs nothing extra since both PNGs are already
      // decoded in memory.
      row.crop = {
        old: cropRows(oldPng, oldBand.top, oldBand.height),
        new: cropRows(newPng, newBand.top, newBand.height),
        diff: null,
      }
    }

    rows.push(row)
  }

  return {
    rows,
    oldExtra: oldBands.slice(pairCount),
    newExtra: newBands.slice(pairCount),
  }
}

/**
 * The section table as the same kind of plain-text report the whole-page comparison writes —
 * read top to bottom, a mismatch is the finding.
 *
 * @param {ReturnType<typeof compareSections>} result
 */
export function formatSectionReport(result) {
  const lines = ['', '── sections (top to bottom) ──']
  result.rows.forEach((row) => {
    const sizes = `ref ${row.oldHeight}px / new ${row.newHeight}px`
    const verdict =
      row.diffPercent === null
        ? 'height differs — pixel diff skipped, see crop'
        : `${row.diffPercent}% pixels differ`
    lines.push(`  [${row.index}] ${row.oldLabel} ↔ ${row.newLabel}  —  ${sizes}  —  ${verdict}`)
  })
  if (result.oldExtra.length || result.newExtra.length) {
    lines.push(
      `  ⚠ section count differs: reference has ${result.oldExtra.length} extra (${result.oldExtra
        .map(labelOf)
        .join(', ')}), new has ${result.newExtra.length} extra (${result.newExtra.map(labelOf).join(', ')})`,
    )
  }
  return lines.join('\n')
}
