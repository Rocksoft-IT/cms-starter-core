import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  NOT_FOUND_MARKER,
  TRAILING_SLASH_MARKER,
  trailingSlashRules,
  withHostRules,
  writeHostRules,
} from '../core/hostRules.mjs'

describe('trailingSlashRules()', () => {
  it('switches DirectorySlash off and redirects a slashless folder on https in one hop', () => {
    const rules = trailingSlashRules()

    expect(rules).toContain('DirectorySlash Off')
    expect(rules).toContain('RewriteCond %{REQUEST_FILENAME} -d')
    expect(rules).toContain('RewriteCond %{HTTP:X-Forwarded-Proto} =https')
    expect(rules).toContain('RewriteRule ^(.+[^/])$ https://%{HTTP_HOST}/$1/ [R=301,L]')
    // Inside the mod_rewrite guard: without the rewrite, DirectorySlash Off alone would stop
    // slashless folders working at all.
    expect(rules.indexOf('DirectorySlash Off')).toBeGreaterThan(rules.indexOf('<IfModule mod_rewrite.c>'))
  })
})

describe('withHostRules()', () => {
  it('appends the slash rule, and the 404 page only when the build has one', () => {
    expect(withHostRules(null)).toBe(trailingSlashRules())
    expect(withHostRules(null)).not.toContain('ErrorDocument')
    expect(withHostRules(null, { notFoundPage: true })).toContain('ErrorDocument 404 /404.html')
  })

  it('keeps what a site already says, and never stacks a second copy', () => {
    const site = 'RewriteEngine On\nDirectorySlash Off\nErrorDocument 404 /oops.html\n'

    expect(withHostRules(site, { notFoundPage: true })).toBe(site)

    const once = withHostRules('# site\n', { notFoundPage: true })
    expect(withHostRules(once, { notFoundPage: true })).toBe(once)
    expect(once.split(TRAILING_SLASH_MARKER)).toHaveLength(2)
    expect(once.split(NOT_FOUND_MARKER)).toHaveLength(2)
  })
})

describe('writeHostRules()', () => {
  let dist: string

  beforeEach(async () => {
    dist = await mkdtemp(path.join(tmpdir(), 'host-rules-'))
  })

  afterEach(async () => {
    await rm(dist, { recursive: true, force: true })
  })

  it('merges into the .htaccess public/ copied, and points Apache at a 404.html that exists', async () => {
    await writeFile(path.join(dist, '.htaccess'), '# from public/\n')
    await writeFile(path.join(dist, '404.html'), '<h1>Not found</h1>')

    expect(await writeHostRules(dist)).toBe(true)

    const htaccess = await readFile(path.join(dist, '.htaccess'), 'utf8')
    expect(htaccess.startsWith('# from public/\n')).toBe(true)
    expect(htaccess).toContain('DirectorySlash Off')
    expect(htaccess).toContain('ErrorDocument 404 /404.html')

    expect(await writeHostRules(dist)).toBe(false)
  })

  it('leaves ErrorDocument out when the build has no 404 page', async () => {
    await writeHostRules(dist)

    expect(await readFile(path.join(dist, '.htaccess'), 'utf8')).not.toContain('ErrorDocument')
  })
})
