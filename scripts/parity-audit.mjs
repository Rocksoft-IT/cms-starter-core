#!/usr/bin/env node
// Walks ONE section on the build and the same section on the reference, element by element, and
// prints every property that differs. The point is the WALK: `tests/measure/` compares a hand-named
// list of ~15 selectors per page, so anything nobody thought to name is invisible to it — and one
// client's site kept shipping wrong type in exactly those gaps (a footer's six rows, a portrait
// quote, an eyebrow's small-caps, a lead form's whole stylesheet). Every one was found by dumping a
// section wholesale and reading the two columns side by side; this is that, committed rather than
// retyped into a throwaway snippet each time.
//
// USE IT WITH `parity-source.mjs`, which reads the section out of the SOURCE — its authored units,
// the rules that do not apply at this breakpoint, and the interactions that have not run. That one
// answers "what is it"; this one answers "is it right yet". Reaching for this one first is how a
// port ends up full of values that are correct at exactly one viewport.
//
// NOT a replacement for tests/measure either — that has a recorded baseline and can fail a build.
// This is the exploratory half: no baseline, no pass/fail, run it BEFORE deciding what to change
// and again after, on the ELEMENT rather than on the diff. The regression that prompted writing it
// happened because the check after a change looked at what the change touched instead of at what it
// broke.
//
//   pnpm parity:audit <build-url> <ref-url> <build-selector> [ref-selector] [--shot DIR]
//
// `--shot` writes build.png and reference.png of the two sections and is the FIRST thing to look
// at, before any table. Numbers can all agree while the thing looks wrong: one portrait reported
// the right class and the right border-radius — a green check — while rendering at a third of its
// size beside the text instead of above it. One screenshot showed it immediately.
//
//   pnpm parity:audit http://localhost:4321/ https://example.com/ '.site-footer' '.footer'
//
// Prints BOTH walks in full, side by side, and only then a positional diff — and the order matters.
// Positional pairing assumes the two trees have the same shape, which is exactly what a CMS block
// and a Webflow section do NOT have: our `<label>` wraps its input (so it is not a leaf) where the
// export's is a sibling, and our card IS the form where the export's card WRAPS it. Paired blindly
// that produces confident nonsense — a button compared against a label. So the two tables are the
// product here, the diff is a convenience when the shapes happen to line up, and a count mismatch
// is printed loudly rather than papered over.
//
// Pick roots that are the SAME THING on both sides. A block's own wrapper against the reference's
// `form` is wrong when ours is the card and theirs is the form inside one — the reference's card is
// the counterpart, and comparing the wrong pair produces a page of differences that mean nothing.
import { chromium } from '@playwright/test'

const argv = process.argv.slice(2)
const shotAt = argv.indexOf('--shot')
const shotDir = shotAt > -1 ? argv[shotAt + 1] : null
const [buildUrl, refUrl, buildSel, refSel] = argv.filter((a, i) => i !== shotAt && i !== shotAt + 1)

if (!buildUrl || !refUrl || !buildSel) {
  console.error(
    'usage: pnpm parity:audit <build-url> <ref-url> <build-selector> [ref-selector] [--shot DIR]\n' +
      "  e.g. pnpm parity:audit http://localhost:4321/ https://example.com/ '.site-footer' '.footer'",
  )
  process.exit(1)
}

// The properties worth reading. Deliberately the same shape as tests/measure's list — box first,
// then type — so a finding here can be pasted into an issue table without re-measuring.
const PROPS = [
  'width',
  'height',
  'display',
  'fontSize',
  'fontWeight',
  'fontStyle',
  'lineHeight',
  'letterSpacing',
  'textTransform',
  'color',
  'backgroundColor',
  'borderRadius',
  'border',
  'padding',
  'margin',
  'objectFit',
]

const READ = `(root, props) => {
  const out = []
  const one = (el) => {
    const c = getComputedStyle(el)
    const q = el.getBoundingClientRect()
    const o = { tag: el.tagName.toLowerCase(), text: (el.textContent || '').replace(/\\s+/g, ' ').trim().slice(0, 24) }
    for (const p of props) o[p] = p === 'width' || p === 'height' ? String(Math.round(q[p])) : c[p]
    return o
  }
  out.push(one(root))
  // Leaves that carry text, plus every image — the two things a reader actually sees. A wrapper
  // with children is skipped: its own box is the sum of theirs and reports nothing of its own.
  root.querySelectorAll('*').forEach((el) => {
    if (el.tagName === 'IMG' || (el.children.length === 0 && el.textContent.trim())) out.push(one(el))
  })
  return out
}`

