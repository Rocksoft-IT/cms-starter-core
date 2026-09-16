import { describe, expect, it, afterEach } from 'vitest'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import {
  isDirectoryReference,
  resolveReferenceFile,
  startStaticReference,
  resolveReferenceOrigin,
} from './shared/static-reference.js'

// The reference side of a port is usually a FOLDER — a design handed over as static HTML/CSS/JS —
// and until this existed both harnesses could only fetch an origin. That forced every port to
// either deploy the design first or point at whatever the client's domain answered on, which is
// how kwalitet's committed baseline ended up recorded from the site the redesign REPLACES.
//
// What is asserted here is the resolver, not the harnesses: the address shapes are the whole
// difficulty (`/uslugi/` on the build against `uslugi.html` in the export), and they are the part
// a plain static server gets wrong.

const made: string[] = []

function fixture(): string {
  const root = mkdtempSync(path.join(tmpdir(), 'static-ref-'))
  made.push(root)
  writeFileSync(path.join(root, 'index.html'), '<h1>home</h1>')
  writeFileSync(path.join(root, 'uslugi.html'), '<h1>uslugi</h1>')
  writeFileSync(path.join(root, 'style.css'), 'body{color:red}')
  // A page that is BOTH a file and a directory of sub-pages, which is the ordinary shape of a
  // design export and the case a naive `existsSync` gets wrong: the bare path exists, as a
  // directory, and streaming it throws instead of falling through to the .html beside it.
  mkdirSync(path.join(root, 'uslugi'))
  writeFileSync(path.join(root, 'uslugi', 'pranie.html'), '<h1>pranie</h1>')
  mkdirSync(path.join(root, 'blog'))
  writeFileSync(path.join(root, 'blog', 'index.html'), '<h1>blog</h1>')
  return root
}

afterEach(() => {
  for (const dir of made.splice(0)) rmSync(dir, { recursive: true, force: true })
})

describe('isDirectoryReference', () => {
  it('passes a deployed reference through as a URL', () => {
    expect(isDirectoryReference('https://new.kwalitet.pl')).toBe(false)
    expect(isDirectoryReference('http://localhost:8080')).toBe(false)
  })

  it('treats every path shape as a directory', () => {
    expect(isDirectoryReference('../kwalitet-Website')).toBe(true)
    expect(isDirectoryReference('./design')).toBe(true)
    expect(isDirectoryReference('/abs/design')).toBe(true)
    expect(isDirectoryReference('design')).toBe(true)
  })
})

describe('resolveReferenceFile', () => {
  it('serves the root as index.html', () => {
    const root = fixture()
    expect(resolveReferenceFile(root, '/')).toBe(path.join(root, 'index.html'))
  })

  it('finds an extensionless page as <path>.html — the reason a plain static server is not enough', () => {
    const root = fixture()
    expect(resolveReferenceFile(root, '/uslugi')).toBe(path.join(root, 'uslugi.html'))
  })

  it('finds it with a trailing slash too, which is how the BUILD spells the same address', () => {
    const root = fixture()
    expect(resolveReferenceFile(root, '/uslugi/')).toBe(path.join(root, 'uslugi.html'))
  })

  it('prefers the .html file over a same-named directory rather than throwing EISDIR', () => {
    const root = fixture()
    // `/uslugi` exists as a directory here; the page is `uslugi.html` beside it.
    expect(resolveReferenceFile(root, '/uslugi')).toBe(path.join(root, 'uslugi.html'))
    // …and the directory's own children still resolve.
    expect(resolveReferenceFile(root, '/uslugi/pranie')).toBe(path.join(root, 'uslugi', 'pranie.html'))
  })

  it('falls back to a directory index', () => {
    const root = fixture()
    expect(resolveReferenceFile(root, '/blog')).toBe(path.join(root, 'blog', 'index.html'))
    expect(resolveReferenceFile(root, '/blog/')).toBe(path.join(root, 'blog', 'index.html'))
  })

  it('serves assets by their real path', () => {
    const root = fixture()
    expect(resolveReferenceFile(root, '/style.css')).toBe(path.join(root, 'style.css'))
  })

  it('returns null for a miss', () => {
    const root = fixture()
    expect(resolveReferenceFile(root, '/nope')).toBeNull()
  })

  it('refuses to escape the export root', () => {
    const root = fixture()
    expect(resolveReferenceFile(root, '/../../etc/passwd')).toBeNull()
    expect(resolveReferenceFile(root, '/blog/../../../etc/passwd')).toBeNull()
  })
})

describe('startStaticReference', () => {
  it('serves the export over http, so stylesheets are same-origin and readable', async () => {
    const root = fixture()
    const { origin, close } = await startStaticReference(root, 'test')
    try {
      const page = await fetch(`${origin}/uslugi`)
      expect(page.status).toBe(200)
      expect(page.headers.get('content-type')).toBe('text/html')
      expect(await page.text()).toContain('uslugi')

      const css = await fetch(`${origin}/style.css`)
      expect(css.headers.get('content-type')).toBe('text/css')

      expect((await fetch(`${origin}/nope`)).status).toBe(404)
    } finally {
      await close()
    }
  })

  it('names a path that is not there, instead of 404ing every route', async () => {
    await expect(startStaticReference('/no/such/design', 'measure')).rejects.toThrow(/is neither a URL nor a directory/)
  })
})

describe('resolveReferenceOrigin', () => {
  it('leaves a deployed reference alone and hands back a no-op close', async () => {
    const resolved = await resolveReferenceOrigin('https://new.kwalitet.pl/', 'measure')
    expect(resolved.origin).toBe('https://new.kwalitet.pl')
    expect(resolved.served).toBe(false)
    await expect(resolved.close()).resolves.toBeUndefined()
  })

  it('serves a directory and says so, so a caller can report which one it used', async () => {
    const root = fixture()
    const resolved = await resolveReferenceOrigin(root, 'measure')
    try {
      expect(resolved.served).toBe(true)
      expect(resolved.origin).toMatch(/^http:\/\/127\.0\.0\.1:\d+$/)
    } finally {
      await resolved.close()
    }
  })
})
