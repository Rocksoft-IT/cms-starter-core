import { describe, it, expect, vi, afterEach } from 'vitest'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { cmsFonts, toFontFamilies, BRAND_FONT_CSS_VARIABLE, BODY_FONT_CSS_VARIABLE } from '../core/fonts.mjs'

// dashboard #1485 — the client's brand font has to survive the trip from /api/branding into
// `config.fonts`, and NOTHING about it may take a deploy down. Both halves are covered here
// because neither is visible in a build log: a dropped family looks exactly like "no font set",
// which is also the correct outcome for most clients.
//
// The provider is a stub throughout. The real one is Astro's Google provider, whose only job in
// this hook is to be handed back untouched — exercising it would mean a network call, which is
// the one thing the drop-bunny-font-fetch change took out of this repo's CI.
const PROVIDER = { name: 'google-stub' }

/** What GET /api/branding returns for a client that has picked Courier Prime and no body face. */
function branding(
  primary: unknown = { family: 'Courier Prime', weights: [400, 700], fallbacks: ['ui-monospace', 'monospace'], provider: 'google' },
  body: unknown = null,
) {
  return { brand_name: 'Example', fonts: { primary, body } }
}

/** A body-face payload, the shape BrandFonts::resolve() publishes it in. */
const INTER_BODY = { family: 'Inter', weights: [400, 600, 700], fallbacks: ['ui-sans-serif', 'system-ui', 'sans-serif'], provider: 'google' }

/** The same role as a VARIABLE family: the whole axis beside the discrete list (#1549). */
const INTER_VARIABLE = { ...INTER_BODY, weight_range: '100 900' }

