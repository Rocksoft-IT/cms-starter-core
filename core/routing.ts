import type { PageApiItem } from '../lib/api'
import { localePrefix, pathForLocale, uriFromPath } from './i18n'

export interface RoutingContext {
  pages: PageApiItem[]
  branding: unknown
  cta: unknown
  enabledSections: string[] | null
  /** The locale this route tree is being built for. */
  locale: string
  /** The locale that routes at the root, unprefixed. */
  defaultLocale: string
  /**
   * The `pageTypes` registry keys this build can render. Pass it to any component that
   * links to other pages (e.g. a section landing listing its items) so it can share
   * `isRoutable` and never link to a page `buildStaticPaths` dropped.
   */
  registeredTypes: string[]
}

export interface PageTypeConfig {
  /** Lazy component loader — same pattern as BlockLoader */
  component: () => Promise<any>
  /** Shape props for the component. Default: `{ page, branding, cta }`. */
  props?: (page: PageApiItem, ctx: RoutingContext) => Record<string, unknown>
}

export interface ExtraRouteRule {
  /** Collection name that must be enabled via /api/sections for these routes to be included */
  enabledBy?: string | null
  /** Build additional path entries beyond the main pages list */
  buildPaths: (
    pages: PageApiItem[],
    ctx: RoutingContext,
  ) => Array<{
    uri: string
    pageType: string
    props: Record<string, unknown>
  }>
}

export function isEnabled(collection: string | null | undefined, enabledSections: string[] | null): boolean {
  if (enabledSections === null) return true // API error: build all
  if (!collection) return true // no collection: service, builder, landings
  return enabledSections.includes(collection)
}

/**
 * Whether `buildStaticPaths` will emit a route for this page: its type has a `pageTypes`
 * registry entry AND its collection (if any) is enabled via /api/sections. This is THE
 * shared gate — anything that links to other pages (a section landing listing its items)
 * must filter through it, or it links into 404s when a page is dropped from the build
 * (e.g. an unregistered item type — the SMBP incident behind #821).
 *
 * Note: a non-default locale additionally needs `pathForLocale(page, locale) !== null`;
 * callers that build hrefs via `pathForLocale` already apply that by dropping null hrefs.
 */
export function isRoutable(page: PageApiItem, registeredTypes: string[], enabledSections: string[] | null): boolean {
  return registeredTypes.includes(page.type) && isEnabled(page.collection as string | null | undefined, enabledSections)
}

// Set the first time the derivation below runs, so a build says once that it is guessing rather
// than once per landing. Module state: an SSG build is one process, and the tests that assert it
// take a fresh module rather than depending on running first.
let warnedOfDerivedSectionKey = false

/**
 * The key that identifies a LANDING — the string its own items carry in `collection`, and the one
 * `/api/sections` enables it by. Shared for the same reason `isRoutable` is: a landing listing its
 * items must ask this rather than guess, or it silently lists none.
 *
 * A landing's key is NOT its slug. The CMS resolves it three ways (`Page::sectionKeyOf`): a config
 * landing (`blog`, `portfolio`, `glossary`) by its own TYPE, the canonical landing of a landing-less
 * item type by that ITEM TYPE (`service`, at slug `services` — dashboard #522), and every other
 * data-driven `section` by its default-locale slug. Only the last of the three agrees with the slug,
 * which is why comparing against it emptied a Blog landing the moment an editor renamed it: a page
 * that still built and still answered 200, the silent shape of dashboard #2061 one step further in.
 *
 * So the value is READ from the payload — `section_key` on a row of `GET /api/pages` is the CMS's
 * own answer, and the only one that can be right in all three cases. What decides whether to read it
 * is the FIELD'S PRESENCE, never its value: the CMS emits the key on every row and sets it null both
 * for anything that is not a landing and for a landing whose key it could not resolve, and that
 * second null is a decision ("this landing keys nothing"), not an absence.
 *
 * The derivation is therefore reached only by an API that predates the field. It recovers a config
 * landing (its type) and an ordinary data-driven one (its default-locale slug — the same string in
 * every locale, unlike `page.slug`), and CANNOT recover the canonical `service`-at-`services` case,
 * where it returns the slug and is simply wrong. It says so out loud rather than leaving that
 * indistinguishable from a recovered one, because what it produces is an empty listing on a page
 * that still builds — the failure nobody sees.
 *
 * Null means "matches nothing", and a caller must treat it as that rather than as a key of its own:
 * every non-item page carries `collection: null`, so a nullish key that reached the comparison would
 * claim the home page and every standalone page as this landing's items.
 */
