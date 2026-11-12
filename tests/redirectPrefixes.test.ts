import { describe, it, expect } from 'vitest'
import { mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  PREFIX_REDIRECTS_BEGIN,
  PREFIX_REDIRECTS_END,
  prefixRedirectRules,
  toPrefixRules,
  withPrefixRedirects,
  writePrefixRedirects,
} from '../core/redirectPrefixes.mjs'
import { withSeoAliases } from '../core/seoAliases.mjs'

// dashboard #2466: a locale code rename (`de-at` -> `de`) leaves one prefix rule, and every old
// address under it must answer a real 301 to the same path under the new code. Apache is not
// available offline, so these pin the rule text and the merge; the pattern is also exercised as a
// JS regex, which matches PCRE for the constructs it uses.

describe('toPrefixRules()', () => {
  it('normalizes the API shape and sorts the longest prefix first', () => {
    expect(
      toPrefixRules([
        { from: '/de-at/', to: '/de/' },
        { from: '/de-at/blog/', to: '/de/news/' },
      ]),
    ).toEqual([
      { from: 'de-at/blog', to: 'de/news' },
      { from: 'de-at', to: 'de' },
    ])
  })

  it('drops anything that could break .htaccess or loop', () => {
    expect(
      toPrefixRules([
        { from: '/', to: '/de/' },
        { from: '/de/', to: '/de/' },
        { from: '/de at/', to: '/de/' },
        { from: '/x/', to: 'https://evil.test/' },
        { from: '/y/', to: '/de/%1/' },
        null,
        'nope',
      ]),
    ).toEqual([])
    expect(toPrefixRules({ from: '/a/', to: '/b/' })).toEqual([])
  })
})

describe('prefixRedirectRules()', () => {
  const block = prefixRedirectRules(toPrefixRules([{ from: '/de-at/', to: '/de/' }]))

  it('answers the prefix and everything below it with a 301, https-aware', () => {
    expect(block).toContain('RewriteRule ^de\\-at(?:/(.*))?$ /de/$1 [R=301,L]')
    expect(block).toContain('RewriteRule ^de\\-at(?:/(.*))?$ https://%{HTTP_HOST}/de/$1 [R=301,L]')

    const lines = block.split('\n').map((l) => l.trim())
    lines.forEach((line, i) => {
      if (line.includes('https://%{HTTP_HOST}'))
        expect(lines[i - 1]).toBe('RewriteCond %{HTTP:X-Forwarded-Proto} =https')
    })
  })

  it('matches on a segment boundary only', () => {
    const re = new RegExp('^de\\-at(?:/(.*))?$')
    expect(re.exec('de-at')?.[1] ?? '').toBe('')
    expect(re.exec('de-at/')?.[1]).toBe('')
    expect(re.exec('de-at/kontakt/')?.[1]).toBe('kontakt/')
    expect(re.test('de-attic/')).toBe(false)
  })

  it('is empty for no rules', () => {
    expect(prefixRedirectRules([])).toBe('')
  })
})

describe('withPrefixRedirects()', () => {
  const rules = toPrefixRules([{ from: '/de-at/', to: '/de/' }])

  it('puts the block first, before the site’s own rules and the SEO aliases', () => {
    const out = withPrefixRedirects(withSeoAliases('Options -Indexes\n'), rules)
    expect(out.startsWith(PREFIX_REDIRECTS_BEGIN)).toBe(true)
    expect(out).toContain('Options -Indexes')
    expect(out).toContain('robots\\.xml')
  })

  it('replaces the block a previous build wrote instead of stacking it', () => {
    const once = withPrefixRedirects(null, rules)
    const changed = withPrefixRedirects(once, toPrefixRules([{ from: '/nb-no/', to: '/no/' }]))
    expect(changed.split(PREFIX_REDIRECTS_BEGIN)).toHaveLength(2)
    expect(changed).toContain('^nb\\-no')
    expect(changed).not.toContain('^de\\-at')
    expect(withPrefixRedirects(once, rules)).toBe(once)
  })

  it('replaces a block that lost its end marker instead of stacking a second one', () => {
    const truncated = withPrefixRedirects(null, rules).replace(`${PREFIX_REDIRECTS_END}\n`, '') + 'Options -Indexes\n'
    const out = withPrefixRedirects(truncated, toPrefixRules([{ from: '/nb-no/', to: '/no/' }]))

    expect(out.split(PREFIX_REDIRECTS_BEGIN)).toHaveLength(2)
    expect(out).not.toContain('^de\\-at')
    expect(out).toContain('Options -Indexes')
  })

  it('removes the block when the CMS has no rules any more', () => {
    const out = withPrefixRedirects(withPrefixRedirects('Options -Indexes\n', rules), [])
    expect(out).toBe('Options -Indexes\n')
    expect(out).not.toContain(PREFIX_REDIRECTS_END)
  })
})

describe('writePrefixRedirects()', () => {
  it('writes into dist/.htaccess and leaves it alone with no rules', async () => {
    const dist = await mkdtemp(join(tmpdir(), 'prefix-'))
    await mkdir(dist, { recursive: true })

    expect(await writePrefixRedirects(dist, [], undefined)).toBe(false)

    await writeFile(join(dist, '.htaccess'), 'Options -Indexes\n', 'utf8')
    expect(await writePrefixRedirects(dist, toPrefixRules([{ from: '/de-at/', to: '/de/' }]), undefined)).toBe(true)

    const written = await readFile(join(dist, '.htaccess'), 'utf8')
    expect(written).toContain('/de/$1 [R=301,L]')
    expect(written).toContain('Options -Indexes')
  })
})