describe('toFontFamilies()', () => {
  it('maps the CMS payload onto an Astro font family', () => {
    expect(toFontFamilies(branding(), PROVIDER)).toEqual([
      {
        provider: PROVIDER,
        name: 'Courier Prime',
        cssVariable: '--font-primary',
        weights: [400, 700],
        fallbacks: ['ui-monospace', 'monospace'],
        subsets: ['latin', 'latin-ext'],
        styles: ['normal'],
      },
    ])
  })

  it('registers the variable core actually reads', () => {
    // The other half of this contract is a string in uno.core.ts — `font-brand` resolves
    // `var(--font-primary, inherit)`. Renaming one side silently unstyles every heading.
    expect(BRAND_FONT_CSS_VARIABLE).toBe('--font-primary')
    expect(toFontFamilies(branding(), PROVIDER)[0].cssVariable).toBe('--font-primary')
  })

  it('maps both roles onto their own variable, in registration order', () => {
    // dashboard #1521 — one token could not retire a single site's Google Fonts <link>, because
    // every site still making one uses a display face AND a body face.
    const families = toFontFamilies(branding(undefined, INTER_BODY), PROVIDER)

    expect(families.map((f) => f.cssVariable)).toEqual(['--font-primary', '--font-body'])
    expect(families.map((f) => f.name)).toEqual(['Courier Prime', 'Inter'])
    expect(BODY_FONT_CSS_VARIABLE).toBe('--font-body')
  })

  it('takes each role on its own', () => {
    // A client may set either alone, and a garbled one must not cost the other: the two are
    // independent editor choices, and nothing about one implies the other.
    expect(toFontFamilies(branding(null, INTER_BODY), PROVIDER).map((f) => f.cssVariable)).toEqual(['--font-body'])
    expect(toFontFamilies(branding(undefined, { family: '  ' }), PROVIDER).map((f) => f.cssVariable)).toEqual([
      '--font-primary',
    ])
  })

  it('registers one family twice when both roles name it', () => {
    // Likely in practice — one family, two roles. Astro keys a family by cssVariable + name +
    // provider, so two entries are two variables over one cached download, not a collision.
    const families = toFontFamilies(branding(INTER_BODY, INTER_BODY), PROVIDER)

    expect(families.map((f) => f.name)).toEqual(['Inter', 'Inter'])
    expect(families.map((f) => f.cssVariable)).toEqual(['--font-primary', '--font-body'])
  })

  it('registers a variable family as its whole axis, not as the listed weights', () => {
    // dashboard #1549 — Google returns the same file for `wght@400;600;700` as for `wght@100..900`,
    // so the discrete list only fences the browser off from weights the file already carries.
    const [family] = toFontFamilies(branding(INTER_VARIABLE), PROVIDER)

    expect(family.weights).toEqual(['100 900'])
  })

  it('keeps the discrete list for a static family and for an older backend', () => {
    // The 9 static families in the catalog, where a range WOULD expand to every instance in it —
    // and any payload from a backend that predates the field.
    expect(toFontFamilies(branding(INTER_BODY), PROVIDER)[0].weights).toEqual([400, 600, 700])
    expect(toFontFamilies(branding({ ...INTER_BODY, weight_range: null }), PROVIDER)[0].weights).toEqual([400, 600, 700])
  })

  it('ignores a weight range it cannot read as one', () => {
    // Two numbers and a space is the whole grammar unifont accepts; anything else would reach
    // Google as a family it does not publish and cost the client its font.
    for (const bad of ['100..900', '100', 'thin bold', '', ' ', 100]) {
      expect(toFontFamilies(branding({ ...INTER_BODY, weight_range: bad }), PROVIDER)[0].weights).toEqual([400, 600, 700])
    }
  })

  it('answers nothing for a client that has set no font', () => {
    // The common case, and the one that has to keep rendering exactly as it did before #1485.
    expect(toFontFamilies(branding(null), PROVIDER)).toEqual([])
    expect(toFontFamilies({ brand_name: 'Example' }, PROVIDER)).toEqual([])
    expect(toFontFamilies({ brand_name: 'Example', fonts: null }, PROVIDER)).toEqual([])
    expect(toFontFamilies(null, PROVIDER)).toEqual([])
    expect(toFontFamilies([], PROVIDER)).toEqual([])
    expect(toFontFamilies('nope', PROVIDER)).toEqual([])
  })

  it('drops a family whose name is missing or blank', () => {
    expect(toFontFamilies(branding({ family: '   ', weights: [400] }), PROVIDER)).toEqual([])
    expect(toFontFamilies(branding({ weights: [400] }), PROVIDER)).toEqual([])
  })

  it('refuses a provider it does not implement', () => {
    // A future self-hosted-upload provider must not silently resolve through Google's and fetch
    // a same-named family from the wrong place.
    expect(toFontFamilies(branding({ family: 'Courier Prime', provider: 'uploads' }), PROVIDER)).toEqual([])
  })

  it('falls back to Astro-shaped defaults for a payload with no weights or fallbacks', () => {
    // What a panel older than the weight/fallback fields would answer. A plain regular face is a
    // worse font, not a broken site.
    const [family] = toFontFamilies(branding({ family: 'Inter' }), PROVIDER)

    expect(family.weights).toEqual([400])
    expect(family).not.toHaveProperty('fallbacks')
  })

  it('sorts, de-duplicates and discards nonsense weights', () => {
    const [family] = toFontFamilies(
      branding({ family: 'Inter', weights: [700, 400, 700, 0, 1200, 'bold', null] }),
      PROVIDER,
    )

    expect(family.weights).toEqual([400, 700])
  })

  it('always asks for latin-ext', () => {
    // Polish diacritics and German umlauts live there. Without it, text falls back mid-word.
    expect(toFontFamilies(branding(), PROVIDER)[0].subsets).toEqual(['latin', 'latin-ext'])
  })

  it('asks for upright faces only', () => {
    // Astro would otherwise download an italic of every weight and subset — twice the files, for
    // a style a heading face is never asked for.
    expect(toFontFamilies(branding(), PROVIDER)[0].styles).toEqual(['normal'])
  })
})

