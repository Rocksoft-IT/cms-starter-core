// Host config written into the build's `.htaccess`, like seoAliases.mjs (dashboard #2477):
//
// 1. `/about` → `/about/` in one hop, on https. nginx hands a slashless folder to Apache, whose
//    own DirectorySlash targets the plain http it sees (https → http → https). `-d` keeps the
//    rule to real folders, so a missing address still reaches the 404.
// 2. `ErrorDocument 404 /404.html`, only when the build has that page.
//
// A site whose own `public/.htaccess` already says either keeps its own.
//
// Plain .mjs with a .d.mts sibling, for the reason redirects.mjs is.

import { access, mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'

export const TRAILING_SLASH_MARKER = '# cms-starter-core: one-hop trailing slash'
export const NOT_FOUND_MARKER = '# cms-starter-core: 404 page'

export function trailingSlashRules() {
  return [
    TRAILING_SLASH_MARKER,
    '<IfModule mod_rewrite.c>',
    '  DirectorySlash Off',
    '  RewriteEngine On',
    '',
    '  RewriteCond %{REQUEST_FILENAME} -d',
    '  RewriteCond %{HTTP:X-Forwarded-Proto} =https',
    '  RewriteRule ^(.+[^/])$ https://%{HTTP_HOST}/$1/ [R=301,L]',
    '  RewriteCond %{REQUEST_FILENAME} -d',
    '  RewriteRule ^(.+[^/])$ /$1/ [R=301,L]',
    '</IfModule>',
    '',
  ].join('\n')
}

export function notFoundRules() {
  return [NOT_FOUND_MARKER, 'ErrorDocument 404 /404.html', ''].join('\n')
}

/** `existing` (the build's .htaccess, or null) with each block it does not already carry appended. */
export function withHostRules(existing, { notFoundPage = false } = {}) {
  let current = existing ?? ''

  const append = (block) => {
    const separator = current === '' || current.endsWith('\n\n') ? '' : current.endsWith('\n') ? '\n' : '\n\n'
    current = `${current}${separator}${block}`
  }

  if (!current.includes(TRAILING_SLASH_MARKER) && !/^\s*DirectorySlash\b/im.test(current)) {
    append(trailingSlashRules())
  }

  if (notFoundPage && !current.includes(NOT_FOUND_MARKER) && !/^\s*ErrorDocument\s+404\b/im.test(current)) {
    append(notFoundRules())
  }

  return current
}

/** Write the blocks into `<dist>/.htaccess`; true when the file changed. */
export async function writeHostRules(dist, logger) {
  const target = path.join(dist, '.htaccess')

  let existing = null
  try {
    existing = await readFile(target, 'utf8')
  } catch {
    // none yet — public/ had no .htaccess
  }

  const notFoundPage = await access(path.join(dist, '404.html')).then(
    () => true,
    () => false,
  )

  const next = withHostRules(existing, { notFoundPage })
  if (next === (existing ?? '')) return false

  await mkdir(path.dirname(target), { recursive: true })
  await writeFile(target, next, 'utf8')
  logger?.info(`One-hop trailing-slash redirect${notFoundPage ? ' and the 404 page' : ''} in .htaccess.`)

  return true
}