async function walk(browser, url, selector, shotFile) {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
  try {
    await page.goto(url, { waitUntil: 'load', timeout: 60_000 })
    await page.waitForTimeout(2000)
    // Fonts AND lazy images: an unscrolled page reports height 0 for anything below the fold, which
    // reads as a layout bug that is not there — the same trap tests/measure's page-prep handles.
    await page.evaluate(() => document.fonts.ready)
    await page.evaluate(async () => {
      for (let y = 0; y < document.body.scrollHeight; y += 500) {
        window.scrollTo(0, y)
        await new Promise((r) => setTimeout(r, 40))
      }
      window.scrollTo(0, 0)
    })
    if (shotFile) {
      const el = await page.$(selector)
      if (el) {
        await el.scrollIntoViewIfNeeded()
        await page.waitForTimeout(500)
        await el.screenshot({ path: shotFile })
        console.log(`[parity] wrote ${shotFile}`)
      }
    }
    return await page.evaluate(
      ([sel, fn, props]) => {
        const root = document.querySelector(sel)
        if (!root) return null
        return eval('(' + fn + ')')(root, props)
      },
      [selector, READ, PROPS],
    )
  } finally {
    await page.close()
  }
}

const browser = await chromium.launch()
const [build, reference] = await Promise.all([
  walk(browser, buildUrl, buildSel, shotDir ? `${shotDir}/build.png` : null),
  walk(browser, refUrl, refSel ?? buildSel, shotDir ? `${shotDir}/reference.png` : null),
])
await browser.close()

if (!build) {
  console.error(`[parity] build: "${buildSel}" matched nothing at ${buildUrl}`)
  process.exit(1)
}
if (!reference) {
  console.error(`[parity] reference: "${refSel ?? buildSel}" matched nothing at ${refUrl}`)
  process.exit(1)
}

console.log(`\nbuild      ${buildUrl}  ${buildSel}   → ${build.length} elements`)
console.log(`reference  ${refUrl}  ${refSel ?? buildSel}   → ${reference.length} elements`)

const table = (rows, label) => {
  console.log(`
──── ${label} ────`)
  console.log('  #  ' + 'element'.padEnd(26) + 'w×h'.padEnd(12) + 'font'.padEnd(22) + 'color'.padEnd(22) + 'background')
  rows.forEach((e, i) => {
    const el = `<${e.tag}> ${e.text}`.slice(0, 25)
    const box = `${e.width}×${e.height}`
    const font = `${e.fontSize}/${e.fontWeight}${e.fontStyle === 'italic' ? ' ital' : ''}${
      e.textTransform !== 'none' ? ' ' + e.textTransform : ''
    }`
    console.log(
      '  ' +
        String(i).padEnd(3) +
        el.padEnd(26) +
        box.padEnd(12) +
        font.padEnd(22) +
        e.color.padEnd(22) +
        e.backgroundColor,
    )
  })
}

table(build, 'BUILD')
table(reference, 'REFERENCE')

if (build.length !== reference.length) {
  console.log(
    `
⚠ ${build.length} elements against ${reference.length} — the trees are shaped differently, so ` +
      `NO positional diff is printed. Read the two tables above; a missing or extra row is itself ` +
      `the finding.
`,
  )
  process.exit(0)
}

let differing = 0

for (let i = 0; i < build.length; i++) {
  const b = build[i]
  const r = reference[i]
  const rows = PROPS.filter((p) => b[p] !== r[p]).map((p) => [p, b[p], r[p]])
  if (!rows.length) continue
  differing++
  console.log(`
[${i}] <${b.tag}> "${b.text}"   (reference: <${r.tag}> "${r.text}")`)
  console.log(`     ${'property'.padEnd(16)}${'build'.padEnd(30)}reference`)
  for (const [p, x, y] of rows) console.log(`     ${p.padEnd(16)}${String(x).padEnd(30)}${y}`)
}

console.log(`
${differing} of ${build.length} elements differ.
`)
