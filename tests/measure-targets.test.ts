import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, test } from 'vitest'
import { loadTargets } from './measure/targets.js'

/**
 * The measure harness ships with core and its target list stays with the site, so this loader is
 * the seam between them — the same shape, and the same reason for being tested, as
 * `vrt-routes.test.ts`: every failure here is a QUIET one. A target dropped by a typo'd key, or a
 * duplicate name whose artefacts overwrite an earlier target's, shortens the comparison while
 * every remaining selector still reports "matches".
 *
 * It also covers `MEASURE_REPO`, which lets a run read another checkout's list — the case that
 * lets the starter dev tree measure a client site (dashboard#1694).
 */
const dirs: string[] = []
let savedRepo: string | undefined

function repoWith(contents: unknown): string {
  const root = mkdtempSync(path.join(tmpdir(), 'measure-targets-'))
  dirs.push(root)
  mkdirSync(path.join(root, 'tests'))
  writeFileSync(path.join(root, 'tests', 'measure.targets.json'), JSON.stringify(contents))
  return root
}

const ONE_TARGET = { targets: [{ name: 'post', path: '/blogg/x/', selectors: { cover: '.post-cover img' } }] }

afterEach(() => {
  if (savedRepo === undefined) delete process.env.MEASURE_REPO
  else process.env.MEASURE_REPO = savedRepo
  savedRepo = undefined
  while (dirs.length) rmSync(dirs.pop()!, { recursive: true, force: true })
})

describe('loadTargets', () => {
  test('reads the site list and defaults oldPath to path', () => {
    expect(loadTargets(repoWith(ONE_TARGET)).targets).toEqual([
      { name: 'post', path: '/blogg/x/', oldPath: '/blogg/x/', selectors: { cover: '.post-cover img' } },
    ])
  })

  test('honours old_path, which is what makes a static prototype comparable', () => {
    // A prototype answers at /kontakt.html where the built site answers at /kontakt/.
    const root = repoWith({
      targets: [{ name: 'contact', path: '/kontakt/', old_path: '/kontakt.html', selectors: { h1: 'h1' } }],
    })

    expect(loadTargets(root).targets[0]).toMatchObject({ path: '/kontakt/', oldPath: '/kontakt.html' })
  })

  test('refuses a target with no selectors, which would measure nothing and still pass', () => {
    expect(() => loadTargets(repoWith({ targets: [{ name: 'post', path: '/x/' }] }))).toThrow(/lists no selectors/)
  })

  test('refuses a duplicate name, whose artefacts would overwrite the earlier target silently', () => {
    const root = repoWith({
      targets: [
        { name: 'post', path: '/a/', selectors: { h1: 'h1' } },
        { name: 'post', path: '/b/', selectors: { h1: 'h1' } },
      ],
    })

    expect(() => loadTargets(root)).toThrow(/duplicate target name "post"/)
  })

  test('names the file it looked at when the list is missing', () => {
    const empty = mkdtempSync(path.join(tmpdir(), 'measure-targets-'))
    dirs.push(empty)

    expect(() => loadTargets(empty)).toThrow(/no target list at .*measure\.targets\.json/)
  })

  test('reads the checkout named by MEASURE_REPO when called with no argument', () => {
    // The dev-tree case: the tooling and the skills are here, the list is in the client repo.
    const root = repoWith(ONE_TARGET)
    savedRepo = process.env.MEASURE_REPO
    process.env.MEASURE_REPO = root

    expect(loadTargets().targets[0].name).toBe('post')
  })
})
