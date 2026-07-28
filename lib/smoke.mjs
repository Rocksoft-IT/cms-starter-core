#!/usr/bin/env node
// Backend-driven, layout-agnostic SEO/render smoke check over a built Astro `dist/`.
//
// Owned by the core package on purpose (#930): the mirror drops `frontend/packages/` before a
// client repo sees it, so this file reaches clients only via `node_modules/@rocksoft/cms-starter-core`
// and is re-delivered on every `sync_starter` core bump — it can never freeze in a client the way a
// copy under `frontend/tests/` or `frontend/scripts/` does.
//
// It asserts NOTHING about layout, which blocks a page has, or where anything sits — all of that
// comes from the backend and varies per client. It walks the *built output* (literally "whatever
// the backend generated") and checks only universal, per-page invariants:
//
//   • renders          — the page built to a non-trivial HTML document (Astro SSG fails the build
//                        otherwise, but a near-empty file is still a red flag);
//   • <title>          — present and non-empty  [STRICT];
//   • meta description — present and non-empty   [STRICT];
//   • og:image         — present and non-empty   [REPORT by default; --strict-og promotes it once
//                        the backend always resolves a default share image (#930 follow-up 2a).
//                        Left non-strict today because Seo.astro deliberately omits og:image for a
//                        page with no resolved share image, and the starter fixtures exercise that];
//   • <form> action    — any <form> has a non-empty submit target [STRICT; a no-op until form
//                        blocks exist. A *working* submit needs a live backend — out of scope for
//                        this offline check].
//
// Usage:  node lib/smoke.mjs [distDir] [--strict-og]
//   distDir defaults to ./dist. Exits 1 on any STRICT violation; prints REPORT-only misses as
//   warnings. Dep-free ESM (Node builtins only) so it runs identically from a client's node_modules.

import { readdirSync, readFileSync } from 'node:fs'
import { join, relative, sep } from 'node:path'

const args = process.argv.slice(2)
const strictOg = args.includes('--strict-og')
const distDir = args.find((a) => !a.startsWith('--')) ?? 'dist'

/** Recursively collect every *.html file under `dir`. */
function htmlFiles(dir) {
  const out = []
  let entries
  try {
    entries = readdirSync(dir, { withFileTypes: true })
  } catch {
    return out
  }
  for (const e of entries) {
    const full = join(dir, e.name)
    if (e.isDirectory()) out.push(...htmlFiles(full))
    else if (e.isFile() && e.name.endsWith('.html')) out.push(full)
  }
  return out
}

/** The `<head>…</head>` slice (meta/title live there), or the whole doc if no head is found. */
function head(html) {
  const m = html.match(/<head[^>]*>([\s\S]*?)<\/head>/i)
  return m ? m[1] : html
}

/** First `<meta …>` tag whose attributes include name/property === key (either attribute order). */
function metaTag(scope, key) {
  for (const [tag] of scope.matchAll(/<meta\b[^>]*>/gi)) {
    const id = attr(tag, 'name') ?? attr(tag, 'property')
    if (id?.toLowerCase() === key.toLowerCase()) return tag
  }
  return null
}

/** Value of `attr` on a single start-tag string, or null. Handles single/double quotes. */
function attr(tag, name) {
  const m = tag.match(new RegExp(`\\b${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)')`, 'i'))
  if (!m) return null
  return (m[1] ?? m[2] ?? '').trim()
}

const files = htmlFiles(distDir)
if (files.length === 0) {
  console.error(`[smoke] no .html files under "${distDir}" — did the build run? (pnpm build:mock)`)
  process.exit(1)
}

const errors = [] // STRICT violations → non-zero exit
const warnings = [] // REPORT-only (og:image by default)

for (const file of files) {
  const rel = relative(distDir, file).split(sep).join('/')
  const html = readFileSync(file, 'utf8')
  const h = head(html)

  // renders — a full document with a non-empty <body>. A page that errored out server-side (or
  // rendered to a bare shell) fails at least one of these; a size floor would false-positive on a
  // legitimately small page, so assert structure + body content instead.
  const body = html.match(/<body[^>]*>([\s\S]*?)<\/body>/i)?.[1] ?? ''
  if (!/<html[\s>]/i.test(html) || body.trim() === '') {
    errors.push(`${rel}: did not render a full HTML document`)
  }

  // <title> — non-empty
  const title = (h.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? '').trim()
  if (title === '') errors.push(`${rel}: empty or missing <title>`)

  // meta description — present and non-empty
  const desc = attr(metaTag(h, 'description') ?? '', 'content')
  if (desc === null || desc === '') errors.push(`${rel}: empty or missing <meta name="description">`)

  // og:image — present and non-empty (REPORT unless --strict-og)
  const og = attr(metaTag(h, 'og:image') ?? '', 'content')
  if (og === null || og === '') {
    const msg = `${rel}: missing og:image (no resolved share image)`
    ;(strictOg ? errors : warnings).push(msg)
  }

  // any <form> must carry a non-empty submit target
  const forms = html.match(/<form\b[^>]*>/gi) ?? []
  for (const form of forms) {
    const action = attr(form, 'action')
    if (action === null || action === '') errors.push(`${rel}: a <form> has no submit target (action)`)
  }
}

if (warnings.length > 0) {
  console.warn(`[smoke] ${warnings.length} og:image warning(s) (not fatal; --strict-og to enforce):`)
  for (const w of warnings) console.warn(`  ⚠ ${w}`)
}

if (errors.length > 0) {
  console.error(`[smoke] ${errors.length} violation(s) across ${files.length} page(s):`)
  for (const e of errors) console.error(`  ✗ ${e}`)
  process.exit(1)
}

console.log(
  `[smoke] OK — ${files.length} page(s): title + meta description on every page` +
    (strictOg ? ' + og:image' : '') +
    `, forms have submit targets.` +
    (warnings.length ? ` (${warnings.length} og:image warning(s))` : ''),
)
