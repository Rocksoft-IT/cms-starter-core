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
//   pnpm parity:audit <build-url> <ref-url> <build-selector> [ref-selector] [--shot DIR] [--viewport WxH] [--viewports W1xH1,W2xH2,...] [--check-overflow]
//
// `--shot` writes build.png and reference.png of the two sections and is the FIRST thing to look
// at, before any table. Numbers can all agree while the thing looks wrong: one portrait reported
// the right class and the right border-radius — a green check — while rendering at a third of its
// size beside the text instead of above it. One screenshot showed it immediately.
//
// `--viewport WxH` overrides the default 1440x900 — REQUIRED for anything breakpoint-shaped
// (container centering, responsive padding steps, an element that only exists below a breakpoint).
// A component measured only at the default width can look correct while being wrong at every other
// one: a navbar's centered column read as edge-to-edge padding at ~1180px, where the missing
// centering margin is near zero, and was visibly wrong at a real 1440px desktop. Run this once per
// breakpoint that has its own rule in the source CSS, not once and done.
//
// `--viewports W1xH1,W2xH2,...` runs the SAME check across every width in the list, in one
// invocation, instead of "once per breakpoint" being something you have to remember to repeat by
// hand. Exists because "one width looked right" is exactly how a real bug shipped (rocksoft#123):
// nine flex children with `min-width: auto` overflowed a 1192px track equally on both edges,
// invisible at the one width tested first and only found by checking several more. `--shot DIR`
// with `--viewports` writes one screenshot pair per width (`build-1440.png`, `build-1920.png`,
// …) instead of overwriting a single `build.png`. Takes priority over `--viewport` when both are
// given.
//
//   pnpm parity:audit http://localhost:4321/ https://example.com/ '.site-footer' '.footer'
//   pnpm parity:audit http://localhost:4321/ https://example.com/ '.navbar' --viewport 991x900
//   pnpm parity:audit http://localhost:4321/ https://example.com/ '.our-story-track' --viewports 1280x900,1440x900,1920x900 --check-overflow
//
// `--check-overflow` flags any element whose rendered box escapes its nearest clipping ancestor
// (`overflow: hidden/clip`, `overflow-x`/`overflow-y: hidden`) within the build's own selector —
// the exact silent-failure shape of the bug above: content that overflows AND gets clipped prints
// nothing to the page, so a screenshot at the wrong width shows a shorter row instead of an
// obvious visual bug. This is the one flag in this script that can make it exit non-zero: everything
// else here is "no baseline, no pass/fail" by design (see the header above), but a clipped
// descendant is unambiguous evidence of a bug, worth a hard fail as an opt-in.
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
const viewportAt = argv.indexOf('--viewport')
const viewportArg = viewportAt > -1 ? argv[viewportAt + 1] : null
const viewportsAt = argv.indexOf('--viewports')
const viewportsArg = viewportsAt > -1 ? argv[viewportsAt + 1] : null
const checkOverflow = argv.includes('--check-overflow')
// `shotAt`/`viewportAt`/`viewportsAt` are -1 when a flag is absent, and `-1 + 1 === 0` — without
// the `> -1` guards below, an absent value-taking flag silently dropped positional arg 0
// (buildUrl) from the filter, shifting every other positional argument left by one. Only ever
// surfaced by a call that omits the flag, which is why it went unnoticed: every prior use of this
// script in practice passed `--shot`. `--check-overflow` takes no value, so it only needs
// excluding at its own index, not `+1`.
const [buildUrl, refUrl, buildSel, refSel] = argv.filter(
  (a, i) =>
    !(shotAt > -1 && (i === shotAt || i === shotAt + 1)) &&
    !(viewportAt > -1 && (i === viewportAt || i === viewportAt + 1)) &&
    !(viewportsAt > -1 && (i === viewportsAt || i === viewportsAt + 1)) &&
    a !== '--check-overflow',
)

if (!buildUrl || !refUrl || !buildSel) {
  console.error(
    'usage: pnpm parity:audit <build-url> <ref-url> <build-selector> [ref-selector] [--shot DIR] ' +
      '[--viewport WxH] [--viewports W1xH1,W2xH2,...] [--check-overflow]\n' +
      "  e.g. pnpm parity:audit http://localhost:4321/ https://example.com/ '.site-footer' '.footer'",
  )
  process.exit(1)
}

