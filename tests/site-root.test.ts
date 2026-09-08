import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, test } from 'vitest'
import { siteRoot } from './shared/site-root.js'

/**
 * `MEASURE_REPO` / `VRT_REPO` aim a harness run at a checkout other than the one it runs from —
 * which is how the starter dev tree, where the tooling and the agent guidance live, measures a
 * client site that received its copy once at provisioning (dashboard#1694).
 *
 * Tested because both failure modes here are quiet ones. A variable that is silently ignored
 * measures the WRONG repo's list and reports a perfectly plausible run; a typo'd path that falls
 * through to the loader's "no list at <path>" error sends the reader to a file that was never the
 * problem.
 */
const dirs: string[] = []
const vars: string[] = []

function tempDir(): string {
  const dir = mkdtempSync(path.join(tmpdir(), 'site-root-'))
  dirs.push(dir)
  return dir
}

function withEnv(name: string, value: string | undefined): void {
  vars.push(name)
  if (value === undefined) delete process.env[name]
  else process.env[name] = value
}

afterEach(() => {
  while (vars.length) delete process.env[vars.pop()!]
  while (dirs.length) rmSync(dirs.pop()!, { recursive: true, force: true })
})

describe('siteRoot', () => {
  test('is the cwd when the variable is unset — the behaviour every existing run has', () => {
    withEnv('MEASURE_REPO', undefined)

    expect(siteRoot('MEASURE_REPO', 'measure')).toBe(process.cwd())
  })

  test('is the cwd when the variable is blank, rather than resolving to the cwd twice over', () => {
    // `MEASURE_REPO=` in a .env or a shell that expanded an unset variable reaches here as ''.
    withEnv('MEASURE_REPO', '   ')

    expect(siteRoot('MEASURE_REPO', 'measure')).toBe(process.cwd())
  })

  test('resolves a named checkout to an absolute path', () => {
    const dir = tempDir()
    withEnv('MEASURE_REPO', dir)

    expect(siteRoot('MEASURE_REPO', 'measure')).toBe(path.resolve(dir))
  })

  test('resolves a relative path against the cwd, the way it reads in a shell', () => {
    const dir = tempDir()
    withEnv('VRT_REPO', path.relative(process.cwd(), dir))

    expect(siteRoot('VRT_REPO', 'vrt')).toBe(path.resolve(dir))
  })

  test('names the variable and the resolved path when the checkout is not there', () => {
    // Not left to the loader's "no list at <path>": that error reads as a site which never wired
    // the harness up, and sends you editing the wrong repo's tests/ directory.
    withEnv('MEASURE_REPO', path.join(tempDir(), 'no-such-checkout'))

    expect(() => siteRoot('MEASURE_REPO', 'measure')).toThrow(/\[measure\] MEASURE_REPO=.*is not a directory/)
  })

  test('rejects a path that exists but is a file', () => {
    const file = path.join(tempDir(), 'package.json')
    writeFileSync(file, '{}')
    withEnv('VRT_REPO', file)

    expect(() => siteRoot('VRT_REPO', 'vrt')).toThrow(/\[vrt\] VRT_REPO=.*is not a directory/)
  })
})
