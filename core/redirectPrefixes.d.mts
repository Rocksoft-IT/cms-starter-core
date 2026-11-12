// Types for redirectPrefixes.mjs. Keep the two in sync by hand; tests/declarations.test.ts asserts
// the export lists match.

/** A prefix redirect: every address under `from` now lives under `to`. Slash-trimmed paths. */
interface PrefixRule {
  from: string
  to: string
}

/** The lines that open and close the block this module owns. */
export declare const PREFIX_REDIRECTS_BEGIN: string
export declare const PREFIX_REDIRECTS_END: string

/** The API payload as a clean rule list, longest `from` first. */
export declare function toPrefixRules(raw: unknown): PrefixRule[]

/** The .htaccess block answering each rule with a 301; '' for no rules. */
export declare function prefixRedirectRules(rules: PrefixRule[]): string

/** `existing` with the block replaced (or removed when there are no rules). */
export declare function withPrefixRedirects(existing: string | null, rules: PrefixRule[]): string

/** Write the block into `<dist>/.htaccess`; true when the file changed. */
export declare function writePrefixRedirects(dist: string, rules: PrefixRule[], logger?: { info(message: string): void }): Promise<boolean>
