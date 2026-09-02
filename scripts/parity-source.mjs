#!/usr/bin/env node
// Reads a section out of the SITE BEING REPLACED — its markup, the CSS rules that own it, and (for
// a Webflow export) the IX2 interactions that move it — and prints the values a port should be
// written from.
//
// Works on any static source: a Webflow export, a hand-built HTML/CSS prototype, a `wget` mirror.
// The DOM and rule halves need nothing but a directory with an index.html; the motion half needs
// Webflow's IX2 data and simply says so when there is none.
//
// WHY THIS EXISTS. `parity-audit.mjs` beside this file walks the built page next to the live
// reference and reports where they differ. That is the right tool for "is it right yet" and the
// wrong one for "what is it", because a rendered page structurally cannot report three things.
// Every example below is from one client's port, where each was guessed at instead:
//
//   A UNIT. A card's right offset is authored `inset: 0 8vw 0 auto`. At 1440 it measures 115.2px,
//   and 115.2px is what four measuring passes wrote into the stylesheet — correct at exactly one
//   width. A measurement returns a used value; only the source has the authored one.
//
//   A RULE THAT DOES NOT APPLY. That card also declares `min-height: 520px` — inside a media query
//   for another breakpoint. Read out of the file it looks like the card's height; read off the page
//   it computes to `auto`. Neither reading alone is safe: you need both side by side, which is what
//   the property table below prints, with the non-matching one marked ✗.
//
//   AN INTERACTION THAT HAS NOT RUN. A pointer-driven card magnet, a tab timer, a scroll parallax
//   and a text reveal are all IX2 action lists. On a page nobody has scrolled or hovered they
//   compute to `none`, so all four were reconstructed by eye: the magnet at an eighth of its real
//   throw, the parallax with two of four images drifting the wrong way, the reveal missing the
//   stagger that is its whole character. The action lists are data in the export's own JS.
//
// USAGE
//   pnpm parity:source '<selector>' [--page /path/] [--source DIR] [--motion] [--depth N]
//
//   pnpm parity:source '.empower_component' --motion
//   pnpm parity:source '.parallax-section' --motion-only
//   pnpm parity:source '.empower_card' --page /referanser/
//
// The source root comes from --source, or $PARITY_SOURCE, or ./reference-site. It is not committed
// (thousands of files, most of them images), so the path is configuration, not a default worth
// guessing at.
//
// Read the output in that order — DOM, then rules, then motion — and write the mapping down ONCE
// before touching any CSS. The `webflow-parity` skill asks for that for a reason: re-deriving it
// per rule is what left three dead generations of one section in a client's stylesheet, each
// overriding the next, so every answer to "still wrong" was "the new rule is right, something I
// left above it wins".
import fs from 'node:fs'
import http from 'node:http'
import path from 'node:path'
import { chromium } from '@playwright/test'

// ── arguments ────────────────────────────────────────────────────────────────────────────────
const argv = process.argv.slice(2)
const flag = (name, fallback = null) => {
  const i = argv.indexOf(name)
  return i > -1 ? argv[i + 1] : fallback
}
const has = (name) => argv.includes(name)

const motionOnly = has('--motion-only')
const withMotion = motionOnly || has('--motion')
const pagePath = flag('--page', '/')
const depth = Number(flag('--depth', '4'))
// `--export` and WEBFLOW_EXPORT still work: the tool started Webflow-only and the name is in the
// commit history and in people's shells.
const exportDir = path.resolve(
  flag('--source', flag('--export', process.env.PARITY_SOURCE ?? process.env.WEBFLOW_EXPORT ?? 'reference-site')),
)

// Flags that take a value swallow the token after them, so the bare selector is the first argument
// that is neither a flag nor a flag's value.
const VALUE_FLAGS = new Set(['--page', '--depth', '--source', '--export'])
const selector = argv.find((a, i) => !a.startsWith('--') && !VALUE_FLAGS.has(argv[i - 1]))