function parseViewport(spec) {
  const m = /^(\d+)x(\d+)$/.exec(spec)
  if (!m) return null
  return { width: Number(m[1]), height: Number(m[2]) }
}

// `--viewports` wins over `--viewport` when both are given — the plural form is the "run every
// breakpoint" case §1 step 6 of the webflow-parity skill asks for, and a leftover single
// `--viewport` in the same command line should not silently narrow that back to one.
let viewports
if (viewportsArg) {
  viewports = viewportsArg.split(',').map((spec) => {
    const v = parseViewport(spec.trim())
    if (!v) {
      console.error(`[parity] --viewports entries must look like "1440x900", got "${spec}"`)
      process.exit(1)
    }
    return v
  })
} else if (viewportArg) {
  const v = parseViewport(viewportArg)
  if (!v) {
    console.error(`[parity] --viewport must look like "991x900", got "${viewportArg}"`)
    process.exit(1)
  }
  viewports = [v]
} else {
  viewports = [{ width: 1440, height: 900 }]
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

// `--check-overflow`: finds any element whose rendered box escapes its NEAREST clipping ancestor
// within the selector's own subtree (`overflow`/`overflow-x`/`overflow-y: hidden`, or `clip`).
// Overflow clipped by an ancestor renders NOTHING at the clipped edge — no scrollbar, no visual
// glitch, just content that silently isn't there — which is exactly why rocksoft#123's flexbox
// `min-width: auto` bug survived a screenshot check: the overflow was equal on both edges of a
// `justify-content: center` row, invisible unless you already suspected it.
//
// "Nearest" clipper only, not every clipping ancestor up the tree: an element legitimately
// bigger than its own immediate wrapper but still fully contained by that wrapper's own parent
// is not a bug, and checking every ancestor would report it as one.
const CHECK_OVERFLOW = `(root) => {
  const isClipping = (el) => {
    const cs = getComputedStyle(el)
    return cs.overflow === 'hidden' || cs.overflowX === 'hidden' || cs.overflowY === 'hidden' || cs.overflow === 'clip'
  }
  const nearestClipper = (el) => {
    let node = el.parentElement
    while (node) {
      if (isClipping(node)) return node
      if (node === root) return null
      node = node.parentElement
    }
    return null
  }
  const describe = (el) => {
    const cls = typeof el.className === 'string' && el.className.trim() ? '.' + el.className.trim().split(/\\s+/).join('.') : ''
    return el.tagName.toLowerCase() + cls
  }
  const EPS = 1
  const findings = []
  ;[root, ...root.querySelectorAll('*')].forEach((el) => {
    const clipper = isClipping(el) ? el : nearestClipper(el)
    if (!clipper || clipper === el) return
    const cs = getComputedStyle(el)
    if (cs.display === 'none' || cs.visibility === 'hidden') return
    const rect = el.getBoundingClientRect()
    if (rect.width === 0 && rect.height === 0) return
    const cRect = clipper.getBoundingClientRect()
    const overflowLeft = Math.round(cRect.left - rect.left)
    const overflowRight = Math.round(rect.right - cRect.right)
    const overflowTop = Math.round(cRect.top - rect.top)
    const overflowBottom = Math.round(rect.bottom - cRect.bottom)
    if (overflowLeft > EPS || overflowRight > EPS || overflowTop > EPS || overflowBottom > EPS) {
      findings.push({
        element: describe(el),
        text: (el.textContent || '').replace(/\\s+/g, ' ').trim().slice(0, 40),
        clipper: describe(clipper),
        overflowLeft: overflowLeft > EPS ? overflowLeft : 0,
        overflowRight: overflowRight > EPS ? overflowRight : 0,
        overflowTop: overflowTop > EPS ? overflowTop : 0,
        overflowBottom: overflowBottom > EPS ? overflowBottom : 0,
      })
    }
  })
  return findings
}`

async function walk(browser, url, selector, shotFile, viewport) {
  const page = await browser.newPage({ viewport })
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
    const rows = await page.evaluate(
      ([sel, fn, props]) => {
        const root = document.querySelector(sel)
        if (!root) return null
        return eval('(' + fn + ')')(root, props)
      },
      [selector, READ, PROPS],
    )
    const overflow = checkOverflow
      ? await page.evaluate(
          ([sel, fn]) => {
            const root = document.querySelector(sel)
            if (!root) return []
            return eval('(' + fn + ')')(root)
          },
          [selector, CHECK_OVERFLOW],
        )
      : []
    return { rows, overflow }
  } finally {
    await page.close()
  }
}

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

