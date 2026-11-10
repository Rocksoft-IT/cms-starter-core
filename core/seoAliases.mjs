// The two legacy SEO addresses every site is asked about, answered with a real 301 (dashboard #13
// on x-mej): /robots.xml -> /robots.txt and /sitemap.xml -> /sitemap-index.xml.
//
// A static Astro build cannot emit an HTTP 301 (see redirects.mjs), so the redirect is host config:
// an `.htaccess` in the build output. Client sites run nginx in front of Apache, which hands every
// path nginx has no static file for to Apache, and Apache honours the file. A host that does not
// process it leaves the rules inert, which `pnpm seo:verify <origin>` shows.
//
// Emitted from core for the same reason cmsConsentEndpoint() is: a fix then ships with a pin bump
// instead of a per-repo file sync. cmsRedirects() calls it, so every site that already registers
// that integration gets it with no wiring of its own.
//
// Plain .mjs with a .d.mts sibling, for the reason redirects.mjs is.

import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'

/** The line that opens the block this module owns, so a rebuild never appends it twice. */
export const SEO_ALIASES_MARKER = '# cms-starter-core: SEO endpoint aliases'

/**
 * The rules, https-aware: nginx terminates TLS and speaks plain http to Apache, so a bare relative
 * target would be made absolute with `http://` and cost the visitor a second 301. When nginx
 * forwards `X-Forwarded-Proto: https` the target carries https; otherwise the relative form is the
 * fallback. Anchored patterns: only the exact path is redirected, never a prefix.
 */
export function seoAliasRules() {
  return [
    SEO_ALIASES_MARKER,
    '<IfModule mod_rewrite.c>',
    '  RewriteEngine On',
    '',
    '  RewriteCond %{HTTP:X-Forwarded-Proto} =https',
    '  RewriteRule ^robots\\.xml$ https://%{HTTP_HOST}/robots.txt [R=301,L]',
    '  RewriteRule ^robots\\.xml$ /robots.txt [R=301,L]',
    '',
    '  RewriteCond %{HTTP:X-Forwarded-Proto} =https',
    '  RewriteRule ^sitemap\\.xml$ https://%{HTTP_HOST}/sitemap-index.xml [R=301,L]',
    '  RewriteRule ^sitemap\\.xml$ /sitemap-index.xml [R=301,L]',
    '</IfModule>',
    '',
  ].join('\n')
}

/**
 * `existing` (the build's current .htaccess, or null) with the alias rules in it.
 *
 * Left untouched when it already answers either address: a site that copied the rules into its own
 * `public/.htaccess` before core carried them (x-mej) keeps its own, and a second build over the
 * same output must not stack a second copy.
 */
export function withSeoAliases(existing) {
  const current = existing ?? ''

  if (current.includes(SEO_ALIASES_MARKER) || /robots\\\.xml|sitemap\\\.xml/.test(current)) {
    return current
  }

  const separator = current === '' || current.endsWith('\n\n') ? '' : current.endsWith('\n') ? '\n' : '\n\n'

  return `${current}${separator}${seoAliasRules()}`
}

/** Write the rules into `<dist>/.htaccess`, merged with whatever `public/` already put there. */
export async function writeSeoAliases(dist, logger) {
  const target = path.join(dist, '.htaccess')

  let existing = null
  try {
    existing = await readFile(target, 'utf8')
  } catch {
    // none yet — public/ had no .htaccess
  }

  const next = withSeoAliases(existing)
  if (next === existing) return false

  await mkdir(path.dirname(target), { recursive: true })
  await writeFile(target, next, 'utf8')
  logger?.info('301 /robots.xml -> /robots.txt and /sitemap.xml -> /sitemap-index.xml in .htaccess.')

  return true
}
