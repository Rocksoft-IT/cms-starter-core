import { beforeEach, describe, expect, test, vi } from 'vitest'
import type { SiteSettingsData } from '../lib/api'
import {
  CUSTOM_CODE_ACTIVATOR_JS,
  emitsCustomCodeActivator,
  readCustomCode,
  resetCustomCodeWarnings,
  resolveCustomCode,
  warnAboutCustomCode,
} from '../core/customCode'

// dashboard #1805. The custom-code field is the one payload in this stack whose CONTENT is raw
// operator-authored JavaScript, so the only thing standing between a pasted snippet and every
// visitor is this resolver. The cases that matter are all refusals.

const settings = (extra: Partial<SiteSettingsData> = {}): SiteSettingsData => ({
  cookie_consent: { enabled: false, privacy_page_id: null },
  integrations: {},
  ...extra,
})

const snippet = (over: Record<string, unknown> = {}) => ({
  placement: 'head',
  code: '<script>window.x = 1</script>',
  consent: 'necessary',
  ...over,
})

describe('readCustomCode', () => {
  test('reads well-formed rows through unchanged', () => {
    expect(readCustomCode(settings({ custom_scripts: [snippet()] }))).toEqual([
      { placement: 'head', code: '<script>window.x = 1</script>', consent: 'necessary' },
    ])
  })

  test.each([
    ['a missing payload', undefined],
    ['a non-array payload from an older panel', {} as never],
  ])('resolves %s to no snippets', (_label, custom_scripts) => {
    expect(readCustomCode(settings({ custom_scripts: custom_scripts as never }))).toEqual([])
  })

  test.each([
    ['a blank code', snippet({ code: '   ' })],
    ['a non-string code', snippet({ code: 42 })],
    ['an unreadable placement', snippet({ placement: 'sidebar' })],
    ['a missing placement', { code: '<script></script>', consent: 'necessary' }],
  ])('drops a row with %s rather than guessing', (_label, row) => {
    expect(readCustomCode(settings({ custom_scripts: [row as never] }))).toEqual([])
  })

  // The safety direction of the default: an unreadable category must cost the snippet its
  // unconditional emit, never buy it one.
  test('treats an unreadable consent category as marketing, not as necessary', () => {
    const [read] = readCustomCode(settings({ custom_scripts: [snippet({ consent: 'nonsense' })] }))

    expect(read.consent).toBe('marketing')
  })
})

describe('resolveCustomCode', () => {
  test('emits a necessary snippet in place, on a client with no banner at all', () => {
    const resolved = resolveCustomCode(settings({ custom_scripts: [snippet()] }), 'head')

    expect(resolved.immediate).toHaveLength(1)
    expect(resolved.gated).toHaveLength(0)
    expect(resolved.dropped).toHaveLength(0)
  })

  test('holds a statistics snippet behind the gate when the banner is on', () => {
    const resolved = resolveCustomCode(
      settings({
        custom_scripts: [snippet({ consent: 'statistics' })],
        cookie_consent: { enabled: true, privacy_page_id: null },
      }),
      'head',
    )

    expect(resolved.gated).toHaveLength(1)
    expect(resolved.immediate).toHaveLength(0)
  })

  // The finding this whole gate exists for: custom code is the escape hatch AROUND the typed,
  // consent-gated Google providers, so pasting a GTM container here must not become a supported
  // way to track every visitor of a client that never turned consent on.
  test.each(['statistics', 'marketing'])(
    'refuses to ship a %s snippet when the client has no consent banner to grant it',
    (consent) => {
      const resolved = resolveCustomCode(settings({ custom_scripts: [snippet({ consent })] }), 'head')

      expect(resolved.immediate).toHaveLength(0)
      expect(resolved.gated).toHaveLength(0)
      expect(resolved.dropped).toHaveLength(1)
      expect(resolved.dropped[0].reason).toContain('cookie consent is off')
    },
  )

  test('answers only for the placement it was asked about', () => {
    const both = settings({
      custom_scripts: [snippet(), snippet({ placement: 'body', code: '<script>window.y = 1</script>' })],
    })

    expect(resolveCustomCode(both, 'head').immediate).toHaveLength(1)
    expect(resolveCustomCode(both, 'body').immediate[0].code).toContain('window.y')
  })
})

