import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync } from 'node:fs'
import { join, relative, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

// dashboard #2346 — a hand-written `.d.mts` next to an untyped `.mjs` WINS module resolution, so
// whatever it omits does not exist as far as any consumer is concerned. #2339 added
// `shadowingFiles` to scripts/fetch-sitemap.mjs and not to its declaration, and the failure landed
// nowhere near the change: `pnpm test:unit` stayed green (vitest runs the real module), while
// `pnpm astro check` reported ts(2305) on the test file's import line and every frontend PR
// inherited the red check until someone traced the resolution.
//
// Cheaper than generating the declarations, which the header of fetch-sitemap.d.mts explains we
// deliberately do not do: these modules are plain Node, shipped untyped on purpose.
const PACKAGE_ROOT = fileURLToPath(new URL('..', import.meta.url))

/**
 * Every `.d.mts` in the package, as a package-relative path with forward slashes.
 *
 * Deliberately the WHOLE tree rather than the two directories that hold one today: a declaration
 * added somewhere new has to be picked up on its own, or this gate has the same silent hole it
 * exists to close. Hence also the hand-rolled recursion — `readdirSync(recursive: true)` reads
 * every directory before anything can filter, and pnpm gives this package its own `node_modules`.
 */
function declaredModules(dir = PACKAGE_ROOT): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name)

    if (entry.isDirectory()) {
      return entry.name === 'node_modules' || entry.name.startsWith('.') ? [] : declaredModules(path)
    }

    return entry.name.endsWith('.d.mts') ? [relative(PACKAGE_ROOT, path).replaceAll(sep, '/')] : []
  })
}

const EXPORT_LINE = /^export\b.*/gm
const EXPORTED_NAME = /^export\s+(?:declare\s+)?(?:async\s+)?(?:function\*?|class|const|let|var)\s+([A-Za-z_$][\w$]*)/

/**
 * The named exports of one module's source, from either half of the pair.
 *
 * Every `export` line has to yield a name. An `export {…}` list, an `export default` or a form
 * nobody has taught this function would otherwise be read as "exports nothing" on BOTH sides and
 * compare equal — a green test over an unchecked file, which is the failure this whole suite is
 * about. So an unreadable line throws instead.
 */
function exportedNames(source: string, file: string): string[] {
  return [...source.matchAll(EXPORT_LINE)]
    .map(([line]) => {
      const name = EXPORTED_NAME.exec(line)?.[1]

      if (!name) {
        throw new Error(
          `${file}: cannot read the export form of \`${line.trim()}\`. Teach exportedNames about it — ` +
            'left unread it would compare equal on both sides and this gate would pass over it.',
        )
      }

      return name
    })
    .sort()
}

const MODULES = declaredModules()

describe('hand-written .d.mts declarations', () => {
  it('finds the declarations to check (a rename must not silently empty this suite)', () => {
    expect(MODULES.length).toBeGreaterThan(0)
    expect(MODULES).toContain('scripts/fetch-sitemap.d.mts')
  })

  it.each(MODULES)('%s declares exactly what its .mjs exports', (declaration) => {
    const implementation = declaration.replace(/\.d\.mts$/, '.mjs')
    const declared = readFileSync(join(PACKAGE_ROOT, declaration), 'utf8')
    const implemented = readFileSync(join(PACKAGE_ROOT, implementation), 'utf8')

    expect(exportedNames(declared, declaration)).toEqual(exportedNames(implemented, implementation))
  })
})
