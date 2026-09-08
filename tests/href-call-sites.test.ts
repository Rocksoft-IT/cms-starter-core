import { describe, expect, it } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

// THE TEST THAT WOULD HAVE CAUGHT THE BUG IN THE FIX.
//
// Resolving an editor-typed href to the current locale is not one decision in one function — it is
// a call every component that renders such an href has to make for itself, plus a `locale` that has
// to survive every hop down the component tree. Miss one and NOTHING fails: the link renders,
// answers 200, and quietly serves the default locale's page. The unit tests over `href()`,
// `buildPathIndex` and `hrefContextFor` cannot see that at all; they test functions that are simply
// never called.
//
// The first port of this fix is the proof. It updated Hero.astro's nested renderer and left
// Columns, Tabs, Carousel and ComponentRef dropping the context, so every button inside a column —
// the most common layout there is — kept the bug while the diff looked complete.
//
// So this reads the sources and pins the wiring. It is a structural test, and structural tests are
// blunt: a mention is not a render. That is the right trade here, because the failure it guards is
// an OMISSION, and an omission is exactly what a text scan can see.
const CORE = fileURLToPath(new URL('../core/', import.meta.url))

// One read per file for the whole suite — every group below asks the same ~30 sources.
const sources = new Map<string, string>()
const read = (rel: string) => {
  let src = sources.get(rel)
  if (src === undefined) {
    src = readFileSync(`${CORE}${rel}`, 'utf8')
    sources.set(rel, src)
  }
  return src
}
const blockFiles = readdirSync(`${CORE}blocks/`).filter((f) => f.endsWith('.astro'))

// The one call site that deliberately renders WITHOUT a context, and why. `section_teaser` items
// carry a path the API already resolved for the requested locale — `PagePayload::resolveTeaserItem()`
// stopped reading the default-locale column precisely so these cards keep the reader in their
// language (#1454). Handing that value to a default-locale-KEYED index asks the wrong question: a
// miss today, and a mis-resolution the first time some locale's address collides with another
// page's default-locale one. The rule this pins is the general one — resolve editor-typed hrefs,
// never API-resolved ones — so a new exception needs a line here and a reason.
const CONTEXT_FREE_CALLS: Record<string, string[]> = {
  'SectionTeaser.astro': ['hrefOf(item.path)'],
}

describe('every editor-typed href call site takes a locale context', () => {
  for (const name of blockFiles) {
    const src = read(`blocks/${name}`)
    if (!src.includes('hrefOf(')) continue

    it(`${name} passes hrefCtx to every hrefOf() call`, () => {
      const allowed = CONTEXT_FREE_CALLS[name] ?? []
      const bare = [...src.matchAll(/hrefOf\([^)]*\)/g)]
        .map((m) => m[0])
        .filter((call) => !call.includes('hrefCtx'))
        .filter((call) => !allowed.includes(call))

      expect(bare).toEqual([])
    })

    it(`${name} resolves that context from its own locale`, () => {
      // `hrefContextFor(locale)` and not a prop: the index is build-scoped, so a component asks the
      // accessor for it (core/pathIndex.ts). `locale` is the only thing it cannot work out itself.
      expect(src).toContain('hrefContextFor(locale)')
      expect(src).toMatch(/^\s*locale\?: string$/m)
    })
  }

  it('the context-free allowlist still describes real call sites', () => {
    // A pinned exception that no longer exists is a stale rule, and a stale rule is how the next
    // reader learns the wrong thing about this module.
    for (const [name, calls] of Object.entries(CONTEXT_FREE_CALLS)) {
      for (const call of calls) expect(read(`blocks/${name}`)).toContain(call)
    }
  })
})

// `locale` is the one value still threaded by hand, so every hop that drops it silently un-does the
// fix for everything below that hop. WHICH components need it is derived, not listed: one that
// resolves an href or renders prose needs it, and so does anything that renders one of those. Add a
// link to a block and the requirement extends itself to every block that draws it — the list cannot
// go stale, and a purely presentational child is never asked to carry a prop it has no use for.
describe('every hop hands the locale down', () => {
  const SELF_CLOSING_TAG = new RegExp('<[A-Z][A-Za-z]*[^>]*?/>', 'g')
  const blockSources = new Map(blockFiles.map((name) => [name.replace('.astro', ''), read(`blocks/${name}`)]))

  const childrenOf = (src: string) =>
    (src.match(SELF_CLOSING_TAG) ?? [])
      .map((tag) => ({ tag, name: tag.slice(1).match(/^[A-Za-z]+/)?.[0] ?? '' }))
      .filter((child) => blockSources.has(child.name) || child.name === 'BlockRenderer' || child.name === 'RichText')

  const needsLocale = new Set(
    [...blockSources].filter(([, src]) => /hrefContextFor\(|<RichText|<BlockRenderer/.test(src)).map(([name]) => name),
  )
  for (let grew = true; grew;) {
    grew = false
    for (const [name, src] of blockSources) {
      if (needsLocale.has(name)) continue
      if (childrenOf(src).some((child) => needsLocale.has(child.name))) {
        needsLocale.add(name)
        grew = true
      }
    }
  }

  const parents = [...blockSources].filter(([, src]) => childrenOf(src).length > 0)

  it('finds the components that render another one, so this suite covers something', () => {
    expect(parents.map(([name]) => name).sort()).toEqual([
      'Carousel',
      'Columns',
      'ComponentRef',
      'Faq',
      'Features',
      'Hero',
      'Paragraph',
      'PricingTable',
      'Quote',
      'RichContent',
      'Tabs',
      'Testimonials',
    ])
  })

  for (const [name, src] of parents) {
    it(`${name} hands {locale} to every child that needs it`, () => {
      for (const child of childrenOf(src)) {
        if (child.name !== 'BlockRenderer' && child.name !== 'RichText' && !needsLocale.has(child.name)) continue
        expect(child.tag, `${name} drops the locale on <${child.name}>`).toContain('{locale}')
      }
    })
  }

  it('BlockRenderer still hands a locale to every block it renders', () => {
    expect(read('BlockRenderer.astro')).toMatch(/<Component[^/]*locale=\{loc\}/)
  })

  it('leaves a purely presentational child out of the requirement', () => {
    // HeroBackground draws an image and nothing else; asking it for a locale would be noise.
    expect(needsLocale.has('HeroBackground')).toBe(false)
  })
})

describe('prose resolves its own links', () => {
  it('RichText builds a context from the locale it is given', () => {
    // The links inside an editor's rich-text body never reached href() at all before — they ride
    // inside the HTML string, so no renderer ever saw an href to resolve (lib/html-hrefs.ts).
    const src = read('RichText.astro')
    expect(src).toContain('hrefContextFor(locale)')
    expect(src).toContain('localizeHtmlHrefs(')
  })

  it('Footer resolves its own too — it renders on every page of every locale tree', () => {
    expect(read('Footer.astro')).toContain('hrefContextFor(locale)')
  })
})
