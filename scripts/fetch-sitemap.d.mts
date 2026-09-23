// Types for the sitemap fetch step (dashboard #1324).
//
// The script itself is plain Node — it runs before `astro build` and must not depend on the
// toolchain — but it is exported from this package, so a consumer that type-checks (every client
// repo runs `astro check`) needs a declaration. Without one TypeScript reports ts(7016) for the
// import and the client's own check fails, which is exactly how this file came to exist: the
// starter never hit it, because there the script lives inside the repo where `allowJs` infers it.
//
// Hand-written rather than generated: the module is deliberately untyped JavaScript, and a handful
// of signatures are cheaper to keep honest than a build step that exists solely to emit them.
//
// It is a DECLARATION, so it WINS against the `.mjs` in module resolution — an export missing
// here is invisible to every consumer, however plainly the script exports it. `shadowingFiles`
// arrived in #2339 without a line here, and `astro check` on main went red for every frontend
// PR until #2346. `tests/declarations.test.ts` now asserts the two lists match.

/** The `<loc>` values of a sitemap index, in document order. */
export declare function parseSitemapIndex(xml: string): string[]

/** The file name a discovered sitemap URL should be written under, e.g. `sitemap-pl.xml`. */
export declare function fileNameFor(loc: string): string

/** Whether the client may be indexed — `search_visible` from GET /api/site-settings, absent = true. */
export declare function isSearchVisible(settings: unknown): boolean

/** Run the fetch as a build step, exiting non-zero on any failure. */
export declare function run(): Promise<void>

/** Whether a name in `public/` is one of this script's own outputs (`sitemap-<code>.xml`). */
export declare function isSitemapArtifact(name: string): boolean

/** The names in `public/` that shadow a CMS-generated document (`robots.txt`, `sitemap.xml`). */
export declare function shadowingFiles(names: string[]): string[]
