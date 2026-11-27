// The CMS's exact redirects (GET /api/redirects), answered with a real 301 at the host.
//
// cmsRedirects() hands the same map to Astro's `redirects`, and a static build can only emit each
// entry as an HTML page with `<meta http-equiv="refresh">`: the old address answers 200, not 301.
// Measured live on rocksoft.pl (2026-11-27): /post/rocksofts-vision/, /code-audit/ and every other
// exact row answered 200 + meta refresh, while the prefix rules (redirectPrefixes.mjs, already in
// .htaccess) answered 301. A crawler follows a meta refresh, but it is not a permanent redirect
// and SEO audits report every one of them.
//
// So the exact map takes the prefix rules' route: a marked block in the build's `.htaccess`,
// REPLACED on every build because its content comes from the CMS. Apache answers before the
// meta-refresh page is ever served; the page stays in the build as the fallback for a host that
// reads no .htaccess.
//
// Placed FIRST in the file — before the prefix block, the SEO aliases and the trailing-slash rule
// — so an old address reaches its destination in one hop.
//
// Plain .mjs with a .d.mts sibling, for the reason redirects.mjs is.

import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'

/** The lines that open and close the block this module owns. */
export const EXACT_REDIRECTS_BEGIN = '# cms-starter-core: CMS exact redirects'
export const EXACT_REDIRECTS_END = '# cms-starter-core: end of CMS exact redirects'

