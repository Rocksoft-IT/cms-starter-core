import { getPages } from '../lib/api'
import { canResolve, type HrefLocaleContext, type PathIndex } from '../lib/href'
import { getEffectiveConfig } from './effectiveConfig'
import { buildPathIndex } from './i18n'

/**
 * The cross-locale address index, resolved once per build, for whoever needs it.
 *
 * Memoized module-level like {@see getEffectiveConfig} — and for the same reason. The index is
 * **build-scoped**, not per-render: it is keyed by each page's default-locale address and carries
 * every locale's address for it, so it is the same object for every route of every locale tree.
 * `locale` genuinely varies per render and is a prop (it has been since #1147); this does not, and
 * threading invariant data through `BlockRenderer` into twenty components — and then through each
 * client repo's own page types and layout — would be paying a per-render cost, and a per-client
 * wiring cost, for a value that never changes during a build.
 *
 * That wiring cost is the part that matters. A block reads the index here, so a client repo needs
 * no edit at all to receive this: its page types already pass `locale`, which is the only thing
 * left that a component cannot work out for itself.
 *
 * Built from the DEFAULT locale's page list rather than the locale tree being rendered. The values
 * come from each page's `translations[]`, which covers every enabled locale whichever list the page
 * arrived in, so nothing is lost — and it is strictly more correct: a page routable ONLY in a
 * non-default locale has no default-locale address to be keyed by, and feeding it a locale tree's
 * own list is what would let `pathForLocale`'s `path`/`slug` fallback key it under that locale's
 * address, as if it were the default one.
 */
let memo: Promise<{ defaultLocale: string; pathIndex: PathIndex }> | undefined

export function getPathIndex(): Promise<{ defaultLocale: string; pathIndex: PathIndex }> {
  memo ??= getEffectiveConfig().then(async ({ defaultLocale }) => ({
    defaultLocale,
    // Degrades to an EMPTY index, never to a failed build: with no index every href renders the
    // literal an editor typed, which is exactly what shipped before any of this existed. A link
    // resolution is an improvement on that, so it must never be the thing that fails a build.
    // (`getEffectiveConfig` is deliberately not caught — a rejection there already fails the build
    // by design, #559, and every route awaits it before any block renders.)
    pathIndex: buildPathIndex(await getPages(defaultLocale).catch(() => []), defaultLocale),
  }))

  memo.catch(() => {
    memo = undefined
  })

  return memo
}

/**
 * The locale context for the editor-typed hrefs on a page being rendered for `locale`, or
 * `undefined` when there is nothing to resolve — the default tree, a build whose index came up
 * empty, or a component rendered with no locale at all.
 *
 * `undefined` for the no-op cases is what keeps the degrade honest: `href()` then takes exactly the
 * path it took before this existed, rather than a second code path that merely happens to agree.
 */
export async function hrefContextFor(locale: string | undefined): Promise<HrefLocaleContext | undefined> {
  if (!locale) return undefined

  const { defaultLocale, pathIndex } = await getPathIndex()
  const ctx: HrefLocaleContext = { locale, defaultLocale, pathIndex }

  return canResolve(ctx) && Object.keys(pathIndex).length > 0 ? ctx : undefined
}

/** Test seam: drop the memo so a case can build the index from a different page set. */
export function resetPathIndex(): void {
  memo = undefined
}
