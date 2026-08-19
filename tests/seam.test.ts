import { readFileSync, readdirSync, statSync } from 'node:fs'
import { dirname, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, test } from 'vitest'

// The package is two surfaces, and this is the test that keeps them two (dashboard #1195 step 2).
//
//   CMS CLIENT  lib/** + types/**  — the backend contract: fetch, normalize, resolve addresses.
//   UI KIT      core/blocks/** + core/uno.core.ts — the shipped block components and the shortcut
//               vocabulary they are written against.
//
// The dependency runs ONE WAY: a block imports the client (59 imports of ../../types/blocks,
// ../../lib/href, ../../lib/image and friends at the time of writing), and the client imports
// nothing from the kit. That is what lets a site take the contract without the components — the
// case epic #1195 exists for, since a client with its own design system needs the API and the
// routing but not 30 opinionated blocks.
//
// It was true by accident, never by contract: nothing stopped someone adding
// `import { coreShortcuts } from '../core/uno.core'` to lib/api.ts, and nothing would have
// noticed. One import in that direction fuses the two halves permanently, because from then on
// taking the client drags the kit in.
//
// Scanning source text rather than the module graph is deliberate: an import that only TYPE-checks
// (`import type`) still couples the files for a human reader and for any future tooling that walks
// imports, and a graph walk would need the ~site alias and a Vite context this runner does not
// have for plain .ts files.

const PKG = join(dirname(fileURLToPath(import.meta.url)), '..')

/** Every .ts/.mts/.astro file under a package-relative directory, recursively. */
function sourceFiles(rel: string): string[] {
  const root = join(PKG, rel)
  const out: string[] = []
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry)
      if (statSync(full).isDirectory()) {
        walk(full)
      } else if (/\.(ts|mts|astro)$/.test(entry)) {
        out.push(full)
      }
    }
  }
  walk(root)
  return out
}

/** Import/export specifiers in a file — `from '…'`, covering static, type-only and re-exports. */
function specifiersOf(file: string): string[] {
  const src = readFileSync(file, 'utf8')
  return [...src.matchAll(/\bfrom\s+['"]([^'"]+)['"]/g)].map(([, spec]) => spec)
}

// A specifier reaching the UI kit, from anywhere. Matches the relative forms the package actually
// uses ('../core/uno.core', '../../core/blocks/Hero.astro') and the package-subpath form a file
// could reach for instead ('@rocksoft/cms-starter-core/core/uno.core').
function reachesUiKit(spec: string): boolean {
  return /(^|\/)core\/blocks\//.test(spec) || /(^|\/)core\/uno\.core(\.ts)?$/.test(spec)
}

describe('the CMS client never imports the UI kit', () => {
  const clientFiles = [...sourceFiles('lib'), ...sourceFiles('types')]

  test('the scan actually sees the client files', () => {
    // Without this the suite would pass vacuously if the directories were renamed or the walk
    // broke — the failure mode a "nothing found, therefore fine" assertion always has.
    expect(clientFiles.length).toBeGreaterThan(5)
    expect(clientFiles.some((f) => f.endsWith('api.ts'))).toBe(true)
    expect(clientFiles.some((f) => f.endsWith('blocks.ts'))).toBe(true)
  })

  test('no lib/** or types/** file imports core/blocks/** or core/uno.core', () => {
    const offenders = clientFiles.flatMap((file) =>
      specifiersOf(file)
        .filter(reachesUiKit)
        .map((spec) => `${relative(PKG, file)} imports ${spec}`),
    )

    expect(offenders).toEqual([])
  })

  test('the matcher recognises the imports it is meant to catch', () => {
    // The check above is a negative assertion, so it also passes when the matcher is broken. These
    // are the exact shapes it must catch, and two it must not.
    expect(reachesUiKit('../core/uno.core')).toBe(true)
    expect(reachesUiKit('../../core/blocks/Hero.astro')).toBe(true)
    expect(reachesUiKit('@rocksoft/cms-starter-core/core/uno.core')).toBe(true)
    expect(reachesUiKit('../core/mock')).toBe(false) // connection-layer infrastructure, allowed
    expect(reachesUiKit('../types/blocks')).toBe(false) // the client's own types
  })
})

describe('the UI kit does depend on the CMS client', () => {
  test('blocks import lib/types — the one-way direction this seam is FOR', () => {
    // Stated as a test rather than a comment: if this ever went to zero the seam would be
    // meaningless (two halves that share nothing are not a seam), and the guard above would be
    // passing for the wrong reason.
    const blockImports = sourceFiles('core/blocks').flatMap(specifiersOf)
    const intoClient = blockImports.filter((spec) => /(^|\/)(lib|types)\//.test(spec))

    expect(intoClient.length).toBeGreaterThan(20)
  })
})