export function sectionKeyOf(landing: PageApiItem, defaultLocale: string): string | null {
  if ('section_key' in landing) {
    // Checked, not cast — the payload is untyped JSON. '' never survives the CMS's own normalization
    // and reads as "no key" here for the same reason it does there: it matches no enabled section.
    return typeof landing.section_key === 'string' && landing.section_key !== '' ? landing.section_key : null
  }

  if (landing.type !== 'section') return landing.type

  if (!warnedOfDerivedSectionKey) {
    warnedOfDerivedSectionKey = true
    console.warn(
      '[cms] This API sends no `section_key`, so the key of a data-driven landing is being derived from ' +
        'its default-locale slug. That is right for an ordinary section and WRONG for the canonical ' +
        'landing of a landing-less item type (slug "services", key "service"), which will list none ' +
        'of its items. Update the CMS, or pin this build to the API that answers it.',
    )
  }

  return landing.translations?.find((t) => t.locale === defaultLocale)?.slug || landing.slug || null
}

/**
 * Every route for ONE locale. The caller loops the CMS's enabled locales and concatenates
 * the results (see src/pages/[...uri].astro); each call receives that locale's own page tree
 * from `GET /api/pages?locale=…`.
 *
 * The default locale keeps the bare routes it has always had; every other locale is emitted
 * under its own prefix, taken from the CMS rather than re-derived here (see pathForLocale).
 * Before #559 this built one unprefixed tree, so every non-default URL the CMS advertised —
 * in `translations[]`, in `hreflang`, and above all in the sitemap — 404'd on the built site.
 */
export async function buildStaticPaths(
  pageTypes: Record<string, PageTypeConfig>,
  extraRoutes: ExtraRouteRule[],
  pages: PageApiItem[],
  branding: unknown,
  cta: unknown,
  enabledSections: string[] | null,
  locale: string,
  defaultLocale: string,
): Promise<Array<{ params: { uri?: string }; props: Record<string, unknown> }>> {
  const registeredTypes = Object.keys(pageTypes)
  const ctx: RoutingContext = { pages, branding, cta, enabledSections, locale, defaultLocale, registeredTypes }

  // A page whose type has no registry entry cannot be rendered and is dropped — but never
  // silently: a green build with missing pages surfaces as production 404s (#821). Tally
  // only pages that fell to the registry (enabled-section filtering is intentional).
  const skipped = new Map<string, number>()

  const mainPaths = pages
    .filter((p) => {
      if (isRoutable(p, registeredTypes, enabledSections)) return true
      if (!registeredTypes.includes(p.type) && isEnabled(p.collection as string | null | undefined, enabledSections)) {
        skipped.set(p.type, (skipped.get(p.type) ?? 0) + 1)
      }
      return false
    })
    .map((p) => {
      const config = pageTypes[p.type]! // registration proven by isRoutable above
      // The locale's own address for this page, already carrying its locale prefix and any
      // section prefix. A page with no address in this locale (a singleton with no segment)
      // yields null and is skipped rather than colliding with another route at the root.
      const path = pathForLocale(p, locale, defaultLocale)
      if (path === null && locale !== defaultLocale) return null

      // The home singleton has `path: null` in the default locale and routes at the site
      // root; Astro rest routes ([...uri]) match "/" only when uri is undefined, never "".
      const uri = uriFromPath(path ?? (p.slug ? `/${p.slug}` : null))
      const shapeProps = config.props ?? ((page, c) => ({ page, branding: c.branding, cta: c.cta, locale: c.locale }))
      // `defaultLocale` rides along with `locale` on every route, unconditionally: a component
      // deciding URL shape (a locale-aware home link, a section's default-locale key) needs both,
      // and threading it through each pageTypes[...].props shaper instead would mean every site
      // remembering to add it to its own config.
      return {
        params: { uri },
        props: { pageType: p.type, locale, defaultLocale, path, ...shapeProps(p, ctx) },
      }
    })
    .filter((x): x is NonNullable<typeof x> => x !== null)

  for (const [type, count] of skipped) {
    console.warn(
      `[cms] Skipped ${count} page(s) of unregistered page type "${type}" (locale "${locale}") — ` +
        `their URLs will 404. Register the type in cms.config.ts \`pageTypes\` ` +
        `(a section's item type is \`meta.section.item_type\` in the CMS, e.g. "post").`,
    )
  }

  // A project's derived routes (e.g. a blog's category pages) are built from this locale's
  // pages and are locale-agnostic by construction, so core — not each rule — applies the
  // prefix. A rule that never heard of locales therefore cannot emit an unprefixed duplicate.
  const prefix = localePrefix(locale, defaultLocale)
  const extraPaths = extraRoutes.flatMap((rule) => {
    if (rule.enabledBy && !isEnabled(rule.enabledBy, enabledSections)) return []
    return rule.buildPaths(pages, ctx).map(({ uri, pageType, props }) => {
      const path = `${prefix}/${(uri ?? '').replace(/^\//, '')}`
      // `path` is handed to the template alongside the route, because a derived route has no
      // CMS page carrying one and its canonical would otherwise be built from the unprefixed
      // uri — a canonical pointing at another locale's page. A rule may still override it.
      return {
        params: { uri: uriFromPath(path) },
        props: { pageType, locale, defaultLocale, path, ...props },
      }
    })
  })

  const all = [...mainPaths, ...extraPaths]
  warnOnDuplicateUris(all, locale)

  return all
}

