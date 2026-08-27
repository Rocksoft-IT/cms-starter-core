import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, test } from 'vitest'
import { loadRoutes } from './vrt/routes.js'

/**
 * The VRT harness ships with core and its route list stays with the site, so this loader is the
 * seam between them — and the only part of the harness that a unit test can reach (the spec itself
 * needs two live origins and a browser).
 *
 * It is tested because every failure here is a QUIET one. A missing file, a typo'd key or a
 * duplicated name would each shorten a run while every remaining route still reported a
 * percentage, and a visual-regression tool that silently compares fewer pages than you think is
 * worse than none: it answers "did anything drift?" with a confident, partial no.
 */
const dirs: string[] = []

function repoWith(contents: unknown): string {
  const root = mkdtempSync(path.join(tmpdir(), 'vrt-routes-'))
  dirs.push(root)
  mkdirSync(path.join(root, 'tests'))
  writeFileSync(path.join(root, 'tests', 'vrt.routes.json'), JSON.stringify(contents))
  return root
}

afterEach(() => {
  while (dirs.length) rmSync(dirs.pop()!, { recursive: true, force: true })
})

describe('loadRoutes', () => {
  test('reads the site list and defaults oldPath to path', () => {
    const root = repoWith({ routes: [{ name: 'home', path: '/' }] })

    expect(loadRoutes(root).routes).toEqual([{ name: 'home', path: '/', oldPath: '/' }])
  })

  test('honours old_path, which is what makes a static prototype comparable', () => {
    // A prototype's pages are files where the built site has directories.
    const root = repoWith({ routes: [{ name: 'contact', path: '/kontakt', old_path: '/kontakt.html' }] })

    expect(loadRoutes(root).routes).toEqual([{ name: 'contact', path: '/kontakt', oldPath: '/kontakt.html' }])
  })

  test('names the expected shape when the file is a bare array', () => {
    // The likeliest way to write this file wrong, and `routes: undefined` would otherwise land on
    // a bare "lists no routes" that says nothing about what was missing.
    expect(() => loadRoutes(repoWith([{ name: 'home', path: '/' }]))).toThrow(/Expected \{ "routes"/)
  })

  test('picks up old_dismiss, and treats a blank one as absent', () => {
    expect(loadRoutes(repoWith({ old_dismiss: '#decline', routes: [{ name: 'home', path: '/' }] })).oldDismiss).toBe(
      '#decline',
    )
    expect(loadRoutes(repoWith({ old_dismiss: '   ', routes: [{ name: 'home', path: '/' }] })).oldDismiss).toBeNull()
  })

  test('ignores the `_readme` prose the file carries instead of comments', () => {
    const root = repoWith({ _readme: ['one route per distinct layout'], routes: [{ name: 'home', path: '/' }] })

    expect(loadRoutes(root).routes).toHaveLength(1)
  })

  test('throws, naming the path, when the site has no list', () => {
    const root = mkdtempSync(path.join(tmpdir(), 'vrt-routes-'))
    dirs.push(root)

    // Not an empty run: a harness that quietly falls back to `['/']` reports a green-looking
    // single-route comparison and hides that the other 90% never happened.
    expect(() => loadRoutes(root)).toThrow(/tests[\\/]vrt\.routes\.json/)
  })

  test('throws on an entry missing a name or a path', () => {
    expect(() => loadRoutes(repoWith({ routes: [{ path: '/' }] }))).toThrow(/needs a `name` and a `path`/)
    expect(() => loadRoutes(repoWith({ routes: [{ name: 'home' }] }))).toThrow(/needs a `name` and a `path`/)
  })

  test('throws on a duplicate name, since artefacts are keyed by it', () => {
    // Both routes would "pass" while the second silently overwrote the first's PNGs and report.
    const root = repoWith({
      routes: [
        { name: 'home', path: '/' },
        { name: 'home', path: '/en' },
      ],
    })

    expect(() => loadRoutes(root)).toThrow(/duplicate route name "home"/)
  })

  test('throws on an empty list rather than reporting a run with nothing in it', () => {
    expect(() => loadRoutes(repoWith({ routes: [] }))).toThrow(/lists no routes/)
  })
})