function printOverflow(findings, viewport) {
  if (!findings.length) {
    console.log(`\n✓ --check-overflow: nothing clipped at ${viewport.width}x${viewport.height}.`)
    return
  }
  console.log(
    `\n✗ --check-overflow: ${findings.length} element(s) overflow their nearest clipping ancestor ` +
      `at ${viewport.width}x${viewport.height} — this is content the page renders NOTHING for, not ` +
      `a cosmetic difference:`,
  )
  for (const f of findings) {
    const by = [
      f.overflowLeft && `${f.overflowLeft}px left`,
      f.overflowRight && `${f.overflowRight}px right`,
      f.overflowTop && `${f.overflowTop}px top`,
      f.overflowBottom && `${f.overflowBottom}px bottom`,
    ]
      .filter(Boolean)
      .join(', ')
    console.log(`  ${f.element} "${f.text}" overflows ${f.clipper} by ${by}`)
  }
}

const browser = await chromium.launch()
let anyOverflow = false

for (const viewport of viewports) {
  const shotSuffix = viewports.length > 1 ? `-${viewport.width}x${viewport.height}` : ''
  const [build, reference] = await Promise.all([
    walk(browser, buildUrl, buildSel, shotDir ? `${shotDir}/build${shotSuffix}.png` : null, viewport),
    walk(browser, refUrl, refSel ?? buildSel, shotDir ? `${shotDir}/reference${shotSuffix}.png` : null, viewport),
  ])

  if (!build.rows) {
    console.error(`[parity] build: "${buildSel}" matched nothing at ${buildUrl} (${viewport.width}x${viewport.height})`)
    process.exitCode = 1
    continue
  }
  if (!reference.rows) {
    console.error(
      `[parity] reference: "${refSel ?? buildSel}" matched nothing at ${refUrl} (${viewport.width}x${viewport.height})`,
    )
    process.exitCode = 1
    continue
  }

  console.log(`\n${'='.repeat(60)}\nviewport   ${viewport.width}x${viewport.height}`)
  console.log(`build      ${buildUrl}  ${buildSel}   → ${build.rows.length} elements`)
  console.log(`reference  ${refUrl}  ${refSel ?? buildSel}   → ${reference.rows.length} elements`)

  table(build.rows, 'BUILD')
  table(reference.rows, 'REFERENCE')

  if (build.rows.length !== reference.rows.length) {
    console.log(
      `\n⚠ ${build.rows.length} elements against ${reference.rows.length} — the trees are shaped ` +
        `differently, so NO positional diff is printed. Read the two tables above; a missing or ` +
        `extra row is itself the finding.\n`,
    )
  } else {
    let differing = 0
    for (let i = 0; i < build.rows.length; i++) {
      const b = build.rows[i]
      const r = reference.rows[i]
      const rows = PROPS.filter((p) => b[p] !== r[p]).map((p) => [p, b[p], r[p]])
      if (!rows.length) continue
      differing++
      console.log(`\n[${i}] <${b.tag}> "${b.text}"   (reference: <${r.tag}> "${r.text}")`)
      console.log(`     ${'property'.padEnd(16)}${'build'.padEnd(30)}reference`)
      for (const [p, x, y] of rows) console.log(`     ${p.padEnd(16)}${String(x).padEnd(30)}${y}`)
    }
    console.log(`\n${differing} of ${build.rows.length} elements differ.\n`)
  }

  if (checkOverflow) {
    printOverflow(build.overflow, viewport)
    if (build.overflow.length) anyOverflow = true
  }
}

await browser.close()

if (checkOverflow && anyOverflow) {
  console.error(`\n[parity] --check-overflow found clipped content at one or more viewports — see ✗ lines above.`)
  process.exitCode = 1
}
