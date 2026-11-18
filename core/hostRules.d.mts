// Types for hostRules.mjs. Keep the two in sync by hand; tests/declarations.test.ts asserts the
// export lists match.

/** The lines that open the blocks this module owns. */
export declare const TRAILING_SLASH_MARKER: string
export declare const NOT_FOUND_MARKER: string

/** The block redirecting a slashless folder to its slash in one hop, https-aware. */
export declare function trailingSlashRules(): string

/** The block pointing Apache's 404 at the build's own page. */
export declare function notFoundRules(): string

/** `existing` with each block it does not already carry appended. */
export declare function withHostRules(existing: string | null, options?: { notFoundPage?: boolean }): string

/** Write the blocks into `<dist>/.htaccess`; true when the file changed. */
export declare function writeHostRules(dist: string, logger?: { info(message: string): void }): Promise<boolean>