if (!selector) {
  console.error(
    "usage: pnpm parity:source '<selector>' [--page /path/] [--source DIR] [--motion] [--depth N]\n" +
      "  e.g. pnpm parity:source '.empower_component' --motion",
  )
  process.exit(1)
}

if (!fs.existsSync(exportDir)) {
  console.error(
    `[parity-source] nothing at ${exportDir}\n` +
      '  Point --source at the unpacked export or static prototype, or set PARITY_SOURCE.',
  )
  process.exit(1)
}

// `--page /tjenester/` → <source>/tjenester/index.html.
//
// Git Bash on Windows rewrites any POSIX-looking argument into a Windows path before the process
// sees it: `/tjenester/` arrives as `C:/Program Files/Git/tjenester/` and `/` as the install root.
// Undo that here. Without it `--page /tjenester/` quietly read the HOME page — a tool built to stop
// people transcribing the wrong numbers, handing them the wrong page.
const requested = pagePath.replace(/^[A-Za-z]:[\\/].*?[\\/]Git[\\/]/i, '').replace(/^\/+/, '')
const homeFile = path.join(exportDir, 'index.html')
const pageFile = path.join(exportDir, requested, 'index.html')
const fellBack = !fs.existsSync(pageFile)
const indexFile = fellBack ? homeFile : pageFile

if (!fs.existsSync(indexFile)) {
  console.error(`[parity-source] no page at ${pageFile}`)
  process.exit(1)
}

// ── IX2: the interactions, decoded from the export's own data ────────────────────────────────
// The chunk is minified JS, but the two structures we want are plain object literals — `!0`, `!1`
// and hex numbers included — so they evaluate rather than needing to be scraped. Regex-scraping
// this was how an earlier pass concluded the Om oss photos had no scroll animation at all: the
// pattern matched `a-17`, whose targets are absent from that page, and missed `a-3`, which is the
// one that drives them.
function readIx2() {
  const jsDir = path.join(exportDir, 'js')
  if (!fs.existsSync(jsDir)) return null

  for (const name of fs.readdirSync(jsDir)) {
    if (!name.endsWith('.js')) continue
    const text = fs.readFileSync(path.join(jsDir, name), 'utf8')
    if (!text.includes('eventTypeId')) continue

    const balanced = (from) => {
      let d = 0
      for (let i = from; i < text.length; i++) {
        if (text[i] === '{') d++
        else if (text[i] === '}' && --d === 0) return text.slice(from, i + 1)
      }
      return null
    }
    const grab = (key) => {
      const at = text.indexOf(key)
      if (at < 0) return {}
      try {
        return new Function('return ' + balanced(at + key.length - 1))()
      } catch {
        return {}
      }
    }

    const events = grab('events:{')
    const actionLists = grab('actionLists:{')
    if (Object.keys(events).length) return { file: name, events, actionLists }
  }
  return null
}

// A Webflow COMBO class is authored as two classes and exported as one hyphenated name: IX2 stores
// `.parallax-section.kontakt` for what the DOM calls `parallax-section-kontakt`. Without this an
// interaction looks like it targets something that is not on the page — which is exactly the wrong
// conclusion to reach about a section you are trying to reproduce.
const selectorVariants = (sel) => {
  const out = [sel]
  const parts = sel.split('.').filter(Boolean)
  if (parts.length > 1) out.push('.' + parts.join('-'))
  return out
}

const UNITLESS = new Set(['', 'PX', 'DEG', 'none', undefined, null])
const unit = (u) => (UNITLESS.has(u) ? (u === 'DEG' ? 'deg' : 'px') : u)