describe('cmsFonts()', () => {
  const setup = cmsFonts({ provider: PROVIDER }).hooks['astro:config:setup']!
  type SetupArgs = Parameters<typeof setup>[0]

  function hookArgs(command = 'build', fonts?: unknown[]) {
    const updates: Record<string, unknown>[] = []
    const logger = { info: vi.fn(), warn: vi.fn() }

    // Only the members the hook touches — same cast, and same reasoning, as redirects.test.ts.
    const args = {
      command,
      // A real Astro root with no .env or fixtures in it, so the hook's own inputs are the only
      // thing under test.
      config: { root: pathToFileURL(join(tmpdir(), 'cms-fonts-test/')), fonts },
      updateConfig: (config: Record<string, unknown>) => updates.push(config),
      logger,
    } as unknown as SetupArgs

    return { updates, logger, args }
  }

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.unstubAllEnvs()
  })

  function stubEnv() {
    vi.stubEnv('ASTRO_API_MOCK', '')
    vi.stubEnv('ASTRO_API_URL', 'https://cms.example.test')
    vi.stubEnv('ASTRO_API_TOKEN', 'token')
  }

  /** Branding first, then the Google preflight — the two calls the hook makes, in order. */
  function stubFetch(...responses: Array<() => Response | Promise<Response>>) {
    // The `url` parameter is declared even though the stub ignores it: it is what types
    // `fetch.mock.calls[n][0]`, which the preflight test asserts on.
    const fetch = vi.fn(async (_url: string) => (responses.shift() ?? (() => new Response('', { status: 500 })))())
    vi.stubGlobal('fetch', fetch)
    return fetch
  }

  const ok = () => Response.json({ success: true, data: branding() })
  const servable = () => new Response('@font-face{}', { status: 200 })

  it('registers the font the CMS names', async () => {
    stubEnv()
    stubFetch(ok, servable)

    const { updates, args } = hookArgs()
    await setup(args)

    expect(updates).toEqual([
      {
        fonts: [
          {
            provider: PROVIDER,
            name: 'Courier Prime',
            cssVariable: '--font-primary',
            weights: [400, 700],
            fallbacks: ['ui-monospace', 'monospace'],
            subsets: ['latin', 'latin-ext'],
            styles: ['normal'],
          },
        ],
      },
    ])
  })

  it('preflights the family with the weights it is about to request', async () => {
    stubEnv()
    const fetch = stubFetch(ok, servable)

    await setup(hookArgs().args)

    expect(fetch.mock.calls[1][0]).toBe(
      'https://fonts.googleapis.com/css2?family=Courier+Prime:wght@400;700&display=swap',
    )
  })

  it('preflights a variable family as a range, in the form css2 accepts', async () => {
    // `100..900`, not `100 900` and not a sorted list — dashboard #1549. Getting this wrong asks
    // Google for a family it does not publish, and the preflight then drops the font entirely.
    stubEnv()
    const fetch = stubFetch(() => Response.json({ success: true, data: branding(INTER_VARIABLE) }), servable)

    await setup(hookArgs().args)

    expect(fetch.mock.calls[1][0]).toBe('https://fonts.googleapis.com/css2?family=Inter:wght@100..900&display=swap')
  })

  it('builds without the font when Google will not serve it', async () => {
    // The acceptance criterion of #1485: an unreachable or unknown family logs and falls back,
    // and the build still succeeds. This is the layer that makes a firewalled build host — the
    // realistic case — a site in its fallback stack rather than a failed deploy.
    stubEnv()
    stubFetch(ok, () => new Response('', { status: 400, statusText: 'Bad Request' }))

    const { updates, logger, args } = hookArgs()
    await setup(args)

    expect(updates).toEqual([])
    expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('Courier Prime'))
  })

  it('builds without a font when the branding fetch fails', async () => {
    stubEnv()
    stubFetch(() => new Response('', { status: 500, statusText: 'Server Error' }))

    const { updates, logger, args } = hookArgs()
    await setup(args)

    expect(updates).toEqual([])
    expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('building without a CMS brand font'))
  })

  it('registers both roles, preflighting each on its own', async () => {
    // dashboard #1521. Two families, two preflights, two variables — and the order the roles are
    // declared in, which is what decides nothing here but is asserted so a reshuffle is visible.
    stubEnv()
    const fetch = stubFetch(() => Response.json({ success: true, data: branding(undefined, INTER_BODY) }), servable, servable)

    const { updates, args } = hookArgs()
    await setup(args)

    const registered = updates[0].fonts as Array<Record<string, unknown>>
    expect(registered.map((f) => f.cssVariable)).toEqual(['--font-primary', '--font-body'])
    expect(fetch.mock.calls[1][0]).toBe('https://fonts.googleapis.com/css2?family=Courier+Prime:wght@400;700&display=swap')
    expect(fetch.mock.calls[2][0]).toBe('https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700&display=swap')
  })

  it('keeps the role Google will serve when the other one it will not', async () => {
    // The failure that matters most: a retired family in ONE role (taeles' "Fredoka One") must
    // not cost the site the face that is still published.
    stubEnv()
    stubFetch(
      () => Response.json({ success: true, data: branding(undefined, INTER_BODY) }),
      () => new Response('', { status: 400, statusText: 'Bad Request' }),
      servable,
    )

    const { updates, logger, args } = hookArgs()
    await setup(args)

    const registered = updates[0].fonts as Array<Record<string, unknown>>
    expect(registered.map((f) => f.name)).toEqual(['Inter'])
    expect(registered[0].cssVariable).toBe('--font-body')
    expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('Courier Prime'))
  })

  it('does not preflight — or register — when the client has no font', async () => {
    stubEnv()
    const fetch = stubFetch(() => Response.json({ success: true, data: branding(null) }))

    const { updates, logger, args } = hookArgs()
    await setup(args)

    expect(updates).toEqual([])
    expect(fetch).toHaveBeenCalledTimes(1)
    expect(logger.warn).not.toHaveBeenCalled()
  })

  it("adds to a site's own fonts rather than replacing them", async () => {
    // `updateConfig` concatenates arrays, so the site's entries survive and this one lands after
    // them — and Astro resolves the LAST registration for a cssVariable, so the panel's choice
    // overrides a site-level --font-primary, exactly as /api/branding overrides brand.colors.
    stubEnv()
    stubFetch(ok, servable)

    const own = { name: 'Local Face', cssVariable: '--font-primary' }
    const { updates, args } = hookArgs('build', [own])
    await setup(args)

    const added = updates[0].fonts as Array<Record<string, unknown>>
    expect(added).toHaveLength(1)
    expect(added[0].name).toBe('Courier Prime')
    expect(added).not.toContain(own)
  })

  it('does nothing on a command that emits no routes', async () => {
    // `astro check` runs a sync; without this guard, type-checking in CI would call the CMS —
    // and then Google.
    stubEnv()
    const fetch = stubFetch(ok, servable)

    const { updates, args } = hookArgs('sync')
    await setup(args)

    expect(updates).toEqual([])
    expect(fetch).not.toHaveBeenCalled()
  })

  it('reads the mock fixture instead of the API on a mock build', async () => {
    // ASTRO_API_MOCK=1 has no backend by definition. The starter's fixture names no font, so
    // `pnpm build:mock` — what CI runs — makes no request at all.
    vi.stubEnv('ASTRO_API_MOCK', '1')
    const fetch = stubFetch(ok, servable)

    const { updates, args } = hookArgs()
    await setup(args)

    expect(updates).toEqual([])
    expect(fetch).not.toHaveBeenCalled()
  })

  it('warns rather than throwing when credentials are missing', async () => {
    vi.stubEnv('ASTRO_API_MOCK', '')
    vi.stubEnv('ASTRO_API_URL', '')
    vi.stubEnv('ASTRO_API_TOKEN', '')

    const { updates, logger, args } = hookArgs()
    await setup(args)

    expect(updates).toEqual([])
    expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('ASTRO_API_URL'))
  })
})
