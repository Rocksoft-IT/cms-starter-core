// Types for the sitemap fetch step (dashboard #1324).
//
// The script itself is plain Node — it runs before `astro build` and must not depend on the
// toolchain — but it is exported from this package, so a consumer that type-checks (every client
// repo runs `astro check`) needs a declaration. Without one TypeScript reports ts(7016) for the
// import and the client's own check fails, which is exactly how this file came to exist: the
// starter never hit it, because there the script lives inside the repo where `allowJs` infers it.
//
// Hand-written rather than generated: the module is deliberately untyped JavaScript, and four
// signatures are cheaper to keep honest than a build step that exists solely to emit them.

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