// Never drop an action item we do not recognise: print its config instead. A silently skipped one
// is a piece of the design that disappears without anybody noticing it was there.
function describeAction(item) {
  const c = item.config ?? {}
  const bits = []
  const n = (v, u) => (v === undefined ? null : `${v}${unit(u)}`)

  switch (item.actionTypeId) {
    case 'TRANSFORM_MOVE': {
      const x = n(c.xValue, c.xUnit)
      const y = n(c.yValue, c.yUnit)
      const z = n(c.zValue, c.zUnit)
      if (x !== null) bits.push(`translateX ${x}`)
      if (y !== null) bits.push(`translateY ${y}`)
      if (z !== null) bits.push(`translateZ ${z}`)
      break
    }
    case 'TRANSFORM_ROTATE':
      if (c.zValue !== undefined) bits.push(`rotate ${c.zValue}deg`)
      if (c.xValue !== undefined) bits.push(`rotateX ${c.xValue}deg`)
      if (c.yValue !== undefined) bits.push(`rotateY ${c.yValue}deg`)
      break
    case 'TRANSFORM_SCALE':
      bits.push(`scale ${c.xValue ?? 1}, ${c.yValue ?? 1}`)
      break
    case 'STYLE_OPACITY':
      bits.push(`opacity ${c.value}`)
      break
    case 'STYLE_SIZE':
      if (c.widthValue !== undefined) bits.push(`width ${c.widthValue}${unit(c.widthUnit)}`)
      if (c.heightValue !== undefined) bits.push(`height ${c.heightValue}${unit(c.heightUnit)}`)
      break
    case 'STYLE_TEXT_COLOR':
    case 'STYLE_BACKGROUND_COLOR':
    case 'STYLE_BORDER_COLOR': {
      const rgba = `rgba(${c.rValue}, ${c.gValue}, ${c.bValue}, ${c.aValue})`
      const prop = item.actionTypeId === 'STYLE_TEXT_COLOR' ? 'color' : 'background'
      // A swatch id means the value is a design token; its absence means the colour was picked by
      // hand for this animation and exists nowhere else in the stylesheet.
      bits.push(`${prop} ${rgba}${c.globalSwatchId ? ` (token ${c.globalSwatchId.split('--').pop()})` : ' (literal)'}`)
      break
    }
    default:
      bits.push(JSON.stringify(c).slice(0, 160))
  }

  const timing = [c.duration ? `${c.duration}ms` : null, c.easing || null, c.delay ? `delay ${c.delay}ms` : null]
    .filter(Boolean)
    .join(' ')

  return {
    target: c.target?.selector ?? c.target?.id?.split('|').pop() ?? '(event target)',
    text: bits.join('  '),
    timing,
  }
}

