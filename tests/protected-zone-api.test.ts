import { describe, expect, test, vi } from 'vitest'
import {
  createZoneApi,
  isAcceptablePassword,
  linksDeadline,
  normalizeZoneEndpoint,
  resetTokenFrom,
  retryMinutes,
  safeZoneHref,
  type ZoneError,
} from '../core/protected-zone/api'

// The zone API's HTTP contract, mapped onto the one typed result per message the page shows, via a
// fake `fetch`. A wrong mapping reads to a visitor as the wrong message — "account blocked" for a
// typo'd password, or "network error" for a session that simply expired.

const ENDPOINT = 'https://cms.example.test/api/zone'

const json = (status: number, body: unknown, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', ...headers } })

function apiAnswering(response: Response | Error) {
  const fetchImpl = vi.fn(async (_url: string | URL | Request, _init?: RequestInit) => {
    if (response instanceof Error) throw response
    return response
  })
  return { api: createZoneApi(ENDPOINT, fetchImpl as unknown as typeof fetch), fetchImpl }
}

async function loginError(response: Response | Error): Promise<ZoneError | null> {
  const result = await apiAnswering(response).api.login('jkowalski', 'secret')
  return result.ok ? null : result.error
}

describe('login()', () => {
  test('a 200 is the token and the account, in the contract’s shape', async () => {
    const { api, fetchImpl } = apiAnswering(
      json(200, {
        token: 't0k3n',
        expires_at: '2026-09-25T18:00:00+00:00',
        idle_timeout_seconds: 3600,
        user: { name: 'Jan Kowalski', login: 'jkowalski' },
      }),
    )

    const result = await api.login('jkowalski', 'secret')

    expect(result).toEqual({
      ok: true,
      value: {
        token: 't0k3n',
        expiresAt: '2026-09-25T18:00:00+00:00',
        idleTimeoutSeconds: 3600,
        user: { name: 'Jan Kowalski', login: 'jkowalski' },
      },
    })

    const [url, init] = fetchImpl.mock.calls[0]!
    expect(url).toBe(`${ENDPOINT}/login`)
    expect(init?.method).toBe('POST')
    expect(JSON.parse(String(init?.body))).toEqual({ login: 'jkowalski', password: 'secret' })
    // Cross-site: no cookie may ride along, and a list of signed links must never come from cache.
    expect(init?.credentials).toBe('omit')
    expect(init?.cache).toBe('no-store')
    expect((init?.headers as Record<string, string>)['Content-Type']).toBe('application/json')
  })

  test.each([
    [401, { error: 'invalid_credentials' }, { kind: 'invalid_credentials' }],
    // A login over 191 characters — for the visitor, a mistyped credential like any other.
    [422, { error: 'invalid_request' }, { kind: 'invalid_credentials' }],
    [403, { error: 'account_blocked' }, { kind: 'account_blocked' }],
    // The same status from the origin gate: this site is not a domain of any client, which is the
    // zone being unavailable — NOT the visitor's account being blocked.
    [403, { error: 'forbidden_origin' }, { kind: 'zone_unavailable' }],
    [404, { error: 'zone_unavailable' }, { kind: 'zone_unavailable' }],
    [500, { message: 'Server Error' }, { kind: 'network' }],
  ])('HTTP %i %j → %j', async (status, body, expected) => {
    expect(await loginError(json(status, body))).toEqual(expected)
  })

  test('429 carries the wait, from the body first, then the Retry-After header', async () => {
    expect(await loginError(json(429, { error: 'too_many_attempts', retry_after: 540 }))).toEqual({
      kind: 'too_many_attempts',
      retryAfter: 540,
    })
    expect(await loginError(json(429, { error: 'too_many_attempts' }, { 'Retry-After': '120' }))).toEqual({
      kind: 'too_many_attempts',
      retryAfter: 120,
    })
    // Neither: a wait is still announced rather than "try now".
    const bare = await loginError(json(429, {}))
    expect(bare?.kind).toBe('too_many_attempts')
    expect(bare && 'retryAfter' in bare && bare.retryAfter).toBeGreaterThan(0)
  })

  test('a rejected fetch — offline, or a CORS refusal the browser reports as one — is `network`', async () => {
    expect(await loginError(new TypeError('Failed to fetch'))).toEqual({ kind: 'network' })
  })

  test('a 200 that is not the contract’s JSON is not a session', async () => {
    expect(await loginError(new Response('<html>proxy error</html>', { status: 200 }))).toEqual({ kind: 'network' })
    expect(await loginError(json(200, { token: '', user: { login: 'x' } }))).toEqual({ kind: 'network' })
  })
})

describe('documents()', () => {
  const payload = {
    user: { name: null, login: 'jkowalski' },
    expires_at: '2026-09-25T18:00:00+00:00',
    links_expire_at: '2026-09-25T10:10:00+00:00',
    documents: [
      {
        id: 12,
        title: 'Akt notarialny — ul. Mickiewicza 3',
        description: null,
        document_date: '2024-02-15',
        file_name: 'akt-mickiewicza-3.pdf',
        mime_type: 'application/pdf',
        size: 1289011,
        updated_at: '2026-09-20T08:00:00+00:00',
        view_url: `${ENDPOINT}/documents/12/file?disposition=inline`,
        download_url: `${ENDPOINT}/documents/12/file?disposition=attachment`,
      },
      // A row without the fields a row needs is dropped, not rendered as "undefined".
      { id: 13 },
    ],
  }

  test('sends the bearer token and maps the list', async () => {
    const { api, fetchImpl } = apiAnswering(json(200, payload))

    const result = await api.documents('t0k3n')

    const [url, init] = fetchImpl.mock.calls[0]!
    expect(url).toBe(`${ENDPOINT}/documents`)
    expect((init?.headers as Record<string, string>).Authorization).toBe('Bearer t0k3n')
    expect(result.ok && result.value.linksExpireAt).toBe('2026-09-25T10:10:00+00:00')
    expect(result.ok && result.value.user).toEqual({ name: null, login: 'jkowalski' })
    expect(result.ok && result.value.documents).toEqual([
      {
        id: 12,
        title: 'Akt notarialny — ul. Mickiewicza 3',
        description: null,
        documentDate: '2024-02-15',
        fileName: 'akt-mickiewicza-3.pdf',
        mimeType: 'application/pdf',
        size: 1289011,
        viewUrl: `${ENDPOINT}/documents/12/file?disposition=inline`,
        downloadUrl: `${ENDPOINT}/documents/12/file?disposition=attachment`,
      },
    ])
  })

  test('carries links_expire_in and the local instant the response arrived', async () => {
    const fetchImpl = vi.fn(async () => json(200, { ...payload, links_expire_in: 600 }))
    const api = createZoneApi(ENDPOINT, fetchImpl as unknown as typeof fetch, () => 1_000_000)

    const result = await api.documents('t0k3n')

    expect(result.ok && result.value.linksExpireIn).toBe(600)
    expect(result.ok && result.value.receivedAt).toBe(1_000_000)
  })

  test('a links_expire_in that is absent, negative or not a number reads as unknown', async () => {
    for (const value of [undefined, -5, '600', null]) {
      const result = await apiAnswering(json(200, { ...payload, links_expire_in: value })).api.documents('t0k3n')
      expect(result.ok && result.value.linksExpireIn, String(value)).toBeNull()
    }
  })

  test('401 is the session ending — whatever the body says', async () => {
    for (const body of [{ error: 'unauthenticated' }, {}]) {
      const result = await apiAnswering(json(401, body)).api.documents('stale')
      expect(result).toEqual({ ok: false, error: { kind: 'unauthenticated' } })
    }
  })

  test('404 is the zone switched off since the page was built', async () => {
    const result = await apiAnswering(json(404, { error: 'zone_unavailable' })).api.documents('t0k3n')
    expect(result).toEqual({ ok: false, error: { kind: 'zone_unavailable' } })
  })
})

describe('logout()', () => {
  test('posts the token and reports a network failure so revocation can be retried', async () => {
    const { api, fetchImpl } = apiAnswering(new TypeError('Failed to fetch'))

    await expect(api.logout('t0k3n')).resolves.toEqual({ ok: false, error: { kind: 'network' } })

    const [url, init] = fetchImpl.mock.calls[0]!
    expect(url).toBe(`${ENDPOINT}/logout`)
    expect(init?.method).toBe('POST')
    expect((init?.headers as Record<string, string>).Authorization).toBe('Bearer t0k3n')
  })

  test('only the idempotent server acknowledgement confirms revocation', async () => {
    await expect(apiAnswering(new Response(null, { status: 204 })).api.logout('token')).resolves.toEqual({
      ok: true,
      value: undefined,
    })
    await expect(apiAnswering(json(503, {})).api.logout('token')).resolves.toEqual({
      ok: false,
      error: { kind: 'network' },
    })
    await expect(apiAnswering(json(200, {})).api.logout('token')).resolves.toEqual({
      ok: false,
      error: { kind: 'network' },
    })
  })
})

describe('normalizeZoneEndpoint()', () => {
  test('an absolute http(s) URL, trailing slash dropped', () => {
    expect(normalizeZoneEndpoint('https://bee.diligently.pl/api/zone')).toBe('https://bee.diligently.pl/api/zone')
    expect(normalizeZoneEndpoint('https://bee.diligently.pl/api/zone/')).toBe('https://bee.diligently.pl/api/zone')
    expect(normalizeZoneEndpoint('http://localhost:8000/api/zone')).toBe('http://localhost:8000/api/zone')
  })

  test('anything a `/login` suffix or an origin check could not be built from is refused', () => {
    for (const value of [
      null,
      '',
      '/api/zone',
      'javascript:alert(1)',
      'ftp://cms.example.test/api/zone',
      'https://cms.example.test/api/zone?x=1',
      'https://user:pass@cms.example.test/api/zone',
    ]) {
      expect(normalizeZoneEndpoint(value), String(value)).toBeNull()
    }
  })
})

describe('safeZoneHref()', () => {
  test('a signed link next to the API is kept', () => {
    const url = `${ENDPOINT}/documents/12/file?disposition=inline&expires=1&session=2&signature=abc`
    expect(safeZoneHref(url, ENDPOINT)).toBe(url)
  })

  test('another origin, another scheme or no URL at all is dropped', () => {
    // Remote data becoming an href in the site's own origin: a `javascript:` URL would run there,
    // and a foreign host would be a phishing hop wearing the site's own document list.
    for (const url of [
      'javascript:alert(document.domain)',
      'data:application/pdf;base64,AAAA',
      'https://evil.example/documents/12/file',
      'http://cms.example.test/api/zone/documents/12/file', // same host, different origin
      '//cms.example.test/api/zone/documents/12/file',
      '/api/zone/documents/12/file',
      null,
    ]) {
      expect(safeZoneHref(url, ENDPOINT), String(url)).toBeNull()
    }
  })
})

describe('linksDeadline()', () => {
  // The visitor's clock may be minutes off the server's. The deadline is a duration measured on
  // THIS machine, so a skewed clock cannot make a fresh list look dead (a refresh storm) or a dead
  // one look fresh (clicks on expired links).
  test('counts links_expire_in from the arrival, ignoring the server’s absolute time', () => {
    const receivedAt = Date.parse('2026-09-25T12:00:00Z')
    // links_expire_at is an hour BEFORE the local arrival — a visitor clock running an hour fast.
    const deadline = linksDeadline({ linksExpireAt: '2026-09-25T11:10:00+00:00', linksExpireIn: 600, receivedAt })

    expect(deadline).toBe(receivedAt + 600_000)
  })

  test('falls back to links_expire_at from a panel that does not send links_expire_in', () => {
    expect(linksDeadline({ linksExpireAt: '2026-09-25T10:10:00+00:00', linksExpireIn: null, receivedAt: 0 })).toBe(
      Date.parse('2026-09-25T10:10:00+00:00'),
    )
  })

  test('is 0 — unknown — when the response says neither', () => {
    expect(linksDeadline({ linksExpireAt: null, linksExpireIn: null, receivedAt: 5 })).toBe(0)
    expect(linksDeadline({ linksExpireAt: 'soon', linksExpireIn: null, receivedAt: 5 })).toBe(0)
  })
})

test('retryMinutes() rounds up and never says 0', () => {
  expect(retryMinutes(1)).toBe(1)
  expect(retryMinutes(60)).toBe(1)
  expect(retryMinutes(61)).toBe(2)
  expect(retryMinutes(900)).toBe(15)
  expect(retryMinutes(0)).toBe(1)
})

describe('the password reset', () => {
  test('requestPasswordReset() posts the login and this page, and 202 is all it learns', async () => {
    const { api, fetchImpl } = apiAnswering(json(202, { status: 'accepted' }))

    expect(await api.requestPasswordReset('jkowalski', '/panel-mieszkanca/')).toEqual({ ok: true, value: undefined })

    const [url, init] = fetchImpl.mock.calls[0]
    expect(url).toBe(`${ENDPOINT}/password/forgot`)
    expect(init?.method).toBe('POST')
    expect(JSON.parse(String(init?.body))).toEqual({ login: 'jkowalski', page: '/panel-mieszkanca/' })
    expect(init?.credentials).toBe('omit')
  })

  test('requestPasswordReset() reports an outage and a zone switched off', async () => {
    expect(await apiAnswering(new TypeError('offline')).api.requestPasswordReset('a', '/')).toEqual({
      ok: false,
      error: { kind: 'network' },
    })
    expect(await apiAnswering(json(404, { error: 'zone_unavailable' })).api.requestPasswordReset('a', '/')).toEqual({
      ok: false,
      error: { kind: 'zone_unavailable' },
    })
  })

  test('resetPassword() posts the token and the password; only 204 is success', async () => {
    const { api, fetchImpl } = apiAnswering(new Response(null, { status: 204 }))

    expect(await api.resetPassword('t'.repeat(64), 'a-new-password')).toEqual({ ok: true, value: undefined })

    const [url, init] = fetchImpl.mock.calls[0]
    expect(url).toBe(`${ENDPOINT}/password/reset`)
    expect(JSON.parse(String(init?.body))).toEqual({ token: 't'.repeat(64), password: 'a-new-password' })
  })

  test('resetPassword() tells a dead link from a password the account may not have', async () => {
    const error = async (response: Response) => {
      const result = await apiAnswering(response).api.resetPassword('t', 'p')
      return result.ok ? null : result.error
    }

    expect(await error(json(422, { error: 'invalid_token' }))).toEqual({ kind: 'invalid_token' })
    expect(await error(json(422, { error: 'invalid_password' }))).toEqual({ kind: 'invalid_password' })
    expect(await error(json(500, {}))).toEqual({ kind: 'network' })
    // A 422 on sign-in is still a mistyped credential.
    expect(await loginError(json(422, { error: 'invalid_request' }))).toEqual({ kind: 'invalid_credentials' })
  })

  test('resetTokenFrom() takes only the exact token shape out of a fragment', () => {
    const token = 'aB3'.repeat(21) + 'x'

    expect(resetTokenFrom(`#zone-reset=${token}`)).toBe(token)
    expect(resetTokenFrom(`#section&zone-reset=${token}&x=1`)).toBe(token)

    for (const hash of [
      '',
      '#',
      '#zone-reset=',
      `#zone-reset=${token}x`,
      `#zone-reset=${token.slice(1)}`,
      `#not-zone-reset=${token}`,
      `#zone-reset=${'<'.repeat(64)}`,
    ]) {
      expect(resetTokenFrom(hash), hash).toBeNull()
    }
  })

  test('isAcceptablePassword() is the API’s rule: 8 characters, 72 bytes', () => {
    expect(isAcceptablePassword('1234567')).toBe(false)
    expect(isAcceptablePassword('12345678')).toBe(true)
    expect(isAcceptablePassword('ąęśćżźół')).toBe(true)
    expect(isAcceptablePassword('a'.repeat(72))).toBe(true)
    expect(isAcceptablePassword('a'.repeat(73))).toBe(false)
    // 37 two-byte letters are 74 bytes.
    expect(isAcceptablePassword('ą'.repeat(37))).toBe(false)
  })
})
