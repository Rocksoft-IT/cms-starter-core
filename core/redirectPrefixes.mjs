// The CMS's prefix redirects (dashboard #2466), answered with a real 301: every address under
// `from` now lives under `to`, the rest of the path carried over. What renaming a locale code
// leaves behind (`/de-at/kontakt/` -> `/de/kontakt/`).
//
// Astro's `redirects` cannot express "everything under this path" for a static build (each entry
// is one emitted page), and a meta-refresh page is not a 301 anyway. So, like the SEO aliases
// (seoAliases.mjs), the rule is host config: a marked block in the build's `.htaccess`. Client
// sites run nginx in front of Apache, which hands Apache every path nginx has no static file for,
// and after a rename no file exists under the old prefix.
//
// The block is REPLACED on every build, not appended once: unlike the SEO aliases, its content
// comes from the CMS and changes when a rule is added or removed.
//
// Plain .mjs with a .d.mts sibling, for the reason redirects.mjs is.

import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'

/** The lines that open and close the block this module owns. */
export const PREFIX_REDIRECTS_BEGIN = '# cms-starter-core: CMS prefix redirects'
export const PREFIX_REDIRECTS_END = '# cms-starter-core: end of CMS prefix redirects'

/** A path without its surrounding slashes: `/de-at/` -> `de-at`. */
function segments(value) {
  return String(value)
    .trim()
    .replace(/^\/+|\/+$/g, '')
}

/**
 * The API payload as a clean rule list: entries that are not two different, non-empty, relative
 * paths are dropped, longest `from` first (a narrower rule overrides a broader one, and Apache
 * stops at the first matching `[L]` rule). The API already sorts; this does not trust a fixture to.
 *
 * @param {unknown} raw
 * @returns {Array<{ from: string, to: string }>}
 */
export function toPrefixRules(raw) {
  if (!Array.isArray(raw)) return []

  const rules = []

  for (const entry of raw) {
    if (!entry || typeof entry !== 'object') continue
    const from = segments(entry.from ?? '')
    const to = segments(entry.to ?? '')

    if (from === '' || to === '' || from === to) continue
    // Only plain path characters reach Apache's pattern and substitution: anything else is a row
    // the CMS should never have written, and one bad rule in .htaccess is a 500 for the whole site.
    // No `%` either: in a substitution `%N` is a RewriteCond back-reference, not a literal.
    if (!/^[\w\-./~]+$/.test(from) || !/^[\w\-./~]+$/.test(to)) continue

    rules.push({ from, to })
  }

  return rules.sort((a, b) => b.from.length - a.from.length || a.from.localeCompare(b.from))
}

/** `from` as an Apache pattern: the prefix itself, or the prefix and anything below it. */
function pattern(from) {
  return `^${from.replace(/[.\\+*?[^\]$(){}=!<>|:-]/g, '\\$&')}(?:/(.*))?$`
}

/**
 * The `.htaccess` block for `rules`, https-aware for the reason seoAliasRules() is: nginx speaks
 * plain http to Apache, so a relative target would be made absolute with `http://` and cost the
 * visitor a second 301. Empty string for no rules.
 *
 * @param {Array<{ from: string, to: string }>} rules  as toPrefixRules() returns them
 */
export function prefixRedirectRules(rules) {
  if (rules.length === 0) return ''

  const lines = [PREFIX_REDIRECTS_BEGIN, '<IfModule mod_rewrite.c>', '  RewriteEngine On']

  for (const { from, to } of rules) {
    lines.push(
      '',
      '  RewriteCond %{HTTP:X-Forwarded-Proto} =https',
      `  RewriteRule ${pattern(from)} https://%{HTTP_HOST}/${to}/$1 [R=301,L]`,
      `  RewriteRule ${pattern(from)} /${to}/$1 [R=301,L]`,
    )
  }

  lines.push('</IfModule>', PREFIX_REDIRECTS_END, '')

  return lines.join('\n')
}

/**
 * `existing` (the build's current .htaccess, or null) with the block for `rules` in it, replacing
 * the one a previous build wrote. Placed first, so a site's own rules below cannot answer an old
 * address before it is redirected. No rules removes the block.
 */
export function withPrefixRedirects(existing, rules) {
  let current = existing ?? ''
  const start = current.indexOf(PREFIX_REDIRECTS_BEGIN)
  const end = current.indexOf(PREFIX_REDIRECTS_END)

  if (start !== -1) {
    // A block that lost its END marker (a hand-trimmed copy in public/, a truncated write) ends
    // at its own closing </IfModule> instead. Left in place, its stale rules would keep
    // redirecting under every fresh block, and removing a rule in the CMS would never take effect.
    const closer = current.indexOf('</IfModule>', start)
    const stop =
      end > start ? end + PREFIX_REDIRECTS_END.length : closer !== -1 ? closer + '</IfModule>'.length : current.length

    current = current.slice(0, start) + current.slice(stop).replace(/^\n+/, '')
  }

  const block = prefixRedirectRules(rules)
  if (block === '') return current

  return current === '' ? block : `${block}\n${current}`
}

/** Write the block into `<dist>/.htaccess`; true when the file changed. */
export async function writePrefixRedirects(dist, rules, logger) {
  const target = path.join(dist, '.htaccess')

  let existing = null
  try {
    existing = await readFile(target, 'utf8')
  } catch {
    // none yet — public/ had no .htaccess
  }

  const next = withPrefixRedirects(existing, rules)
  if (next === (existing ?? '')) return false

  await mkdir(path.dirname(target), { recursive: true })
  await writeFile(target, next, 'utf8')
  logger?.info(`${rules.length} prefix redirect(s) from the CMS as 301s in .htaccess.`)

  return true
}