function printMotion(ix2, classes, wIds) {
  console.log(`\n${'═'.repeat(96)}\nMOTION — IX2 interactions touching this subtree   (${ix2.file})\n`)

  const wanted = new Set(classes)
  const matchesSubtree = (sel) =>
    selectorVariants(sel)
      .flatMap((v) => v.split('.').filter(Boolean))
      .some((c) => wanted.has(c))

  let found = 0

  for (const [eventId, event] of Object.entries(ix2.events)) {
    const targetSel = event.target?.selector
    const targetId = event.target?.id?.split('|').pop()
    const listId = event.action?.config?.actionListId
    const list = ix2.actionLists?.[listId]

    // An event can hang off a wrapper that is not in the subtree while its action items move things
    // that are — a-3 reaches the Om oss photos exactly that way, and a-5 reaches the partner card
    // from an event bound to the whole grey panel. Matching on the event's target alone misses both.
    const listSelectors = list ? [...JSON.stringify(list).matchAll(/"selector":"([^"]+)"/g)].map((m) => m[1]) : []

    const hitsTarget =
      (targetSel && matchesSubtree(targetSel)) || (targetId && wIds.has(targetId)) || listSelectors.some(matchesSubtree)

    if (!hitsTarget) continue
    found++

    const where = targetSel ?? (targetId ? `[data-w-id="${targetId}"]` : '?')
    console.log(`  ${eventId}  ${event.eventTypeId}  on  ${where}   [${(event.mediaQueries ?? []).join(', ')}]`)
    if (!list) {
      console.log(`      → action list ${listId} is not in this chunk\n`)
      continue
    }
    console.log(`      ${listId} ${JSON.stringify(list.title ?? '')}`)

    // Scroll- and pointer-driven lists: keyframes along a 0..100 progress.
    for (const group of list.continuousParameterGroups ?? []) {
      const cfg = (Array.isArray(event.config) ? event.config : []).find(
        (c) => c.continuousParameterGroupId === group.id,
      )
      const extras = [
        group.type,
        cfg?.smoothing !== undefined ? `smoothing ${cfg.smoothing}` : null,
        cfg?.restingState !== undefined ? `resting ${cfg.restingState}%` : null,
        cfg?.startsEntering ? 'starts entering' : null,
        cfg?.addStartOffset ? `start offset ${cfg.addOffsetValue}%` : null,
        cfg?.addEndOffset ? `end offset ${cfg.endOffsetValue}%` : null,
      ]
        .filter(Boolean)
        .join(', ')
      console.log(`        ${extras}`)

      const rows = []
      for (const frame of group.continuousActionGroups ?? []) {
        for (const item of frame.actionItems ?? []) {
          const d = describeAction(item)
          rows.push([`${frame.keyframe}%`, d.target, d.text])
        }
      }
      // Grouped by target, because that is how it gets written as @keyframes.
      const byTarget = new Map()
      for (const [kf, target, text] of rows) {
        if (!byTarget.has(target)) byTarget.set(target, [])
        byTarget.get(target).push([kf, text])
      }
      for (const [target, frames] of byTarget) {
        console.log(`          ${target}`)
        for (const [kf, text] of frames) console.log(`            ${kf.padStart(5)}  ${text}`)
      }
    }

    // Triggered lists: ordered groups, each with its own duration.
    ;(list.actionItemGroups ?? []).forEach((group, i) => {
      const label = i === 0 && list.useFirstGroupAsInitialState ? 'group 1 (INITIAL STATE)' : `group ${i + 1}`
      console.log(`        ${label}`)
      for (const item of group.actionItems ?? []) {
        const d = describeAction(item)
        console.log(`          ${d.target.padEnd(30)} ${d.text}${d.timing ? `   [${d.timing}]` : ''}`)
      }
    })

    // The reveal idiom: for SCROLL_INTO_VIEW, Webflow bakes the hidden state into the markup as an
    // inline style and plays the list in REVERSE on the way in. Read literally, a one-group list
    // looks like an animation that HIDES the text — which is how a-9 first got read here.
    // Deliberately not fired for every one-group list: a-7 ("Tab change [ out of view ]") is a
    // genuine one-shot reset, and captioning it as reversed would be the same error mirrored.
    if (
      event.eventTypeId === 'SCROLL_INTO_VIEW' &&
      (list.actionItemGroups?.length ?? 0) === 1 &&
      !list.useFirstGroupAsInitialState
    ) {
      console.log(
        '        ⓘ one group only — the markup ships this state inline and the event plays it in\n' +
          '          REVERSE, so the element animates FROM these values to its natural ones.',
      )
    }
    console.log()
  }

  if (!found) console.log('  (no interaction in this export targets anything in this subtree)\n')
}