/**
 * Two routes claiming one `uri` is not an error Astro reports: it emits one output file and the
 * other route is silently dropped, so a page vanishes from a build that still says `completed`.
 *
 * That is how the CMS's split slug-uniqueness checks surfaced (#1066) — a `page` and a `section`
 * landing both holding `fundusze-kpo`, one of them gone from the built site with no signal
 * anywhere. The CMS now rejects the collision at write time, but the build stays the last line of
 * defence: pre-existing duplicates are deliberately still saveable there, and a derived route
 * (`extraRoutes`) can land on a page's address without the CMS ever seeing it.
 *
 * Same treatment as the unregistered-type warning above (#821): report, do not throw. A build that
 * fails outright over stale content an editor has not fixed yet is worse than one that says which
 * page it dropped.
 */
function warnOnDuplicateUris(
  paths: Array<{ params: { uri?: string }; props: Record<string, unknown> }>,
  locale: string,
): void {
  const seen = new Map<string, string[]>()

  for (const { params, props } of paths) {
    // Normalized, because the two sources spell the same route differently: a page's uri comes
    // from the API's `path` (`/kontakt/` → `kontakt/`) and a derived route's from a rule's bare
    // `uri` (`kontakt`). The starter ships `trailingSlash: 'always'`, so both are one route and a
    // raw key would miss exactly the collision that is hardest to spot by reading the config.
    // The home route's uri is `undefined` — a legitimate single route, keyed as '' so it is still
    // reported if something else also claims the site root.
    const key = (params.uri ?? '').replace(/^\/+|\/+$/g, '')
    seen.set(key, [...(seen.get(key) ?? []), String(props.pageType ?? 'unknown')])
  }

  for (const [uri, types] of seen) {
    if (types.length < 2) continue
    console.warn(
      `[cms] ${types.length} routes resolve to "/${uri}" (locale "${locale}") from page types ` +
        `${types.map((t) => `"${t}"`).join(', ')} — only one will be built, the rest are dropped ` +
        `and will 404. Give each page its own slug in the CMS (\`php artisan cms:audit-duplicate-paths\`).`,
    )
  }
}
