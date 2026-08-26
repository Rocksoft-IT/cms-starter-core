// Fixture access for the CONFORMANCE suite — the checks core runs against a consuming site.
//
// Deliberately self-contained: it must not import the site's own `tests/e2e/site-fixtures.ts`.
// That file has diverged past recognition across the fleet (the template's is a one-line
// re-export; smbp's is 145 lines with page/section/route lookups), so anything core depends on
// there works in one repo and not the next.
//
// Paths resolve from `process.cwd()`, which Playwright sets to the consuming repo's root. The
// layout is the fixed convention every repo built from this template shares —
// `src/fixtures/data` — and is NOT read from `scripts/site.mjs`: that file is absent in a
// vendored-core site (kaffemaskin-til-bedrift), and a package cannot reliably relative-import a
// consumer's script anyway.
import { readFileSync, existsSync } from 'node:fs'
import path from 'node:path'

export interface ConformanceLocale {
  code: string
  is_default: boolean
}

/** Only the fields the conformance checks navigate by; a site's own specs assert on the rest. */
export interface ConformancePage {
  type: string
  name?: string | null
  slug?: string | null
  path?: string | null
  blocks?: Array<{ type: string }>
}

export function fixturesDir(): string {
  return path.join(process.cwd(), 'src', 'fixtures', 'data')
}

const cache = new Map<string, unknown>()

/**
 * Reads a fixture file, or THROWS with the path it looked at.
 *
 * Deliberately not tolerant. An earlier draft returned an empty list for a missing file, which
 * made a repo whose fixtures do not sit where this expects run exactly one route (`/`) and report
 * green — a silent ~90% loss of coverage, indistinguishable from a passing floor. For a mechanism
 * whose entire premise is "six of seven repos had no coverage and nobody knew", degrading quietly
 * is the one failure mode it must not have.
 */
function read<T>(file: string): T {
  const full = path.join(fixturesDir(), file)
  if (!cache.has(full)) {
    if (!existsSync(full)) {
      throw new Error(
        `conformance: no fixture at ${full}. The suite builds its route list from the site's own ` +
          `fixtures and cannot assert anything without them — check that this repo keeps them at ` +
          `src/fixtures/data, and that Playwright's cwd is the repo root.`,
      )
    }
    cache.set(full, JSON.parse(readFileSync(full, 'utf8')) as T)
  }
  return cache.get(full) as T
}

/**
 * The locale served UNPREFIXED. Every other locale sits under its own prefix, and only this one
 * answers at the bare addresses (`/`, `/kontakt/`) these checks navigate to.
 */
export function defaultLocale(): string {
  const locales = read<ConformanceLocale[]>('locales.json')
  return locales.find((l) => l.is_default)?.code ?? 'en'
}

/** The default locale's pages, as `GET /api/pages` returns them. */
export function pages(): ConformancePage[] {
  return read<ConformancePage[]>(`pages.${defaultLocale()}.json`)
}

/**
 * Every address the built site actually answers at, home included.
 *
 * The home singleton carries `path: null` because it is served at the root, so it has to be
 * added by hand — and it must be, since it is the page a visitor is likeliest to land on. Sites
 * whose fixtures omit `path` on a page (an unroutable draft) drop out.
 */
export function routes(): string[] {
  const listed = pages()
    .map((p) => p.path)
    .filter((p): p is string => Boolean(p))
  // De-duplicated: the home singleton normally carries `path: null` and is added here, but nothing
  // enforces that — a site whose home fixture spells out '/' would otherwise get the route twice,
  // and every check would run twice under an identical test title.
  return [...new Set(['/', ...listed])]
}

/**
 * The route of the page carrying a given block type, or null when no routable page does.
 *
 * For checks that are about one block rather than about every page. Returns null rather than
 * throwing: a site is free not to place a block, and a conformance check must not fail a site for
 * what it legitimately does not use.
 */
export function routeWithBlock(type: string): string | null {
  return pages().find((p) => p.path && p.blocks?.some((b) => b.type === type))?.path ?? null
}