// ── CSS: which rules own each element, and which of them actually apply ──────────────────────
const READ = `(root, maxDepth) => {
  // Every custom property declared on :root, resolved through its own indirections — the export
  // routes most values through two or three of them (--card-primary-border → --border-secondary
  // → a hex), and a rule that reads "var(--…-card-primary-border)" says nothing on its own.
  const tokens = new Map()
  for (const sheet of document.styleSheets) {
    try {
      for (const rule of sheet.cssRules) {
        if (rule.selectorText !== ':root' && rule.selectorText !== 'html') continue
        for (const prop of rule.style) if (prop.startsWith('--')) tokens.set(prop, rule.style.getPropertyValue(prop).trim())
      }
    } catch {}
  }
  const resolve = (value, seen = 0) => {
    if (seen > 6 || !value.includes('var(')) return value
    return resolve(value.replace(/var\\(\\s*(--[\\w-]+)\\s*(?:,[^()]*)?\\)/g, (m, name) => tokens.get(name) ?? m), seen + 1)
  }

  // Rules are collected in document order, which is cascade order for equal specificity — good
  // enough to read; the computed value printed beside each property is the authority on who won.
  const rules = []
  const walkSheet = (list, media) => {
    for (const rule of list) {
      if (rule.media) walkSheet(rule.cssRules, rule.conditionText || rule.media.mediaText)
      else if (rule.cssRules && rule.conditionText !== undefined) walkSheet(rule.cssRules, rule.conditionText)
      else if (rule.selectorText) rules.push({ selector: rule.selectorText, style: rule.style, media })
    }
  }
  for (const sheet of document.styleSheets) { try { walkSheet(sheet.cssRules, null) } catch {} }

  const nodes = []
  const visit = (el, d) => {
    const box = el.getBoundingClientRect()
    const computed = getComputedStyle(el)
    const props = new Map()

    for (const rule of rules) {
      let hit = false
      try { hit = el.matches(rule.selector) } catch {}
      if (!hit) continue
      const applies = !rule.media || window.matchMedia(rule.media).matches
      for (const prop of rule.style) {
        const declared = rule.style.getPropertyValue(prop).trim()
        if (!props.has(prop)) props.set(prop, [])
        props.get(prop).push({
          selector: rule.selector,
          media: rule.media,
          applies,
          declared,
          resolved: resolve(declared),
        })
      }
    }

    const rows = [...props.entries()]
      .map(([prop, sources]) => ({ prop, computed: computed.getPropertyValue(prop), sources }))
      .sort((a, b) => a.prop.localeCompare(b.prop))

    nodes.push({
      depth: d,
      tag: el.tagName.toLowerCase(),
      id: el.id || null,
      classes: [...el.classList],
      wId: el.getAttribute('data-w-id'),
      box: Math.round(box.width) + 'x' + Math.round(box.height),
      text: (el.children.length === 0 ? el.textContent || '' : '').replace(/\\s+/g, ' ').trim().slice(0, 40),
      rows,
    })

    if (d < maxDepth) for (const kid of el.children) visit(kid, d + 1)
  }
  visit(root, 0)
  return nodes
}`

// ── serving the export ───────────────────────────────────────────────────────────────────────
// Over `file://` Chromium treats each local stylesheet as its own opaque origin: `sheet.cssRules`
// throws, and the page renders with no CSS at all. The first run of this tool reported the partner
// card as 1424x70 with zero rules — which reads exactly like a section that has no styling, rather
// than like a tool that cannot see any. Serving the directory removes the whole class of problem.
const MIME = {
  '.html': 'text/html',
  '.css': 'text/css',
  '.js': 'text/javascript',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
}

const server = http.createServer((req, res) => {
  const rel = decodeURIComponent(new URL(req.url, 'http://x').pathname)
  let file = path.join(exportDir, rel)
  if (!path.resolve(file).startsWith(exportDir)) return res.writeHead(403).end()
  if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, 'index.html')
  if (!fs.existsSync(file)) return res.writeHead(404).end()
  res.writeHead(200, { 'content-type': MIME[path.extname(file).toLowerCase()] ?? 'application/octet-stream' })
  fs.createReadStream(file).pipe(res)
})
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
const origin = `http://127.0.0.1:${server.address().port}`

// ── run ──────────────────────────────────────────────────────────────────────────────────────
const ix2 = readIx2()
const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })

