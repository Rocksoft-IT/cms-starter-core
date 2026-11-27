import { describe, it, expect } from 'vitest'
import { mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  EXACT_REDIRECTS_BEGIN,
  EXACT_REDIRECTS_END,
  exactRedirectRules,
  toExactRules,
  withExactRedirects,
  writeExactRedirects,
} from '../core/exactRedirects.mjs'
import { PREFIX_REDIRECTS_BEGIN, toPrefixRules, withPrefixRedirects } from '../core/redirectPrefixes.mjs'
import { withHostRules } from '../core/hostRules.mjs'
import { toAstroRedirects } from '../core/redirects.mjs'

// Every exact CMS redirect shipped as a 200 meta-refresh page (rocksoft.pl, 2026-11-27):
// /post/rocksofts-vision/ -> /blog/rocksofts-vision/ answered 200, not 301. These pin the
// .htaccess block that makes Apache answer with a real 301 first. Apache is not available
// offline, so the patterns are also exercised as JS regexes — PCRE agrees for these constructs.

const rules = (map: Record<string, string>) => toExactRules(toAstroRedirects(map))

describe('toExactRules()', () => {
  it('takes the Astro map, slash-trimmed, sorted, site paths and external URLs apart', () => {
    expect(
      rules({
        '/post/rocksofts-vision/': '/blog/rocksofts-vision/',
        '/pobierz/': 'https://cdn.example.test/file.pdf',
      }),
    ).toEqual([
      { from: 'pobierz', to: 'https://cdn.example.test/file.pdf', external: true },
      { from: 'post/rocksofts-vision', to: '/blog/rocksofts-vision/', external: false },
    ])
  })

  it('decodes the source (Apache matches the decoded path) and encodes the destination once', () => {
    expect(rules({ '/%C5%BC%C3%B3%C5%82w/': '/żółw-nowy/' })).toEqual([
      { from: 'żółw', to: '/%C5%BC%C3%B3%C5%82w-nowy/', external: false },
    ])
    expect(rules({ '/a/': '/b%20c/' })[0].to).toBe('/b%20c/')
  })

  it('drops rows that could break .htaccess, loop, or never match', () => {
    expect(
      toExactRules({
        '/': '/home/',
        '/same/': '/same/',
        '/same-encoded/': '/same%2Dencoded/',
        '/a b/': '/x/',
        '/q?x=1': '/x/',
        '/frag#x': '/x/',
        '/bad%E0%A4%A/': '/x/',
        '/quote"/': '/x/',
        '/ok/': 'relative/',
      } as Record<string, string>),
    ).toEqual([])
    // A character that is merely not URL-safe is encoded, not dropped.
    expect(toExactRules({ '/ok2/': '/x"y/' })).toEqual([{ from: 'ok2', to: '/x%22y/', external: false }])
    expect(toExactRules(null as unknown as Record<string, string>)).toEqual([])
    expect(toExactRules([] as unknown as Record<string, string>)).toEqual([])
  })
})

describe('exactRedirectRules()', () => {
  const block = exactRedirectRules(
    rules({
      '/post/rocksofts-vision/': '/blog/rocksofts-vision/',
      '/2026-09-22/': '/prelekcja-pdf/?utm_source=qr&utm_medium=code',
      '/pobierz/': 'https://cdn.example.test/a%20b.pdf',
      '/pokoje-stare/': '/pokoje/#galeria',
    }),
  )

  it('answers a site path with a 301, https-aware, in one hop', () => {
    expect(block).toContain(
      'RewriteRule ^post/rocksofts\\-vision/?$ https://%{HTTP_HOST}/blog/rocksofts-vision/ [R=301,L,NE]',
    )
    expect(block).toContain('RewriteRule ^post/rocksofts\\-vision/?$ /blog/rocksofts-vision/ [R=301,L,NE]')

    const lines = block.split('\n').map((l) => l.trim())
    lines.forEach((line, i) => {
      if (line.includes('https://%{HTTP_HOST}'))
        expect(lines[i - 1]).toBe('RewriteCond %{HTTP:X-Forwarded-Proto} =https')
    })
  })

  it('writes an external destination once, with its percent escapes quoted', () => {
    expect(block).toContain('RewriteRule ^pobierz/?$ https://cdn.example.test/a\\%20b.pdf [R=301,L,NE]')
    expect(block).not.toContain('%{HTTP_HOST}https://')
  })

  it('keeps the destination’s own query string and fragment', () => {
    expect(block).toContain('RewriteRule ^2026\\-09\\-22/?$ /prelekcja-pdf/?utm_source=qr&utm_medium=code [R=301,L,NE]')
    expect(block).toContain('RewriteRule ^pokoje\\-stare/?$ /pokoje/#galeria [R=301,L,NE]')
  })

  it('matches the whole path, with or without the trailing slash, and nothing else', () => {
    const re = new RegExp('^post/rocksofts\\-vision/?$')
    expect(re.test('post/rocksofts-vision')).toBe(true)
    expect(re.test('post/rocksofts-vision/')).toBe(true)
    expect(re.test('post/rocksofts-vision/more/')).toBe(false)
    expect(re.test('xpost/rocksofts-vision/')).toBe(false)

    const dots = exactRedirectRules(rules({ '/a.b+c/': '/x/' }))
    expect(dots).toContain('^a\\.b\\+c/?$')
  })

  it('is empty for no rules', () => {
    expect(exactRedirectRules([])).toBe('')
  })
})

