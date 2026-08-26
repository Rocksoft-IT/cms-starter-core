// Per-site exemptions from the conformance floor.
//
// This is the part that decides whether a shared suite survives contact with seven sites. A floor
// with no escape hatch fails the first time one site has a legitimate exception — and the response
// to a suite that cannot pass is to switch it off, which costs more than never having shipped it.
// A floor whose escape hatch is easy costs the same, more slowly.
//
// So: exemptions are DECLARATIVE, per site, and every one must carry a `reason`. An entry without
// one is treated, because "someone silenced this and no one knows why" is
// the state this file exists to prevent. Keep them few and keep them dated in the reason; each is
// a piece of the floor that site is choosing not to stand on.
//
// A site opts in by writing `tests/conformance.exemptions.json` in its own repo:
//
//   {
//     "iframeTitle": [
//       { "match": ".video-section iframe",
//         "reason": "core VideoSection emits no title — diligently-dashboard#1791; drop when the pin passes the fix" }
//     ],
//     "border3px": [
//       { "match": "btn-white",
//         "reason": "core sets this border deliberately: the fill goes transparent on hover, so the border keeps the shape" }
//     ]
//   }
//
// No file means no exemptions, which is the state every site should be trying to get back to.
import { readFileSync, existsSync } from 'node:fs'
import path from 'node:path'

let loaded = null

function all() {
  if (loaded) return loaded
  const file = path.join(process.cwd(), 'tests', 'conformance.exemptions.json')
  if (!existsSync(file)) return (loaded = {})

  const raw = JSON.parse(readFileSync(file, 'utf8'))
  const kept = {}
  for (const [check, entries] of Object.entries(raw)) {
    // JSON has no comments, so an `_`-prefixed key is the usual stand-in — and the file wants
    // prose at the top explaining what an exemption costs. Skipped before the reason check, which
    // would otherwise scold the reader for the documentation.
    if (check.startsWith('_')) continue
    const withReason = (entries ?? []).filter((e) => e?.match && e?.reason?.trim())
    const dropped = (entries ?? []).length - withReason.length
    if (dropped > 0) {
      // Loud, and on purpose: silently honouring an unexplained exemption is how a floor rots.
      console.warn(`conformance: ignoring ${dropped} exemption(s) under "${check}" with no \`reason\``)
    }
    if (withReason.length) kept[check] = withReason
  }
  return (loaded = kept)
}

/** The `match` values a site has excused for one check, reasons already validated. */
export function exempt(check) {
  return (all()[check] ?? []).map((e) => e.match)
}

/**
 * One CSS selector excluding every exemption for a check, for the DOM-scoped ones.
 * `iframe` with `.video-section iframe` excused becomes `iframe:not(.video-section iframe)`.
 */
export function selectorExcluding(check, base) {
  const skip = exempt(check)
  return skip.length ? `${base}${skip.map((s) => `:not(${s})`).join('')}` : base
}