await page.goto(origin + '/' + path.relative(exportDir, indexFile).split(path.sep).join('/'), {
  waitUntil: 'load',
  timeout: 60_000,
})
await page.waitForTimeout(1500)
await page.evaluate(() => document.fonts.ready)
// Below-the-fold boxes report height 0 until they are scrolled past — the same trap parity-audit
// handles, and it reads as a layout bug that is not there.
await page.evaluate(async () => {
  for (let y = 0; y < document.body.scrollHeight; y += 500) {
    window.scrollTo(0, y)
    await new Promise((r) => setTimeout(r, 40))
  }
  window.scrollTo(0, 0)
})

const nodes = await page.evaluate(
  ([sel, fn, d]) => {
    const root = document.querySelector(sel)
    if (!root) return null
    return eval('(' + fn + ')')(root, d)
  },
  [selector, READ, depth],
)
await browser.close()
server.close()

if (!nodes) {
  console.error(`[parity-source] "${selector}" matched nothing in ${indexFile}`)
  process.exit(1)
}

console.log(`\nsource   ${exportDir}`)
console.log(
  `page     ${path.relative(exportDir, indexFile).split(path.sep).join('/')}` +
    (fellBack && requested ? `   ⚠ "${requested}" is not in this source — read the home page instead` : ''),
)
console.log(`section  ${selector}   → ${nodes.length} elements, viewport 1440x900`)

if (!motionOnly) {
  console.log(`\n${'═'.repeat(96)}\nDOM\n`)
  for (const n of nodes) {
    const name = `<${n.tag}>${n.id ? '#' + n.id : ''}${n.classes.length ? '.' + n.classes.join('.') : ''}`
    console.log('  ' + '  '.repeat(n.depth) + name.padEnd(64 - n.depth * 2) + n.box + (n.text ? `  "${n.text}"` : ''))
  }

  console.log(`\n${'═'.repeat(96)}\nRULES — declared beside computed\n`)
  console.log('  A rule under a NON-MATCHING media query is marked ✗. It is in the file and it is not')
  console.log('  in effect: copying it is how `min-height: 520px` became a card 275px too tall.\n')

  for (const n of nodes) {
    if (!n.rows.length) continue
    const name = `<${n.tag}>${n.id ? '#' + n.id : ''}${n.classes.length ? '.' + n.classes.join('.') : ''}`
    console.log(`  ${'─'.repeat(92)}\n  ${name}   ${n.box}${n.wId ? `   data-w-id=${n.wId}` : ''}`)
    for (const row of n.rows) {
      // Skip the noise every Webflow reset declares on everything.
      if (row.sources.every((s) => s.selector === '*' || s.selector.startsWith('*,'))) continue
      console.log(`    ${row.prop.padEnd(26)}computed  ${row.computed}`)
      for (const s of row.sources) {
        const mark = s.applies ? ' ' : '✗'
        const where = s.media ? `${s.selector}  @media ${s.media}` : s.selector
        const value = s.resolved !== s.declared ? `${s.declared}  →  ${s.resolved}` : s.declared
        console.log(`      ${mark} ${where}`)
        console.log(`          ${value}`)
      }
    }
    console.log()
  }

  // The mapping the skill asks for, with the half this tool knows already filled in.
  console.log(`${'═'.repeat(96)}\nMAPPING SKELETON — fill in the right column, ONCE, before writing any CSS\n`)
  const seen = new Set()
  for (const n of nodes) {
    const key = n.classes.length ? '.' + n.classes.join('.') : `<${n.tag}>`
    if (seen.has(key)) continue
    seen.add(key)
    console.log(`     ${key.padEnd(44)} → ${''.padEnd(20)} ${n.box}`)
  }
  console.log()
}

if (withMotion) {
  if (!ix2) console.log('\n[parity-source] no IX2 data found under <export>/js — nothing to decode.')
  else {
    const classes = new Set(nodes.flatMap((n) => n.classes))
    const wIds = new Set(nodes.map((n) => n.wId).filter(Boolean))
    printMotion(ix2, classes, wIds)
  }
}
