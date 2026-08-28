// Numeric comparison between a REFERENCE (the site being replaced, or a static prototype served
// locally) and this build — the complement to `../vrt`, which answers a different question.
//
//   VRT      "WHICH pages differ, and roughly where" — a percentage and a diff PNG.
//   measure  "BY WHAT, exactly" — 600x462 against 800 tall, `gap: 48px` against `12px`, 16/25.6
//            against 18/29.
//
// VRT finds the section; this says what to type. Porting a layout needs both, and doing the second
// by hand is what this replaces: fifteen ad-hoc `getBoundingClientRect` snippets pasted into a
// console over one afternoon, each one measuring a slightly different set of properties, none of
// them written down afterwards.
//
// It is NOT a pass/fail gate by default, for the same reason VRT is not: the new build is a
// rewrite, not a byte-for-byte port, so differences are the normal state and a red suite would
// train everyone to ignore it. A test fails only when the RUN is broken — a non-200 on either
// side, a selector that matches nothing, a missing target list. Pass `MEASURE_STRICT=1` to turn
// surviving differences into failures, which is what a baseline regression run wants.
//
// Artefacts land in the consuming repo's `test-results/measure/` (git-ignored): a `<name>.json`
// with every property read on both sides, and a `<name>-report.txt` with the human table.
import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs'
import path from 'node:path'
import { test, expect } from '@playwright/test'
import { loadTargets, TARGETS_FILE } from './targets.js'
import {
  scrollThroughPage,
  dismissConsent,
  NEW_CONSENT_ROOT,
  NEW_CONSENT_REJECT,
  withTrailingSlash,
} from '../shared/page-prep.js'

// NO DEFAULT, deliberately — the same trap `../vrt` documents: a shared harness carrying one
// client's hostname is how it starts lying on the other six. Unset is only allowed when reading a
// saved baseline, which needs no reference at all.
const OLD_BASE_URL = process.env.OLD_BASE_URL
const NEW_BASE_URL = process.env.NEW_BASE_URL ?? 'http://localhost:4321'

// `--save` (MEASURE_SAVE=1) records the REFERENCE side to `tests/measure.baseline/<name>.json` and
// compares nothing. That file is the point at which this stops depending on the old site being up:
// once saved, `MEASURE_BASELINE=1` compares the build against the recorded numbers, offline and
// after the original is switched off — which, for a site being replaced, is a matter of when.
const SAVE_BASELINE = process.env.MEASURE_SAVE === '1'
const USE_BASELINE = process.env.MEASURE_BASELINE === '1'
const STRICT = process.env.MEASURE_STRICT === '1'

if (!OLD_BASE_URL && !USE_BASELINE) {
  throw new Error(
    '[measure] OLD_BASE_URL is required and has no default — it is the reference this build is ' +
      'compared against. e.g. OLD_BASE_URL=https://example.com pnpm test:measure\n' +
      'Or compare against a saved baseline instead: MEASURE_BASELINE=1 pnpm test:measure',
  )
}

const { targets: ALL_TARGETS, oldDismiss: OLD_DISMISS } = loadTargets()

const VIEWPORT = {
  width: Number(process.env.MEASURE_WIDTH ?? 1440),
  height: Number(process.env.MEASURE_HEIGHT ?? 900),
}

// MEASURE_NAMES=post,home narrows a run while iterating on one layout.
const FILTER = process.env.MEASURE_NAMES?.split(',')
  .map((n) => n.trim())
  .filter(Boolean)
const TARGETS = FILTER?.length ? ALL_TARGETS.filter((t) => FILTER.includes(t.name)) : ALL_TARGETS
if (FILTER?.length && !TARGETS.length) {
  // Otherwise a typo'd filter reports "0 tests" — indistinguishable, at a glance, from a run that
  // had nothing to do.
  throw new Error(
    `[measure] MEASURE_NAMES=${FILTER.join(',')} matched nothing in ${TARGETS_FILE} ` +
      `(names there: ${ALL_TARGETS.map((t) => t.name).join(', ')}).`,
  )
}

