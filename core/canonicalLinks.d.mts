// Types for canonicalLinks.mjs. Keep the two in sync by hand; tests/declarations.test.ts asserts
// the export lists match.

type IsPage = (route: string) => boolean

/** `example.com` and `www.example.com`, whichever of the two `site` names. */
export declare function siteHosts(site: string | URL | undefined | null): Set<string>

/** The page's own address for `value`, or null to leave the href as written. */
export declare function canonicalHref(value: string, hosts: Set<string>, isPage: IsPage): string | null

/** `html` with every internal `<a href>` rewritten, and how many changed. */
export declare function canonicalizeHtmlLinks(
  html: string,
  hosts: Set<string>,
  isPage: IsPage,
): { html: string; changed: number }

/** Rewrite every HTML file under `dist`; the number of links changed. */
export declare function writeCanonicalLinks(
  dist: string,
  site: string | URL | undefined | null,
  logger?: { info(message: string): void },
): Promise<number>