describe('emitsCustomCodeActivator', () => {
  const gated = (placement: string) =>
    settings({
      custom_scripts: [snippet({ placement, consent: 'statistics' })],
      cookie_consent: { enabled: true, privacy_page_id: null },
    })

  // The activator scans the whole document and self-latches on window.__cmsCustomCode, so a second
  // copy is dead bytes - and it embeds the whole of CONSENT_SIGNALS_JS, so they are not few.
  test.each(['head', 'body'])('emits once for a client whose only gated snippet is in <%s>', (where) => {
    expect(emitsCustomCodeActivator(gated(where), 'head')).toBe(true)
    expect(emitsCustomCodeActivator(gated(where), 'body')).toBe(false)
  })

  test('emits once, not twice, when both placements are gated', () => {
    const both = settings({
      custom_scripts: [
        snippet({ placement: 'head', consent: 'statistics' }),
        snippet({ placement: 'body', consent: 'marketing' }),
      ],
      cookie_consent: { enabled: true, privacy_page_id: null },
    })

    expect([emitsCustomCodeActivator(both, 'head'), emitsCustomCodeActivator(both, 'body')].filter(Boolean)).toHaveLength(1)
  })

  test.each([
    ['nothing is gated', settings({ custom_scripts: [snippet()] })],
    ['nothing is stored', settings()],
    // Refused outright, so there is nothing for the activator to activate.
    ['the gated snippet was dropped for having no banner', settings({ custom_scripts: [snippet({ consent: 'marketing' })] })],
  ])('ships no activator at all when %s', (_label, stored) => {
    expect(emitsCustomCodeActivator(stored, 'head')).toBe(false)
    expect(emitsCustomCodeActivator(stored, 'body')).toBe(false)
  })
})

describe('warnAboutCustomCode', () => {
  beforeEach(() => resetCustomCodeWarnings())

  test('names a dropped snippet once per placement', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const resolved = resolveCustomCode(
      settings({ custom_scripts: [snippet({ consent: 'marketing' })] }),
      'head',
    )

    warnAboutCustomCode(resolved, 'head')
    warnAboutCustomCode(resolved, 'head')

    expect(warn.mock.calls.filter(([m]) => String(m).includes('NOT shipped'))).toHaveLength(1)
    warn.mockRestore()
  })

  test('says out loud that a necessary snippet ships before any consent', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})

    const stored = settings({ custom_scripts: [snippet({ placement: 'body' })] })

    warnAboutCustomCode(resolveCustomCode(stored, 'body'), 'body')

    expect(warn).toHaveBeenCalledWith(expect.stringContaining('before any consent'))
    warn.mockRestore()
  })
})

// The raw JS interpolated into CustomCode.astro's own <script> tag. Running it needs a real
// browser (a live <template>, script "already started" semantics, DOMContentLoaded) which this
// project's unit suite deliberately does not provide — see the same note on CONSENT_SIGNALS_JS in
// analytics.test.ts. These pin the SOURCE: every string below is a contract with markup rendered
// somewhere else, so dropping one would still typecheck, still build, and only show up as a
// consented snippet that silently never runs.
//
// To watch it work, build with `ASTRO_MOCK_CUSTOM_CODE=1 ASTRO_MOCK_CONSENT=1` and accept the
// banner — see src/fixtures/index.ts.
describe('CUSTOM_CODE_ACTIVATOR_JS', () => {
  test('selects the same attribute CustomCode.astro renders on a gated snippet', () => {
    expect(CUSTOM_CODE_ACTIVATOR_JS).toContain('template[data-cms-custom-code]')
  })

  test('reads the visitor choice through the shared consent reader, not its own cookie parse', () => {
    expect(CUSTOM_CODE_ACTIVATOR_JS).toMatch(/function readCookieConsent\(\)/)
    expect(CUSTOM_CODE_ACTIVATOR_JS).toContain('activate(readCookieConsent())')
  })

  test('listens for the event CookieConsent.astro fires on a decision', () => {
    expect(CUSTOM_CODE_ACTIVATOR_JS).toContain("addEventListener('cms:consent'")
  })

  // The subtle half: a <script> parsed inside a <template> is flagged "already started" and never
  // runs. Losing this replacement turns every gated snippet into dead markup that still LOOKS
  // activated in the DOM.
  test('re-creates each script node rather than moving it', () => {
    expect(CUSTOM_CODE_ACTIVATOR_JS).toContain("document.createElement('script')")
    expect(CUSTOM_CODE_ACTIVATOR_JS).toContain('replaceChild')
  })

  test('activates a template at most once, and only for a granted category', () => {
    expect(CUSTOM_CODE_ACTIVATOR_JS).toContain('data-cms-activated')
    expect(CUSTOM_CODE_ACTIVATOR_JS).toContain("v[tpl.getAttribute('data-cms-custom-code')]")
  })

  test('waits for the document when the head copy runs first', () => {
    expect(CUSTOM_CODE_ACTIVATOR_JS).toContain("document.readyState === 'loading'")
    expect(CUSTOM_CODE_ACTIVATOR_JS).toContain("addEventListener('DOMContentLoaded'")
  })
})
