// Types for exactRedirects.mjs. Keep the two in sync by hand; tests/declarations.test.ts asserts
// the export lists match.

/** An exact redirect: `from` slash-trimmed and percent-decoded, `to` as it goes on the wire. */
interface ExactRule {
  from: string
  to: string
  external: boolean
}

/** The lines that open and close the block this module owns. */
export declare const EXACT_REDIRECTS_BEGIN: string
export declare const EXACT_REDIRECTS_END: string

/** The Astro redirect map as a clean rule list; rows unsafe for .htaccess are dropped. */
export declare function toExactRules(map: Record<string, string>): ExactRule[]

/** The .htaccess block answering each rule with a 301; '' for no rules. */
export declare function exactRedirectRules(rules: ExactRule[]): string

/** `existing` with the block replaced, placed first (or removed when there are no rules). */
export declare function withExactRedirects(existing: string | null, rules: ExactRule[]): string

/** Write the block into `<dist>/.htaccess`, skipping a source a real page occupies; true when the file changed. */
export declare function writeExactRedirects(
  dist: string,
  rules: ExactRule[],
  logger?: { info(message: string): void; warn?(message: string): void },
): Promise<boolean>
