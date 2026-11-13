// The protected zone's HTTP contract as the browser sees it: `POST {endpoint}/login`,
// `POST {endpoint}/logout`, `GET {endpoint}/documents` and the two password-reset calls
// (`POST {endpoint}/password/forgot`, `POST {endpoint}/password/reset`) on the CMS. Framework- and DOM-free, so
// the core renderer's script, a site's own override and vitest all drive the same module.
//
// A typed result, not a throw: every failure is an expected state of a login form, each maps to one
// message, and `{ ok: false, error }` keeps the caller's `switch` exhaustive under `astro check`.
//
// Cross-origin by design: the static site and the API on the panel host are different sites, so a
// cookie would be third-party and blocked by ITP/Chrome. The session is a bearer token
// (`credentials: 'omit'`; the backend sends no `Allow-Credentials`).

/** The account a session belongs to, as the API names it. `name` is optional in the panel. */
export interface ZoneUser {
  name: string | null
  login: string
}

/** `POST /login` 200. */
export interface ZoneLoginGrant {
  token: string
  /** Absolute end of the session (ISO-8601), whatever the visitor does. */
  expiresAt: string | null
  /** The sliding idle window, in seconds. */
  idleTimeoutSeconds: number | null
  user: ZoneUser
}

/** One row of `GET /documents` — only the fields a renderer shows. */
export interface ZoneDocument {
  id: number
  title: string
  description: string | null
  /** `YYYY-MM-DD`, a date the admin typed — not the upload time. */
  documentDate: string | null
  fileName: string | null
  mimeType: string | null
  size: number | null
  /** Short-lived signed URLs bound to the session (`disposition=inline` / `attachment`). */
  viewUrl: string | null
  downloadUrl: string | null
}

/** `GET /documents` 200. */
export interface ZoneDocumentList {
  user: ZoneUser
  expiresAt: string | null
  /** When the signed URLs in `documents` stop working — the list must be re-fetched before it.
   *  An instant on the SERVER's clock: compared with `Date.now()` only as a last resort. */
  linksExpireAt: string | null
  /** The same moment as a duration — seconds from the server's "now" to `linksExpireAt`. Null from
   *  a panel that predates the field; `linksDeadline()` then falls back to `linksExpireAt`. */
  linksExpireIn: number | null
  /** `Date.now()` when the response arrived — the local instant `linksExpireIn` counts from. */
  receivedAt: number
  documents: ZoneDocument[]
}

/**
 * Every way a call can fail, one per message the page can show.
 *
 * `network` is the catch-all for "the API did not answer in the contract's terms" — offline, a
 * CORS rejection (which a browser reports as a network error, by design), a 5xx, a body that is
 * not the documented JSON. The visitor can do the same thing about all of them: try again.
 */
export type ZoneError =
  | { kind: 'invalid_credentials' }
  | { kind: 'account_blocked' }
  | { kind: 'too_many_attempts'; retryAfter: number }
  | { kind: 'unauthenticated' }
  | { kind: 'zone_unavailable' }
  /** A reset link that is unknown, used or expired — the visitor asks for a new one. */
  | { kind: 'invalid_token' }
  /** A new password the account may not have (too short or too long); the link is not spent. */
  | { kind: 'invalid_password' }
  | { kind: 'network' }

export type ZoneResult<T> = { ok: true; value: T } | { ok: false; error: ZoneError }

export interface ZoneApi {
  readonly endpoint: string
  login(login: string, password: string): Promise<ZoneResult<ZoneLoginGrant>>
  /** Success confirms server revocation; failures leave the token available for a retry. */
  logout(token: string): Promise<ZoneResult<void>>
  documents(token: string): Promise<ZoneResult<ZoneDocumentList>>
  /**
   * Ask for a reset link for `login`. Success means only "accepted": the API never says whether an
   * e-mail went out. `page` is this page's path — the link in the e-mail returns to it.
   */
  requestPasswordReset(login: string, page: string): Promise<ZoneResult<void>>
  /** Set a new password with the token of a reset link. */
  resetPassword(token: string, password: string): Promise<ZoneResult<void>>
}

/** Seconds assumed when a 429 names neither `retry_after` nor `Retry-After`. */
const DEFAULT_RETRY_AFTER = 60

/**
 * The endpoint as the build hands it over (`site-settings.protected_zone.endpoint`, e.g.
 * `https://bee.diligently.pl/api/zone`), or null when it is not one this module may call.
 *
 * Only an absolute http(s) URL with no query or fragment: it is concatenated with `/login` and
 * compared by origin against every href the API returns, so a value that is not exactly an origin
 * plus a path would make both of those guesses. A trailing slash is dropped for the concatenation.
 */