/** Anything that would end or split an .htaccess directive, or is not a URL character at all. */
const UNSAFE = /[\s"'<>\\`{}|^\u0000-\u001f\u007f]/

function isExternal(value) {
  return /^https?:\/\//i.test(value)
}

/** `value` percent-decoded, or null when it is not valid percent-encoding. */
function decoded(value) {
  try {
    return decodeURIComponent(value)
  } catch {
    return null
  }
}

/**
 * `value` in the form a URL carries it: non-ASCII and spaces percent-encoded, existing `%XX`
 * escapes kept as they are (decode first, so nothing is encoded twice). Null when undecodable.
 */
function encoded(value) {
  try {
    return encodeURI(decodeURI(value))
  } catch {
    return null
  }
}

/**
 * The Astro redirect map (`toAstroRedirects()` output) as a clean rule list.
 *
 * `from` is the source without its surrounding slashes, DECODED: Apache matches a per-directory
 * RewriteRule against the percent-decoded path, so `/z%C3%B3%C5%82w/` and `/żółw/` are the same
 * row and must be written as the decoded UTF-8 text. `to` is the destination as it goes on the
 * wire. Rows that cannot be written safely are dropped: one bad line in .htaccess is a 500 for the
 * whole site, so a row the CMS should never have stored must not get that far.
 *
 * @param {Record<string, string>} map
 * @returns {Array<{ from: string, to: string, external: boolean }>}
 */
export function toExactRules(map) {
  if (!map || typeof map !== 'object' || Array.isArray(map)) return []

  const rules = []
  const seen = new Set()

  for (const [rawFrom, rawTo] of Object.entries(map)) {
    if (typeof rawTo !== 'string') continue

    // A fragment never reaches the server, so a source carrying one cannot be matched.
    if (rawFrom.includes('#') || rawFrom.includes('?')) continue
    const from = decoded(
      String(rawFrom)
        .trim()
        .replace(/^\/+|\/+$/g, ''),
    )
    // The home page is never a redirect source: it is the one address every site serves.
    if (from === null || from === '' || UNSAFE.test(from)) continue

    const external = isExternal(rawTo.trim())
    const to = encoded(rawTo.trim())
    if (to === null || to === '' || UNSAFE.test(to)) continue
    if (!external && !to.startsWith('/')) continue

    // A self-redirect (after normalizing both sides) would loop.
    const toPath = external ? null : decoded(to.replace(/[?#].*$/, '').replace(/^\/+|\/+$/g, ''))
    if (toPath === from) continue

    if (seen.has(from)) continue
    seen.add(from)
    rules.push({ from, to, external })
  }

  // Stable output, so an unchanged map rewrites nothing.
  return rules.sort((a, b) => a.from.localeCompare(b.from))
}

/** `from` as an Apache pattern: the whole path, with or without its trailing slash. */
function pattern(from) {
  return `^${from.replace(/[.\\+*?[^\]$(){}=!<>|:\-#]/g, '\\$&')}/?$`
}

/**
 * A destination as a RewriteRule substitution. `$` and `%` are back-reference markers there, so a
 * literal one (a percent-encoded byte, `%C3`) is backslash-quoted.
 */
function substitution(to) {
  return to.replace(/[$%]/g, '\\$&')
}

/**
 * The flags for every rule. Always `R=301,L`, and `NE` so Apache does not escape the `%XX` and
 * `#` the destination already carries (it would turn `%C3` into `%25C3` and `#` into `%23`).
 *
 * The incoming query string: Apache appends it on its own when the substitution has none, which is
 * what an old link carrying `?utm_source=…` should keep. A destination that brings its OWN query
 * string wins instead (Apache's default drops the incoming one then): the CMS row says exactly
 * what the visitor should land on — a QR-code redirect to `/pdf/?utm_source=qr` must not have its
 * campaign overwritten.
 */
const FLAGS = '[R=301,L,NE]'

/**
 * The `.htaccess` block for `rules`. A site path is written twice, https-aware, for the reason
 * prefixRedirectRules() gives: nginx speaks plain http to Apache, so a relative target would be
 * made absolute with `http://` and cost the visitor a second 301. Empty string for no rules.
 *
 * @param {Array<{ from: string, to: string, external: boolean }>} rules  as toExactRules() returns them
 */
export function exactRedirectRules(rules) {
  if (rules.length === 0) return ''

  const lines = [EXACT_REDIRECTS_BEGIN, '<IfModule mod_rewrite.c>', '  RewriteEngine On']

  for (const { from, to, external } of rules) {
    const target = substitution(to)

    if (external) {
      lines.push('', `  RewriteRule ${pattern(from)} ${target} ${FLAGS}`)
      continue
    }

    lines.push(
      '',
      '  RewriteCond %{HTTP:X-Forwarded-Proto} =https',
      `  RewriteRule ${pattern(from)} https://%{HTTP_HOST}${target} ${FLAGS}`,
      `  RewriteRule ${pattern(from)} ${target} ${FLAGS}`,
    )
  }

  lines.push('</IfModule>', EXACT_REDIRECTS_END, '')

  return lines.join('\n')
}

/**
 * `existing` (the build's current .htaccess, or null) with the block for `rules` in it, replacing
 * the one a previous build wrote, placed first. No rules removes the block.
 */
export function withExactRedirects(existing, rules) {
  let current = existing ?? ''
  const start = current.indexOf(EXACT_REDIRECTS_BEGIN)
  const end = current.indexOf(EXACT_REDIRECTS_END)

  if (start !== -1) {
    // A block that lost its END marker ends at its own closing </IfModule> — same reasoning as
    // withPrefixRedirects(): left in place, stale rules would keep firing under every fresh block.
    const closer = current.indexOf('</IfModule>', start)
    const stop =
      end > start ? end + EXACT_REDIRECTS_END.length : closer !== -1 ? closer + '</IfModule>'.length : current.length

    current = current.slice(0, start) + current.slice(stop).replace(/^\n+/, '')
  }

  const block = exactRedirectRules(rules)
  if (block === '') return current

  return current === '' ? block : `${block}\n${current}`
}

/**
 * True when `<dist>/<from>/index.html` is a real page rather than the meta-refresh page Astro
 * wrote for this redirect. The API withholds a redirect a live page shadows, but the build is the
 * last word on what exists: a site route the CMS knows nothing about (a page under src/pages/)
 * must never be answered with a 301 that makes it unreachable.
 */
async function servesRealPage(dist, from) {
  try {
    const html = await readFile(path.join(dist, from, 'index.html'), 'utf8')
    return !/http-equiv=["']?refresh/i.test(html)
  } catch {
    return false
  }
}

/** Write the block into `<dist>/.htaccess`; true when the file changed. */
export async function writeExactRedirects(dist, rules, logger) {
  const kept = []
  const shadowed = []

  for (const rule of rules) {
    if (await servesRealPage(dist, rule.from)) shadowed.push(rule.from)
    else kept.push(rule)
  }

  if (shadowed.length > 0) {
    logger?.warn?.(
      `${shadowed.length} CMS redirect(s) not written to .htaccess — a real page lives at: /${shadowed.join('/, /')}/`,
    )
  }

  const target = path.join(dist, '.htaccess')

  let existing = null
  try {
    existing = await readFile(target, 'utf8')
  } catch {
    // none yet — public/ had no .htaccess
  }

  const next = withExactRedirects(existing, kept)
  if (next === (existing ?? '')) return false

  await mkdir(path.dirname(target), { recursive: true })
  await writeFile(target, next, 'utf8')
  logger?.info(`${kept.length} exact redirect(s) from the CMS as 301s in .htaccess.`)

  return true
}
