// Types for seoAliases.mjs. Keep the two in sync by hand; tests/declarations.test.ts asserts the
// export lists match.

/** The line that opens the block this module owns. */
export declare const SEO_ALIASES_MARKER: string

/** The .htaccess block redirecting /robots.xml and /sitemap.xml. */
export declare function seoAliasRules(): string

/** `existing` with the alias rules added, or unchanged when it already carries them. */
export declare function withSeoAliases(existing: string | null): string

/** Write the rules into `<dist>/.htaccess`; true when the file changed. */
export declare function writeSeoAliases(dist: string, logger?: { info(message: string): void }): Promise<boolean>