export function normalizeZoneEndpoint(raw: unknown): string | null {
  if (typeof raw !== 'string' || raw.trim() === '') return null

  let url: URL
  try {
    url = new URL(raw.trim())
  } catch {
    return null
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return null
  if (url.search !== '' || url.hash !== '' || url.username !== '' || url.password !== '') return null

  return `${url.origin}${url.pathname.replace(/\/+$/, '')}`
}

/**
 * An href from the API that a row may carry, or null.
 *
 * `https:`/`http:` on the ENDPOINT'S origin only. The list is JSON the browser fetched, and a link
 * built from it is the one place this page puts remote data into an attribute that navigates: a
 * `javascript:` URL there would run in the site's origin, and a foreign host would be a phishing
 * hop wearing the site's own list. The signed file route always lives next to the API, so anything
 * else is a defect or an attack and is dropped rather than rendered.
 */
export function safeZoneHref(url: unknown, endpoint: string): string | null {
  if (typeof url !== 'string' || url === '') return null

  let parsed: URL
  let base: URL
  try {
    parsed = new URL(url)
    base = new URL(endpoint)
  } catch {
    return null
  }
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return null

  return parsed.origin === base.origin ? parsed.href : null
}

/**
 * When a list's signed links stop working, as a `Date.now()` instant on THIS machine — or 0 when
 * the response does not say.
 *
 * `linksExpireIn` counted from the moment the response arrived, never `linksExpireAt` against the
 * visitor's clock: a laptop five minutes fast would otherwise see every fresh list as already
 * expired and re-fetch it every few seconds, and one five minutes slow would keep offering dead
 * links for five minutes. A duration measured locally cancels the skew. `Date.now()` rather than
 * `performance.now()` because the monotonic clock stops while a laptop sleeps in some browsers,
 * and a lid closed for twenty minutes must read as twenty minutes gone. `linksExpireAt` is the
 * fallback for a panel that predates `links_expire_in` only.
 */
export function linksDeadline(list: Pick<ZoneDocumentList, 'linksExpireAt' | 'linksExpireIn' | 'receivedAt'>): number {
  if (list.linksExpireIn !== null) return list.receivedAt + list.linksExpireIn * 1000

  const at = Date.parse(list.linksExpireAt ?? '')
  return Number.isNaN(at) ? 0 : at
}

/** Whole minutes for a `{minutes}` placeholder — never 0, which would read as "try now". */
/** The fragment key a reset link carries its token under (`#zone-reset=<token>`). */
export const RESET_FRAGMENT = 'zone-reset'

/**
 * The reset token in a URL fragment, or null. Only the exact shape the API issues — 64 letters and
 * digits — so nothing else in a fragment is ever sent anywhere as a token.
 */
export function resetTokenFrom(hash: string): string | null {
  const match = new RegExp(`(?:^#|&)${RESET_FRAGMENT}=([A-Za-z0-9]{64})(?:&|$)`).exec(hash)
  return match ? match[1] : null
}

/** The shortest and longest (in UTF-8 bytes) password the API accepts. */
export const PASSWORD_MIN_LENGTH = 8
export const PASSWORD_MAX_BYTES = 72

/** Whether the API would take `password` — checked in the page so a typo costs no request. */
export function isAcceptablePassword(password: string): boolean {
  return [...password].length >= PASSWORD_MIN_LENGTH && new TextEncoder().encode(password).length <= PASSWORD_MAX_BYTES
}

export function retryMinutes(retryAfterSeconds: number): number {
  return Math.max(1, Math.ceil(retryAfterSeconds / 60))
}

type Fetch = typeof fetch

const str = (value: unknown): string | null => (typeof value === 'string' && value !== '' ? value : null)
const num = (value: unknown): number | null => (typeof value === 'number' && Number.isFinite(value) ? value : null)
const nonNegative = (value: unknown): number | null => {
  const n = num(value)
  return n !== null && n >= 0 ? n : null
}

function userFrom(value: unknown): ZoneUser | null {
  if (!value || typeof value !== 'object') return null
  const user = value as Record<string, unknown>
  const login = str(user.login)

  return login ? { login, name: str(user.name) } : null
}

function documentFrom(value: unknown): ZoneDocument | null {
  if (!value || typeof value !== 'object') return null
  const doc = value as Record<string, unknown>
  const id = num(doc.id)
  const title = str(doc.title)
  if (id === null || title === null) return null

  return {
    id,
    title,
    description: str(doc.description),
    documentDate: str(doc.document_date),
    fileName: str(doc.file_name),
    mimeType: str(doc.mime_type),
    size: num(doc.size),
    viewUrl: str(doc.view_url),
    downloadUrl: str(doc.download_url),
  }
}

/** The body's `error` code, or null for a body that is not the contract's JSON. */
async function errorCode(response: Response): Promise<{ code: string | null; body: Record<string, unknown> }> {
  const body = await response.json().catch(() => null)
  if (!body || typeof body !== 'object') return { code: null, body: {} }
  const record = body as Record<string, unknown>

  return { code: str(record.error), body: record }
}

/**
 * The failure a non-2xx answer means. Keyed on the status AND the body's `error` code, because the
 * same status carries two meanings: 403 is `account_blocked` on login and `forbidden_origin` when
 * this site's origin is not a domain of any client — which, for a visitor, is the zone being
 * unavailable, not their account.
 */
async function failureOf(response: Response): Promise<ZoneError> {
  const { code, body } = await errorCode(response)

  switch (response.status) {
    case 401:
      return code === 'unauthenticated' ? { kind: 'unauthenticated' } : { kind: 'invalid_credentials' }
    // On sign-in: a login over 191 characters or a password over 1024, which the form's maxlength
    // stops — for the visitor, a mistyped credential. The reset names its own two.
    case 422:
      if (code === 'invalid_token') return { kind: 'invalid_token' }
      if (code === 'invalid_password') return { kind: 'invalid_password' }
      return { kind: 'invalid_credentials' }
    case 403:
      return code === 'account_blocked' ? { kind: 'account_blocked' } : { kind: 'zone_unavailable' }
    case 404:
      return { kind: 'zone_unavailable' }
    case 429: {
      const header = Number(response.headers.get('Retry-After'))
      const seconds = num(body.retry_after) ?? (Number.isFinite(header) && header > 0 ? header : DEFAULT_RETRY_AFTER)

      return { kind: 'too_many_attempts', retryAfter: seconds }
    }
    default:
      return { kind: 'network' }
  }
}

/**
 * A client for one zone endpoint.
 *
 * `fetchImpl` and `now` are the test seams; the browser's own `fetch` and `Date.now` otherwise.
 * Every request is `cache: 'no-store'` (the server says the same in `Cache-Control`, but a list of
 * signed URLs is the last thing that should come back from a heuristic cache) and
 * `credentials: 'omit'`.
 */
export function createZoneApi(
  endpoint: string,
  fetchImpl: Fetch = (...args) => fetch(...args),
  now: () => number = () => Date.now(),
): ZoneApi {
  const base = endpoint.replace(/\/+$/, '')

  async function call(path: string, init: RequestInit): Promise<Response | null> {
    try {
      return await fetchImpl(`${base}${path}`, {
        ...init,
        mode: 'cors',
        credentials: 'omit',
        cache: 'no-store',
        headers: { Accept: 'application/json', ...(init.headers as Record<string, string> | undefined) },
      })
    } catch {
      return null
    }
  }

  return {
    endpoint: base,

    async login(login, password) {
      const response = await call('/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ login, password }),
      })
      if (!response) return { ok: false, error: { kind: 'network' } }
      if (!response.ok) return { ok: false, error: await failureOf(response) }

      const body = (await response.json().catch(() => null)) as Record<string, unknown> | null
      const token = str(body?.token)
      const user = userFrom(body?.user)
      if (!token || !user) return { ok: false, error: { kind: 'network' } }

      return {
        ok: true,
        value: { token, user, expiresAt: str(body?.expires_at), idleTimeoutSeconds: num(body?.idle_timeout_seconds) },
      }
    },

    async logout(token) {
      // No `keepalive`: the request is preflighted (it carries Authorization), and browsers that
      // predate preflighted keepalive refuse it outright. The timeout turns a hung request into a
      // failure the visitor can retry, rather than a sign-out that never finishes.
      const response = await call('/logout', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        signal: AbortSignal.timeout(15_000),
      })
      if (!response) return { ok: false, error: { kind: 'network' } }
      if (response.status !== 204) return { ok: false, error: await failureOf(response) }
      return { ok: true, value: undefined }
    },

    async documents(token) {
      const response = await call('/documents', { method: 'GET', headers: { Authorization: `Bearer ${token}` } })
      // As the headers arrive, before the body is read: `links_expire_in` counts from here.
      const receivedAt = now()
      if (!response) return { ok: false, error: { kind: 'network' } }
      if (!response.ok) {
        // A 401 here can only mean the session: this route has no credentials to get wrong.
        const error = await failureOf(response)
        return { ok: false, error: response.status === 401 ? { kind: 'unauthenticated' } : error }
      }

      const body = (await response.json().catch(() => null)) as Record<string, unknown> | null
      const user = userFrom(body?.user)
      if (!body || !user || !Array.isArray(body.documents)) return { ok: false, error: { kind: 'network' } }

      return {
        ok: true,
        value: {
          user,
          expiresAt: str(body.expires_at),
          linksExpireAt: str(body.links_expire_at),
          linksExpireIn: nonNegative(body.links_expire_in),
          receivedAt,
          documents: body.documents.map(documentFrom).filter((doc): doc is ZoneDocument => doc !== null),
        },
      }
    },

    async requestPasswordReset(login, page) {
      const response = await call('/password/forgot', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ login, page }),
      })
      if (!response) return { ok: false, error: { kind: 'network' } }
      if (response.status !== 202) return { ok: false, error: await failureOf(response) }
      return { ok: true, value: undefined }
    },

    async resetPassword(token, password) {
      const response = await call('/password/reset', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, password }),
      })
      if (!response) return { ok: false, error: { kind: 'network' } }
      if (response.status !== 204) return { ok: false, error: await failureOf(response) }
      return { ok: true, value: undefined }
    },
  }
}