describe('withExactRedirects()', () => {
  const exact = rules({ '/code-audit/': '/code-audit-and-koda/' })

  it('goes first, ahead of the prefix block, the trailing-slash rule and the site’s own rules', () => {
    // The order astro:build:done writes them in: prefix, then exact (each prepends itself).
    const withPrefix = withPrefixRedirects('Options -Indexes\n', toPrefixRules([{ from: '/de-at/', to: '/de/' }]))
    const out = withHostRules(withExactRedirects(withPrefix, exact))

    expect(out.startsWith(EXACT_REDIRECTS_BEGIN)).toBe(true)
    expect(out.indexOf(EXACT_REDIRECTS_END)).toBeLessThan(out.indexOf(PREFIX_REDIRECTS_BEGIN))
    expect(out.indexOf(PREFIX_REDIRECTS_BEGIN)).toBeLessThan(out.indexOf('DirectorySlash Off'))
    expect(out).toContain('Options -Indexes')
  })

  it('replaces the block a previous build wrote instead of stacking it', () => {
    const once = withExactRedirects(null, exact)
    const changed = withExactRedirects(once, rules({ '/brand-assets/': '/brandbook/' }))
    expect(changed.split(EXACT_REDIRECTS_BEGIN)).toHaveLength(2)
    expect(changed).toContain('^brand\\-assets')
    expect(changed).not.toContain('^code\\-audit')
    expect(withExactRedirects(once, exact)).toBe(once)
  })

  it('replaces a block that lost its end marker instead of stacking a second one', () => {
    const truncated = withExactRedirects(null, exact).replace(`${EXACT_REDIRECTS_END}\n`, '') + 'Options -Indexes\n'
    const out = withExactRedirects(truncated, rules({ '/brand-assets/': '/brandbook/' }))

    expect(out.split(EXACT_REDIRECTS_BEGIN)).toHaveLength(2)
    expect(out).not.toContain('^code\\-audit')
    expect(out).toContain('Options -Indexes')
  })

  it('removes the block when the CMS has no rules any more', () => {
    const out = withExactRedirects(withExactRedirects('Options -Indexes\n', exact), [])
    expect(out).toBe('Options -Indexes\n')
  })
})

describe('writeExactRedirects()', () => {
  it('writes into dist/.htaccess, and never over a real page', async () => {
    const dist = await mkdtemp(join(tmpdir(), 'exact-'))
    expect(await writeExactRedirects(dist, [], undefined)).toBe(false)

    // Astro's own redirect page for a CMS row, and a real page at another redirect's source.
    await mkdir(join(dist, 'code-audit'), { recursive: true })
    await writeFile(
      join(dist, 'code-audit', 'index.html'),
      '<!doctype html><meta http-equiv="refresh" content="0;url=/code-audit-and-koda/">',
      'utf8',
    )
    await mkdir(join(dist, 'thank-you'), { recursive: true })
    await writeFile(join(dist, 'thank-you', 'index.html'), '<!doctype html><h1>Thanks</h1>', 'utf8')
    await writeFile(join(dist, '.htaccess'), 'Options -Indexes\n', 'utf8')

    const warnings: string[] = []
    const logger = { info() {}, warn: (m: string) => warnings.push(m) }
    expect(
      await writeExactRedirects(dist, rules({ '/code-audit/': '/code-audit-and-koda/', '/thank-you/': '/' }), logger),
    ).toBe(true)

    const written = await readFile(join(dist, '.htaccess'), 'utf8')
    expect(written).toContain('^code\\-audit/?$ /code-audit-and-koda/ [R=301,L,NE]')
    expect(written).not.toContain('thank\\-you')
    expect(written).toContain('Options -Indexes')
    expect(warnings.join('\n')).toContain('/thank-you/')
  })
})