// `process.cwd()` is the consuming repo's root, and it has to be: `import.meta.url` resolves inside
// the installed package, so a path relative to this file would write a client's artefacts into
// `node_modules/@rocksoft/cms-starter-core/` — gone on the next install.
const OUT_DIR = path.join(process.cwd(), 'test-results', 'measure')
const BASELINE_DIR = path.join(process.cwd(), 'tests', 'measure.baseline')

// The properties worth reading, chosen from what actually decided a port rather than from what
// `getComputedStyle` happens to expose: every one of these was the answer to a real "why does ours
// look different" at least once. Box geometry first, because it is what catches a layout that is
// the right colour in the wrong place.
//
// Kept as one flat list rather than per-element-type sets: a run prints only what DIFFERS, so an
// irrelevant property costs a line in the JSON and nothing in the report.
const PROPERTIES = [
  // typography
  'fontSize',
  'fontWeight',
  'lineHeight',
  'letterSpacing',
  'fontFamily',
  'color',
  'textAlign',
  'textTransform',
  // box model
  'paddingTop',
  'paddingRight',
  'paddingBottom',
  'paddingLeft',
  'marginTop',
  'marginRight',
  'marginBottom',
  'marginLeft',
  'maxWidth',
  // layout
  'display',
  'gridTemplateColumns',
  'gap',
  'flexDirection',
  'justifyContent',
  'alignItems',
  'position',
  // paint
  'backgroundColor',
  'borderRadius',
  'boxShadow',
  'objectFit',
  'aspectRatio',
]

// Sub-pixel noise is not a finding. Two engines laying out the same 640px column land a hair apart,
// and a report full of `640 vs 640.03` is a report nobody reads twice.
const PX_TOLERANCE = Number(process.env.MEASURE_TOLERANCE ?? 0.5)

/**
 * Reads every listed selector on one page.
 *
 * Returns `null` for a selector that matches nothing rather than throwing, so ONE bad selector
 * reports itself as a finding on that row instead of losing the whole target's measurements.
 */
async function readMetrics(page, selectors, properties) {
  return page.evaluate(
    ({ selectors, properties }) => {
      const round = (n) => Math.round(n * 10) / 10
      const out = {}
      for (const [label, selector] of Object.entries(selectors)) {
        const el = document.querySelector(selector)
        if (!el) {
          out[label] = null
          continue
        }
        const r = el.getBoundingClientRect()
        const cs = getComputedStyle(el)
        const entry = {
          x: round(r.left),
          y: round(r.top + window.scrollY),
          width: round(r.width),
          height: round(r.height),
        }
        for (const p of properties) entry[p] = cs[p]
        out[label] = entry
      }
      return out
    },
    { selectors, properties },
  )
}

const BOX_KEYS = new Set(['x', 'y', 'width', 'height'])

// Which of those decide the "same box?" verdict — and `y` is deliberately NOT among them.
//
// `y` is an absolute document offset: it sums every section above the element, so one extra 64px
// of header padding near the top shifts every selector on the page and every row reports a
// different box. Measured on the first real run: all four selectors of a post flagged, three of
// them purely on `y`, when only one had anything wrong with it.
//
// It stays in the REPORT — "the same element sits 47px lower" is worth seeing, and a wildly
// different `y` is how you notice a section that moved in the order — but it does not by itself
// mean the element is laid out differently. Size and horizontal placement do.
const PARITY_KEYS = new Set(['x', 'width', 'height'])

