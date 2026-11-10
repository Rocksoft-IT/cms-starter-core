import { describe, it, expect } from 'vitest'
import { mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { SEO_ALIASES_MARKER, seoAliasRules, withSeoAliases, writeSeoAliases } from '../core/seoAliases.mjs'

// dashboard #13 (x-mej): /robots.xml and /sitemap.xml must answer a real 301 on every site. A static
// build cannot emit one, so core writes the rules into the build's .htaccess. Apache is not
// available offline, so these tests pin the rule text and the merge behaviour; `pnpm seo:verify
// <origin>` checks the host.

describe('seoAliasRules()', () => {
  const rules = seoAliasRules()

  it('redirects each legacy address to its standard one with a 301', () => {
    expect(rules).toContain('RewriteRule ^robots\\.xml$ /robots.txt [R=301,L]')
    expect(rules).toContain('RewriteRule ^sitemap\\.xml$ /sitemap-index.xml [R=301,L]')
  })

  it('keeps https in one step when nginx forwarded it, and only then', () => {
    const lines = rules.split('\n').map((l) => l.trim())

    lines.forEach((line, i) => {
      if (line.includes('https://%{HTTP_HOST}')) {
        expect(lines[i - 1]).toBe('RewriteCond %{HTTP:X-Forwarded-Proto} =https')
      }
    })
  })

  it('anchors every pattern so only the exact path is redirected', () => {
    for (const line of rules.split('\n').filter((l) => l.trim().startsWith('RewriteRule'))) {
      const pattern = line.trim().split(/\s+/)[1]
      expect(pattern.startsWith('^') && pattern.endsWith('$')).toBe(true)
    }
  })
})

describe('withSeoAliases()', () => {
  it('creates the block when the build has no .htaccess', () => {
    expect(withSeoAliases(null)).toBe(seoAliasRules())
  })

  it('appends the block after the site\'s own rules, which stay as they were', () => {
    const own = 'ErrorDocument 404 /404.html\n'
    const merged = withSeoAliases(own)

    expect(merged.startsWith(own)).toBe(true)
    expect(merged).toContain(SEO_ALIASES_MARKER)
  })

  it('is idempotent: a second pass over its own output changes nothing', () => {
    const once = withSeoAliases('ErrorDocument 404 /404.html\n')

    expect(withSeoAliases(once)).toBe(once)
  })

  it('leaves a site alone that already redirects either address itself', () => {
    const own = 'RedirectMatch 301 ^/sitemap\\.xml$ /sitemap-index.xml\n'

    expect(withSeoAliases(own)).toBe(own)
  })
})

describe('writeSeoAliases()', () => {
  it('writes <dist>/.htaccess, merges into one public/ put there, and reports whether it changed', async () => {
    const dist = await mkdtemp(join(tmpdir(), 'seo-aliases-'))

    expect(await writeSeoAliases(dist)).toBe(true)
    expect(await readFile(join(dist, '.htaccess'), 'utf8')).toBe(seoAliasRules())
    expect(await writeSeoAliases(dist)).toBe(false)

    const own = await mkdtemp(join(tmpdir(), 'seo-aliases-'))
    await mkdir(own, { recursive: true })
    await writeFile(join(own, '.htaccess'), 'ErrorDocument 404 /404.html\n')
    await writeSeoAliases(own)

    const text = await readFile(join(own, '.htaccess'), 'utf8')
    expect(text.startsWith('ErrorDocument 404 /404.html\n')).toBe(true)
    expect(text).toContain(SEO_ALIASES_MARKER)
  })
})