// Values that differ textually on every run for reasons that are not the layout.
//
// `fontFamily` is the one that matters: a built Astro site serves fingerprinted family names
// (`Montserrat-c5dd63d62401ec53`, plus a `"… fallback: Arial"` alias) where the reference serves
// `Montserrat`. Compared raw, it differs on EVERY selector of EVERY target forever — the fastest
// way to make a report nobody reads. Normalising to the first family, minus the fingerprint, keeps
// the finding that actually matters (a genuinely different typeface) and drops the rest.
const NORMALISERS = {
  fontFamily: (v) =>
    String(v)
      .split(',')[0]
      .trim()
      .replace(/^["']|["']$/g, '')
      .replace(/-[0-9a-f]{8,}$/i, ''),
}

/**
 * Compares one selector's two readings, returning only the properties that differ.
 *
 * @returns {{ rows: Array<{key:string,old:unknown,new:unknown}>, boxMatches: boolean }}
 */
function diffEntry(oldEntry, newEntry) {
  const rows = []
  let boxMatches = true
  for (const key of Object.keys(oldEntry)) {
    const norm = NORMALISERS[key]
    const a = norm ? norm(oldEntry[key]) : oldEntry[key]
    const b = norm ? norm(newEntry[key]) : newEntry[key]
    if (BOX_KEYS.has(key)) {
      if (Math.abs(Number(a) - Number(b)) > PX_TOLERANCE) {
        rows.push({ key, old: a, new: b })
        if (PARITY_KEYS.has(key)) boxMatches = false
      }
    } else if (String(a) !== String(b)) {
      rows.push({ key, old: a, new: b })
    }
  }
  return { rows, boxMatches }
}

function renderReport(name, perSelector) {
  const lines = [`measure: ${name}  (viewport ${VIEWPORT.width}x${VIEWPORT.height}, tolerance ${PX_TOLERANCE}px)`, '']
  let differing = 0
  for (const [label, result] of Object.entries(perSelector)) {
    if (result.missing) {
      lines.push(`  ${label}  —  MISSING on ${result.missing}  (selector: ${result.selector})`)
      lines.push('')
      differing++
      continue
    }
    if (!result.rows.length) {
      lines.push(`  ${label}  ✓  matches`)
      continue
    }
    differing++
    // The box IS the finding; the properties explain it. When the two sides occupy exactly the same
    // rectangle and only the declarations differ, they reached the same result by different routes
    // — ours via `aspect-ratio` where the original relied on the image's intrinsic size, say. That
    // is not something to go and "fix", and saying so here is what stops the next reader chasing
    // it. Anything with a box row is a real difference in what the visitor sees.
    const verdict = result.boxMatches ? '— same size and place, different declarations' : '— DIFFERENT BOX'
    lines.push(`  ${label}  ${verdict}  (${result.selector})`)
    const w = Math.max(...result.rows.map((r) => r.key.length), 10)
    const ow = Math.max(...result.rows.map((r) => String(r.old).length), 9)
    lines.push(`    ${'property'.padEnd(w)}  ${'reference'.padEnd(ow)}  build`)
    for (const r of result.rows) {
      lines.push(`    ${r.key.padEnd(w)}  ${String(r.old).padEnd(ow)}  ${r.new}`)
    }
    lines.push('')
  }
  const boxDiffs = Object.values(perSelector).filter((r) => r.rows?.length && !r.boxMatches).length
  lines.unshift(
    `${differing} of ${Object.keys(perSelector).length} selectors differ` +
      (differing ? `  (${boxDiffs} with a different box — those are the ones that show)` : ''),
    '',
  )
  return lines.join('\n')
}

mkdirSync(OUT_DIR, { recursive: true })
if (SAVE_BASELINE) mkdirSync(BASELINE_DIR, { recursive: true })

for (const target of TARGETS) {
  test(`${target.name}: ${SAVE_BASELINE ? 'record reference metrics' : 'metric diff reference vs build'}`, async ({
    browser,
  }) => {
    const newPage = await browser.newPage({ viewport: VIEWPORT })
    // Reading a saved baseline means there is no reference to open — and opening one anyway would
    // quietly reintroduce the dependency on the old site that the baseline exists to remove.
    const oldPage = USE_BASELINE ? null : await browser.newPage({ viewport: VIEWPORT })

    try {
      const newTarget = withTrailingSlash(NEW_BASE_URL, target.path)
      const oldTarget = oldPage ? `${OLD_BASE_URL}${target.oldPath}` : null

      const [newResponse, oldResponse] = await Promise.all([
        // A baseline-only run still loads the build: that is the side being measured.
        SAVE_BASELINE ? Promise.resolve(null) : newPage.goto(newTarget, { waitUntil: 'networkidle' }),
        oldPage ? oldPage.goto(oldTarget, { waitUntil: 'networkidle' }) : Promise.resolve(null),
      ])

      // Fail loudly on a bad response. Measuring an error page yields perfectly real numbers for
      // Astro's 404, which then read as a layout finding — the one failure mode this must never
      // disguise.
      for (const [label, response, url] of [
        ['reference', oldResponse, oldTarget],
        ['build', newResponse, newTarget],
      ]) {
        if (!response) continue
        const status = response.status()
        if (status !== 200) {
          throw new Error(`[measure] ${target.name}: ${label} returned ${status} for ${url}`)
        }
      }

      await Promise.all(
        [
          oldPage &&
            (async () => {
              await dismissConsent(oldPage, OLD_DISMISS, `${target.name}: reference`, {
                timeout: 8000,
                tool: 'measure',
              })
              await scrollThroughPage(oldPage)
            })(),
          !SAVE_BASELINE &&
            (async () => {
              await dismissConsent(newPage, NEW_CONSENT_REJECT, `${target.name}: build`, {
                timeout: 4000,
                probe: NEW_CONSENT_ROOT,
                tool: 'measure',
              })
              await scrollThroughPage(newPage)
            })(),
        ].filter(Boolean),
      )

      const oldMetrics = oldPage
        ? await readMetrics(oldPage, target.selectors, PROPERTIES)
        : JSON.parse(readFileSync(path.join(BASELINE_DIR, `${target.name}.json`), 'utf8')).metrics

      if (SAVE_BASELINE) {
        const file = path.join(BASELINE_DIR, `${target.name}.json`)
        writeFileSync(
          file,
          `${JSON.stringify(
            {
              _readme: 'Reference metrics recorded by `pnpm test:measure` with MEASURE_SAVE=1. Re-record after the reference changes; compare against it with MEASURE_BASELINE=1.',
              recordedAt: new Date().toISOString(),
              reference: oldTarget,
              viewport: VIEWPORT,
              metrics: oldMetrics,
            },
            null,
            2,
          )}\n`,
        )
        console.log(`[measure] ${target.name}: recorded ${Object.keys(oldMetrics).length} selectors → ${file}`)
        return
      }

      const newMetrics = await readMetrics(newPage, target.selectors, PROPERTIES)

      const perSelector = {}
      for (const [label, selector] of Object.entries(target.selectors)) {
        const a = oldMetrics[label]
        const b = newMetrics[label]
        if (!a || !b) {
          perSelector[label] = { selector, missing: !a && !b ? 'both sides' : !a ? 'the reference' : 'the build' }
          continue
        }
        perSelector[label] = { selector, ...diffEntry(a, b) }
      }

      const report = renderReport(target.name, perSelector)
      writeFileSync(path.join(OUT_DIR, `${target.name}-report.txt`), `${report}\n`)
      writeFileSync(
        path.join(OUT_DIR, `${target.name}.json`),
        `${JSON.stringify({ viewport: VIEWPORT, reference: oldTarget, build: newTarget, old: oldMetrics, new: newMetrics }, null, 2)}\n`,
      )
      console.log(`\n${report}`)

      // A selector matching nothing is a broken run, not a finding: it measures the same as a
      // perfect match (no rows) and would otherwise read as a section that is already correct.
      const missing = Object.entries(perSelector).filter(([, r]) => r.missing)
      expect(
        missing.map(([label, r]) => `${label} (${r.selector}) missing on ${r.missing}`),
        `selectors in ${TARGETS_FILE} must match on both sides`,
      ).toEqual([])

      if (STRICT) {
        const differing = Object.entries(perSelector)
          .filter(([, r]) => r.rows?.length)
          .map(([label]) => label)
        expect(differing, `MEASURE_STRICT=1: these selectors differ from the reference`).toEqual([])
      }
    } finally {
      await Promise.all([newPage.close(), oldPage?.close()].filter(Boolean))
    }
  })
}
