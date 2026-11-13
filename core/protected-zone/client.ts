// The protected zone's browser half: sign-in, the document list, sign-out — wired to markup by
// data attributes alone, so core/blocks/ProtectedZone.astro and a site's own override share it
// without sharing markup or class names.
//
// THE DOM CONTRACT. Every part is optional: a missing element disables what it drives.
//
//   [data-protected-zone]     root: `data-endpoint` (the zone API base), `data-msg-*` (messages in
//                             the page's language); `data-state` is written here
//   form[data-zone-login]     inputs name=login / name=password, a submit button, [data-zone-error],
//                             [data-zone-info] (a status line), button[data-zone-forgot]
//   template[data-zone-reset-forms]  the two reset forms, stamped after the login form when first
//                             needed (or rendered directly, without the template):
//     form[data-zone-forgot-form]  input name=login, a submit button, [data-zone-forgot-error]
//     form[data-zone-reset-form]   inputs name=password / name=password_confirmation, a submit
//                               button, [data-zone-reset-error]
//     button[data-zone-back]       in either: back to sign-in
//   [data-zone-documents]     [data-zone-user], button[data-zone-logout], [data-zone-logout-error],
//                             [data-zone-heading], [data-zone-list], [data-zone-empty]
//   template[data-zone-row]   [data-zone-title], [data-zone-description], [data-zone-type],
//                             [data-zone-size], time[data-zone-date], a[data-zone-view],
//                             a[data-zone-download]
//   [data-zone-card], [data-zone-loading], [data-zone-unavailable]
//
// EVERY ELEMENT THIS SCRIPT TOGGLES MUST HONOUR `[hidden]`. Only the attribute is flipped, and a
// class that sets `display` beats the UA sheet's `[hidden]` rule, so the element would stay on
// screen. Core's keys carry `[&[hidden]]:hidden` (core/uno.core.ts); a site override puts the same
// variant in a shortcut in its `src/uno.ts`, never as a utility in `.astro` markup, which a client
// repo's extractor does not generate.
//
// The list is remote data inside the site's origin, so values land through `textContent` only and
// an href is kept only when it is http(s) on the endpoint's origin (api.ts `safeZoneHref`).
//
// THE SESSION is a bearer token in sessionStorage, keyed per endpoint; storage that throws leaves it
// in module memory for this page view. Sign-out completes only once the server confirms it: until
// then the list stays hidden, across reloads too, and the token is kept for the retry. A sign-out
// the server answers with `zone_unavailable` ends the session here: that token works nowhere now.
//
// THE LINKS are short-lived signed URLs, so the list is re-fetched before they die — but only in a
// visible tab whose visitor interacted within the idle window: each refresh touches the server
// session, and an unconditional one would keep a tab left open on a desk signed in forever. A
// skipped refresh marks the list stale, and the next interaction re-fetches it.
//
// THE PASSWORD RESET is two forms. "Forgot your password?" asks for a login and the API e-mails a
// link to the account's address — the answer is the same whether or not one went out, and so is the
// message. The link returns here with its token in the fragment (`#zone-reset=…`), which is taken
// out of the address bar at once and shown as the "new password" form. Both forms live in a
// <template> until someone needs them, so a page nobody resets a password on has one login field
// and one password field, as before.
//
// A CLICK ON A STALE LINK is held, the list refreshed and the fresh href followed. A new-tab link
// opens `about:blank` synchronously inside the click — the one `window.open` a popup blocker still
// accepts once the refresh has outlived the user activation — and is pointed at the URL afterwards.
import {
  createZoneApi,
  isAcceptablePassword,
  linksDeadline,
  normalizeZoneEndpoint,
  resetTokenFrom,
  retryMinutes,
  safeZoneHref,
} from './api'
import type { ZoneDocument, ZoneDocumentList, ZoneError, ZoneResult } from './api'
import { formatBytes, formatDocDate, typeLabel } from './format'

export type ZoneState = 'login' | 'forgot' | 'reset' | 'loading' | 'documents' | 'signing-out' | 'unavailable'

/** Set on a root once wired, so a second call — two scripts, a re-run — is a no-op. */
export const ZONE_READY_ATTRIBUTE = 'data-zone-ready'

/** Dispatched on `document` when a root's session changes; `detail` is a `ZoneSessionEventDetail`. */
export const ZONE_SESSION_EVENT = 'cms:protected-zone-session'

export interface ZoneSessionEventDetail {
  /** The normalised endpoint — only roots for the same one react. */
  endpoint: string
  /** A sign-in, a sign-out, a session the server ended, the zone switched off. */
  change: 'signed-in' | 'signed-out' | 'signing-out' | 'logout-failed' | 'expired' | 'unavailable'
  /** The root that changed it, which ignores its own event. */
  source: HTMLElement
}

/** Re-fetch this long before the signed links expire, so a click never lands on a dead link. */
const REFRESH_LEAD_MS = 30_000
/** Never re-fetch more often than this on the timer, whatever the deadline says. */
const MIN_REFRESH_MS = 10_000
/** A failed refresh is retried after this, doubling up to RETRY_MAX_MS. */
const RETRY_FIRST_MS = 15_000
const RETRY_MAX_MS = 60_000
/** An interaction re-fetches a stale list at most this often — offline, every keystroke would.
 *  A click on a stale link is not limited by it. */
const INTERACTION_REFRESH_GAP_MS = 3_000
/** The idle window when the login did not say: shorter than the server's default hour, so an
 *  unknown window errs towards letting the session idle out. */
const FALLBACK_IDLE_SECONDS = 15 * 60
/** setTimeout's ceiling; a longer delay fires immediately. */
const MAX_TIMEOUT_MS = 2_147_483_647

/** English fallbacks for a root that carries no `data-msg-*` — a site override that forgot one. */
const FALLBACK_MESSAGES = {
  invalidCredentials: 'Incorrect login or password.',
  accountBlocked: 'This account is blocked. Please contact the administrator.',
  tooManyAttempts: 'Too many sign-in attempts. Try again in {minutes} min.',
  network: 'Could not connect. Check your connection and try again.',
  sessionExpired: 'Your session has expired. Please sign in again.',
  unavailable: 'The protected zone is unavailable.',
  signedInAs: 'Signed in as {name}',
  logoutFailed: 'Sign-out could not be confirmed. Check your connection and click Sign out to try again.',
  resetSent:
    'If this account has an e-mail address, a link to set a new password is on its way. No message? Contact the administrator.',
  resetDone: 'Your password has been changed. Sign in with the new one.',
  resetInvalidLink: 'This link has expired or was already used. Ask for a new one.',
  resetPasswordInvalid: 'The password must be 8 to 72 characters long.',
  resetMismatch: 'The passwords do not match.',
} as const

type MessageKey = keyof typeof FALLBACK_MESSAGES

/** The sessionStorage key for one endpoint's token. */
export function tokenStorageKey(endpoint: string): string {
  return `cms.protected-zone:${endpoint}`
}

/** The sessionStorage key for one endpoint's idle window (seconds), stored beside the token. */
export function idleStorageKey(endpoint: string): string {
  return `${tokenStorageKey(endpoint)}:idle-timeout`
}

// Every stored value is kept in memory too, shared by every root on the page, so a browser whose
// storage throws still gets a session for this page view.
const memory = new Map<string, string>()
/** The revocation in flight per endpoint, so the roots sharing a session send one request. */
const logoutRequests = new Map<string, Promise<ZoneResult<void>>>()

function recall(key: string): string | null {
  const kept = memory.get(key)
  if (kept !== undefined) return kept
  try {
    return window.sessionStorage.getItem(key)
  } catch {
    return null
  }
}

/** Store a value, or forget it with null. */
function store(key: string, value: string | null): void {
  if (value === null) memory.delete(key)
  else memory.set(key, value)
  try {
    if (value === null) window.sessionStorage.removeItem(key)
    else window.sessionStorage.setItem(key, value)
  } catch {
    // Storage refused: the memory copy above carries the session.
  }
}

const fill = (template: string, vars: Record<string, string>): string =>
  template.replace(/\{(\w+)\}/g, (whole, name: string) => vars[name] ?? whole)

function setHidden(el: Element | null | undefined, hidden: boolean): void {
  if (el instanceof HTMLElement) el.hidden = hidden
}

/** Focus an element that may not be focusable by itself (a heading, a notice). */
function focusElement(el: HTMLElement | null | undefined): void {
  if (!el) return
  if (!el.hasAttribute('tabindex') && !el.matches('a[href], button, input, select, textarea')) {
    el.setAttribute('tabindex', '-1')
  }
  el.focus()
}

/** Per-page counter for the ids a row's links point at with aria-describedby. */
let rowSequence = 0

type LinkKind = 'view' | 'download'

/** One rendered row: its nodes in the list, what it shows, and its two links. */
interface RowRecord {
  nodes: ChildNode[]
  /** Everything the row DISPLAYS — a refresh that changes none of it only swaps the hrefs. */
  signature: string
  view: HTMLAnchorElement | null
  download: HTMLAnchorElement | null
}

/**
 * Wire one `[data-protected-zone]` root. Idempotent: a root already wired is left alone.
 *
 * A root with no usable `data-endpoint` — the build rendered the "unavailable" notice, or a site
 * override forgot the attribute — is put in the `unavailable` state and nothing else runs.
 */
export function initProtectedZone(root: HTMLElement): void {
  if (root.hasAttribute(ZONE_READY_ATTRIBUTE)) return
  root.setAttribute(ZONE_READY_ATTRIBUTE, '')

  const q = <T extends Element = HTMLElement>(selector: string): T | null => root.querySelector<T>(selector)

  const card = q('[data-zone-card]')
  const form = q<HTMLFormElement>('form[data-zone-login]')
  const loginInput = form?.querySelector<HTMLInputElement>('[name="login"]') ?? null
  const passwordInput = form?.querySelector<HTMLInputElement>('[name="password"]') ?? null
  const submit = form?.querySelector<HTMLButtonElement>('button[type="submit"], button:not([type])') ?? null
  const errorBox = q('[data-zone-error]')
  const infoBox = q('[data-zone-info]')
  const forgotButton = q<HTMLButtonElement>('button[data-zone-forgot]')
  const resetTemplate = q<HTMLTemplateElement>('template[data-zone-reset-forms]')
  // The reset forms and their parts — null until wireResetForms() finds them in the document.
  let forgotForm: HTMLFormElement | null = null
  let forgotLogin: HTMLInputElement | null = null
  let forgotError: HTMLElement | null = null
  let resetForm: HTMLFormElement | null = null
  let resetPassword: HTMLInputElement | null = null
  let resetConfirm: HTMLInputElement | null = null
  let resetError: HTMLElement | null = null
  /** The token of the reset link that opened this page, until it is spent. */
  let resetToken: string | null = null
  const panel = q('[data-zone-documents]')
  const userLabel = q('[data-zone-user]')
  const logoutButton = q<HTMLButtonElement>('button[data-zone-logout]')
  // A site override without the slot still gets an accessible error beside the logout button.
  let logoutError = q('[data-zone-logout-error]')
  if (!logoutError && logoutButton?.parentElement) {
    logoutError = document.createElement('p')
    logoutError.dataset.zoneLogoutError = ''
    logoutError.setAttribute('role', 'alert')
    logoutError.hidden = true
    logoutButton.parentElement.append(logoutError)
  }
  const list = q('[data-zone-list]')
  const empty = q('[data-zone-empty]')
  const rowTemplate = q<HTMLTemplateElement>('template[data-zone-row]')
  const loading = q('[data-zone-loading]')
  const unavailable = q('[data-zone-unavailable]')
  const heading = panel?.querySelector<HTMLElement>('[data-zone-heading], h1, h2, h3, h4, h5, h6') ?? null

  const locale = root.closest('[lang]')?.getAttribute('lang') || document.documentElement.lang || 'en'
  const message = (key: MessageKey): string => {
    const attribute = `data-msg-${key.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)}`
    return root.getAttribute(attribute) || FALLBACK_MESSAGES[key]
  }

  function setState(state: ZoneState): void {
    root.dataset.state = state
    setHidden(card, state === 'unavailable')
    setHidden(form, state !== 'login')
    setHidden(forgotForm, state !== 'forgot')
    setHidden(resetForm, state !== 'reset')
    setHidden(loading, state !== 'loading')
    setHidden(panel, state !== 'documents' && state !== 'signing-out')
    setHidden(unavailable, state !== 'unavailable')
    if (state === 'documents' && logoutButton) logoutButton.disabled = false
    if (state !== 'signing-out') panel?.setAttribute('aria-busy', 'false')
    if (state !== 'signing-out' && logoutError) logoutError.hidden = true
    if (state === 'unavailable' && unavailable && !unavailable.textContent?.trim()) {
      unavailable.textContent = message('unavailable')
    }
  }

  const endpoint = normalizeZoneEndpoint(root.dataset.endpoint)
  if (!endpoint) {
    setState('unavailable')
    return
  }
  const zoneEndpoint: string = endpoint

  const api = createZoneApi(zoneEndpoint)
  const tokenKey = tokenStorageKey(zoneEndpoint)
  const idleKey = idleStorageKey(zoneEndpoint)
  const logoutKey = `${tokenKey}:logout-pending`

  /** When the signed links of the list on screen die, on this machine's clock; 0 = unknown. */
  let linksDeadlineAt = 0
  let timer: ReturnType<typeof setTimeout> | undefined
  /** The wait before the next retry of a failed refresh; 0 = the last refresh succeeded. */
  let retryDelay = 0
  /** A timed refresh was skipped (tab hidden, visitor idle): the next interaction runs it. */
  let deferred = false
  /** The visitor's last pointerdown / keydown / touchstart or return to the tab; loading the page
   *  counts as one. */
  let lastInteraction = Date.now()
  let lastAttemptAt = 0
  let busy = false
  // A counter rather than a flag: a list fetched for a session that has since signed out (or been
  // replaced by a newer fetch) must not be painted over the login form.
  let generation = 0
  let inflight: { generation: number; promise: Promise<void> } | null = null
  let rows = new Map<number, RowRecord>()
  const rowLinks = new WeakMap<HTMLAnchorElement, { id: number; kind: LinkKind }>()

  const currentToken = (): string | null => recall(tokenKey)

  function idleWindowMs(): number {
    const seconds = Number(recall(idleKey))
    return (Number.isFinite(seconds) && seconds > 0 ? seconds : FALLBACK_IDLE_SECONDS) * 1000
  }

  function rememberSession(token: string, idleSeconds: number | null): void {
    store(tokenKey, token)
    store(idleKey, idleSeconds !== null && idleSeconds > 0 ? String(idleSeconds) : null)
  }

  /** Clear protected content and cancel refreshes without losing a token still needing revocation. */
  function clearDocuments(): void {
    generation++
    linksDeadlineAt = 0
    retryDelay = 0
    deferred = false
    inflight = null
    clearTimeout(timer)
    rows = new Map()
    list?.replaceChildren()
    if (userLabel) userLabel.textContent = ''
  }

  /** Drop the session everywhere after server confirmation or a definitive access refusal. */
  function forgetSession(): void {
    store(tokenKey, null)
    store(idleKey, null)
    store(logoutKey, null)
    clearDocuments()
    if (logoutError) logoutError.hidden = true
  }

  function showSigningOut(failed: boolean): void {
    clearDocuments()
    setHidden(list, true)
    setHidden(empty, true)
    setState('signing-out')
    panel?.setAttribute('aria-busy', String(!failed))
    if (logoutButton) logoutButton.disabled = !failed
    if (logoutError) {
      logoutError.textContent = failed ? message('logoutFailed') : ''
      logoutError.hidden = !failed
    }
    if (failed) focusElement(logoutError ?? logoutButton)
  }

  function announce(change: ZoneSessionEventDetail['change']): void {
    document.dispatchEvent(
      new CustomEvent<ZoneSessionEventDetail>(ZONE_SESSION_EVENT, {
        detail: { endpoint: zoneEndpoint, change, source: root },
      }),
    )
  }

  /** Write a message into one of the alert / status slots; an empty one hides it. */
  function say(box: HTMLElement | null, text: string): void {
    if (!box) return
    box.textContent = text
    box.hidden = text === ''
  }

  const setError = (text: string): void => say(errorBox, text)

  function setBusy(value: boolean): void {
    busy = value
    if (submit) submit.disabled = value
    form?.setAttribute('aria-busy', String(value))
  }

  function messageFor(error: ZoneError): string {
    switch (error.kind) {
      case 'invalid_credentials':
        return message('invalidCredentials')
      case 'account_blocked':
        return message('accountBlocked')
      case 'too_many_attempts':
        return fill(message('tooManyAttempts'), { minutes: String(retryMinutes(error.retryAfter)) })
      case 'unauthenticated':
        return message('sessionExpired')
      case 'zone_unavailable':
        return message('unavailable')
      case 'invalid_token':
        return message('resetInvalidLink')
      case 'invalid_password':
        return message('resetPasswordInvalid')
      case 'network':
        return message('network')
    }
  }

  /** The sign-in form. `info` is a status line above it (a reset link sent, a password changed). */
  function showLogin(text = '', focus = false, info = ''): void {
    setError(text)
    say(infoBox, info)
    setState('login')
    if (focus) loginInput?.focus()
  }

  /** The "forgot your password" form, carrying over a login already typed at sign-in. */
  function showForgot(text = ''): void {
    if (!mountResetForms() || !forgotForm) return
    say(forgotError, text)
    if (forgotLogin && loginInput && forgotLogin.value === '') forgotLogin.value = loginInput.value.trim()
    setState('forgot')
    forgotLogin?.focus()
  }

  /** A form's submit button, disabled while its request is in flight. */
  function whileBusy(target: HTMLFormElement, value: boolean): void {
    busy = value
    const button = target.querySelector<HTMLButtonElement>('button[type="submit"], button:not([type])')
    if (button) button.disabled = value
    target.setAttribute('aria-busy', String(value))
  }

  function showUnavailable(focus: boolean): void {
    setState('unavailable')
    // The control that had focus was just hidden; without this the keyboard user lands on <body>.
    if (focus) focusElement(unavailable)
  }

  /** Nothing outside this block holds focus — so moving it here takes nothing from the visitor. */
  const focusIsFree = (): boolean => {
    const active = document.activeElement
    return !active || active === document.body || root.contains(active)
  }

  function buildRow(
    doc: ZoneDocument,
    view: string | null,
    download: string | null,
    signature: string,
  ): RowRecord | null {
    if (!rowTemplate) return null

    const fragment = rowTemplate.content.cloneNode(true) as DocumentFragment
    const part = <T extends Element = HTMLElement>(selector: string): T | null => fragment.querySelector<T>(selector)
    const titleId = `zone-doc-${++rowSequence}`

    const title = part('[data-zone-title]')
    if (title) {
      title.textContent = doc.title
      title.id = titleId
    }

    const text = (selector: string, value: string | null): void => {
      const el = part(selector)
      if (!el) return
      if (value) el.textContent = value
      else el.remove()
    }
    text('[data-zone-description]', doc.description)
    text('[data-zone-size]', formatBytes(doc.size, locale))
    text('[data-zone-type]', typeLabel(doc.fileName, doc.mimeType))

    const date = part<HTMLTimeElement>('time[data-zone-date]')
    const formatted = formatDocDate(doc.documentDate, locale)
    if (date && formatted && doc.documentDate) {
      date.textContent = formatted
      date.dateTime = doc.documentDate
    } else {
      date?.remove()
    }

    const link = (kind: LinkKind, href: string | null, newTab: boolean): HTMLAnchorElement | null => {
      const a = part<HTMLAnchorElement>(`a[data-zone-${kind}]`)
      if (!a) return null
      if (!href) {
        a.remove()
        return null
      }
      a.href = href
      if (newTab) {
        a.target = '_blank'
        a.rel = 'noopener noreferrer'
      } else {
        a.removeAttribute('target')
      }
      // "Preview" and "Download" repeat on every row; the title is what tells them apart.
      if (title) a.setAttribute('aria-describedby', titleId)
      rowLinks.set(a, { id: doc.id, kind })
      return a
    }

    return {
      view: link('view', view, true),
      download: link('download', download, false),
      signature,
      nodes: Array.from(fragment.childNodes),
    }
  }

  function render(data: ZoneDocumentList): void {
    const name = data.user.name || data.user.login
    if (userLabel) userLabel.textContent = fill(message('signedInAs'), { name })

    const next = new Map<number, RowRecord>()
    const nodes: ChildNode[] = []
    for (const doc of data.documents) {
      if (next.has(doc.id)) continue
      const view = safeZoneHref(doc.viewUrl, zoneEndpoint)
      const download = safeZoneHref(doc.downloadUrl, zoneEndpoint)
      // A row that cannot be opened either way is a title the visitor can do nothing with.
      if (!view && !download) continue

      const signature = JSON.stringify([
        doc.title,
        doc.description,
        doc.documentDate,
        doc.size,
        doc.fileName,
        doc.mimeType,
        view !== null,
        download !== null,
      ])
      const kept = rows.get(doc.id)
      let record: RowRecord | null
      if (kept && kept.signature === signature) {
        // Same row, fresh links: only the hrefs change, on the SAME elements, so a pointer halfway
        // through clicking one keeps its target.
        if (kept.view && view) kept.view.href = view
        if (kept.download && download) kept.download.href = download
        record = kept
      } else {
        record = buildRow(doc, view, download, signature)
      }
      if (!record) continue
      next.set(doc.id, record)
      nodes.push(...record.nodes)
    }
    rows = next

    if (list) {
      // Re-parented only when the set or the order changed, for the same reason.
      const current = Array.from(list.childNodes)
      const unchanged = current.length === nodes.length && current.every((node, i) => node === nodes[i])
      if (!unchanged) list.replaceChildren(...nodes)
    }
    setHidden(list, next.size === 0)
    setHidden(empty, next.size > 0)
  }

  /** The links of the list on screen are dead, or about to be. */
  const isStale = (): boolean => linksDeadlineAt !== 0 && Date.now() >= linksDeadlineAt - REFRESH_LEAD_MS
  const needsRefresh = (): boolean => root.dataset.state === 'documents' && (deferred || isStale())

  function arm(delay: number): void {
    clearTimeout(timer)
    timer = setTimeout(onTimer, Math.min(MAX_TIMEOUT_MS, Math.max(0, delay)))
  }

  function onTimer(): void {
    if (root.dataset.state !== 'documents') return
    // A hidden tab or an idle visitor does not re-fetch (see "THE LINKS" above): the list is marked
    // stale, and re-fetched the moment the visitor is back.
    if (document.visibilityState !== 'visible' || Date.now() - lastInteraction >= idleWindowMs()) {
      deferred = true
      return
    }
    void loadDocuments(false)
  }

  /**
   * Fetch the list and show it. `afterSignIn` is the load a submit started: it moves focus (to the
   * list heading, or back to the login field when the list could not be loaded) and never joins a
   * refresh already in flight. Every other call does join one, so a pointerdown and the click it
   * becomes make one request, not two.
   */
  async function loadDocuments(afterSignIn: boolean): Promise<void> {
    if (recall(logoutKey)) return
    const token = currentToken()
    if (!token) {
      showLogin('', afterSignIn)
      return
    }
    if (!afterSignIn && inflight && inflight.generation === generation) return inflight.promise

    const mine = ++generation
    clearTimeout(timer)
    lastAttemptAt = Date.now()
    // A refresh keeps the list on screen while it loads; only the first load shows the loading line.
    if (root.dataset.state !== 'documents') setState('loading')

    const promise = (async (): Promise<void> => {
      const result = await api.documents(token)
      if (mine !== generation) return

      if (!result.ok) {
        if (result.error.kind === 'unauthenticated') {
          forgetSession()
          showLogin(message('sessionExpired'), afterSignIn || focusIsFree())
          announce('expired')
        } else if (result.error.kind === 'zone_unavailable') {
          forgetSession()
          showUnavailable(afterSignIn)
          announce('unavailable')
        } else if (root.dataset.state === 'documents') {
          // The list stays on screen, its links possibly stale; try again shortly.
          retryDelay = retryDelay === 0 ? RETRY_FIRST_MS : Math.min(RETRY_MAX_MS, retryDelay * 2)
          arm(retryDelay)
        } else {
          // Offline on a restore or right after sign-in: the token may still be good, so it is kept.
          showLogin(messageFor(result.error), afterSignIn)
        }
        return
      }

      linksDeadlineAt = linksDeadline(result.value)
      retryDelay = 0
      deferred = false
      render(result.value)
      setState('documents')
      if (linksDeadlineAt) arm(Math.max(MIN_REFRESH_MS, linksDeadlineAt - Date.now() - REFRESH_LEAD_MS))
      if (afterSignIn) focusElement(heading ?? panel)
    })()

    inflight = { generation: mine, promise }
    try {
      await promise
    } finally {
      if (inflight?.promise === promise) inflight = null
    }
  }

  /** Follow a row link after refreshing the list it belongs to — see "A CLICK ON A STALE LINK". */
  async function followFresh(target: { id: number; kind: LinkKind }, newTab: boolean, opened: Window | null) {
    await loadDocuments(false)
    const href = root.dataset.state === 'documents' ? rows.get(target.id)?.[target.kind]?.getAttribute('href') : null
    if (!href) {
      // Signed out, switched off, or the document was withdrawn meanwhile: nothing to open.
      opened?.close()
      return
    }
    if (opened) opened.location.replace(href)
    else if (newTab) window.open(href, '_blank', 'noopener,noreferrer')
    else window.location.assign(href)
  }

  form?.addEventListener('submit', async (event) => {
    event.preventDefault()
    if (busy || recall(logoutKey) || !loginInput || !passwordInput) return

    // Trimmed INTO the field, so a login of only spaces fails the browser's own `required` check,
    // which names the missing field. The password is taken as typed: spaces are legitimate in one.
    loginInput.value = loginInput.value.trim()
    const login = loginInput.value
    const password = passwordInput.value
    if (login === '' || password === '') {
      // A site override without `required` passes the check; the empty field still gets focus.
      if (form.reportValidity()) (login === '' ? loginInput : passwordInput).focus()
      return
    }

    setBusy(true)
    setError('')
    const result = await api.login(login, password)
    setBusy(false)
    // The password never outlives the attempt, successful or not.
    passwordInput.value = ''

    if (!result.ok) {
      if (result.error.kind === 'zone_unavailable') {
        showUnavailable(true)
        return
      }
      setError(messageFor(result.error))
      passwordInput.focus()
      return
    }

    rememberSession(result.value.token, result.value.idleTimeoutSeconds)
    lastInteraction = Date.now()
    announce('signed-in')
    await loadDocuments(true)
  })

  forgotButton?.addEventListener('click', () => showForgot())

  /**
   * Put the reset forms in the document — stamped from their template right after the login form,
   * unless the page rendered them directly — and wire them. False when the page has neither.
   */
  function mountResetForms(): boolean {
    if (forgotForm || resetForm) return true
    if (!q('form[data-zone-forgot-form], form[data-zone-reset-form]') && resetTemplate && form) {
      form.after(resetTemplate.content.cloneNode(true))
    }
    return wireResetForms()
  }

  function wireResetForms(): boolean {
    forgotForm = q<HTMLFormElement>('form[data-zone-forgot-form]')
    forgotLogin = forgotForm?.querySelector<HTMLInputElement>('[name="login"]') ?? null
    forgotError = q('[data-zone-forgot-error]')
    resetForm = q<HTMLFormElement>('form[data-zone-reset-form]')
    resetPassword = resetForm?.querySelector<HTMLInputElement>('[name="password"]') ?? null
    resetConfirm = resetForm?.querySelector<HTMLInputElement>('[name="password_confirmation"]') ?? null
    resetError = q('[data-zone-reset-error]')

    root.querySelectorAll<HTMLButtonElement>('button[data-zone-back]').forEach((button) => {
      button.addEventListener('click', () => showLogin('', true))
    })
    forgotForm?.addEventListener('submit', (event) => void onForgotSubmit(event))
    resetForm?.addEventListener('submit', (event) => void onResetSubmit(event))
    // Stamped while another view is up: only the state decides what shows.
    setHidden(forgotForm, root.dataset.state !== 'forgot')
    setHidden(resetForm, root.dataset.state !== 'reset')

    return forgotForm !== null || resetForm !== null
  }

  async function onForgotSubmit(event: Event): Promise<void> {
    event.preventDefault()
    if (busy || !forgotForm || !forgotLogin) return

    forgotLogin.value = forgotLogin.value.trim()
    if (forgotLogin.value === '') {
      if (forgotForm.reportValidity()) forgotLogin.focus()
      return
    }

    whileBusy(forgotForm, true)
    say(forgotError, '')
    const result = await api.requestPasswordReset(forgotLogin.value, window.location.pathname)
    whileBusy(forgotForm, false)

    if (result.ok) {
      // The same line whatever happened on the server: it never says whether an e-mail went out.
      forgotLogin.value = ''
      showLogin('', false, message('resetSent'))
      focusElement(infoBox ?? loginInput)
    } else if (result.error.kind === 'zone_unavailable') {
      showUnavailable(true)
    } else {
      say(forgotError, messageFor(result.error))
      forgotLogin.focus()
    }
  }

  async function onResetSubmit(event: Event): Promise<void> {
    event.preventDefault()
    if (busy || !resetForm || !resetPassword || !resetToken) return

    const password = resetPassword.value
    const problem = !isAcceptablePassword(password)
      ? message('resetPasswordInvalid')
      : resetConfirm && resetConfirm.value !== password
        ? message('resetMismatch')
        : ''
    if (problem) {
      say(resetError, problem)
      resetPassword.focus()
      return
    }

    whileBusy(resetForm, true)
    say(resetError, '')
    const result = await api.resetPassword(resetToken, password)
    whileBusy(resetForm, false)

    if (!result.ok && (result.error.kind === 'network' || result.error.kind === 'invalid_password')) {
      // The link is still good: the typed passwords stay for a retry over a bad connection.
      say(resetError, messageFor(result.error))
      resetPassword.focus()
      return
    }

    // Spent, dead, or the zone is off: either way the token and the typed password are done with.
    resetToken = null
    resetPassword.value = ''
    if (resetConfirm) resetConfirm.value = ''

    if (result.ok) {
      // The server ended every session of the account, this tab's included.
      forgetSession()
      showLogin('', false, message('resetDone'))
      announce('signed-out')
      loginInput?.focus()
    } else if (result.error.kind === 'zone_unavailable') {
      showUnavailable(true)
    } else if (forgotForm) {
      showForgot(messageFor(result.error))
    } else {
      showLogin(messageFor(result.error), true)
    }
  }

  async function signOut(): Promise<void> {
    const token = currentToken()
    if (!token) {
      forgetSession()
      showLogin('', true)
      return
    }
    // Persist the intent across reloads. No root may restore/refresh documents while revocation
    // is pending, but the token remains available to finish it even after an outage.
    store(logoutKey, '1')
    showSigningOut(false)
    announce('signing-out')
    let request = logoutRequests.get(zoneEndpoint)
    if (!request) {
      request = api.logout(token)
      logoutRequests.set(zoneEndpoint, request)
    }
    const result = await request
    if (logoutRequests.get(zoneEndpoint) === request) logoutRequests.delete(zoneEndpoint)
    if (currentToken() !== token) return
    if (result.ok) {
      forgetSession()
      showLogin('', true)
      announce('signed-out')
    } else if (result.error.kind === 'zone_unavailable') {
      // The zone was switched off (or this site's origin dropped) since sign-in: the server now
      // refuses the token on every route, so no retry can ever be confirmed. Same end as a list
      // refused this way — otherwise the tab stays on "sign-out could not be confirmed" for good.
      forgetSession()
      showUnavailable(true)
      announce('unavailable')
    } else {
      showSigningOut(true)
      announce('logout-failed')
    }
  }

  logoutButton?.addEventListener('click', () => void signOut())

  // A CLICK ON A STALE LINK (see the header): the new tab is opened NOW, while the gesture counts.
  list?.addEventListener('click', (event) => {
    if (event.defaultPrevented || !isStale()) return
    const anchor = event.target instanceof Element ? event.target.closest<HTMLAnchorElement>('a[href]') : null
    const target = anchor ? rowLinks.get(anchor) : undefined
    if (!anchor || !target) return

    event.preventDefault()
    const newTab = anchor.target === '_blank' || event.ctrlKey || event.metaKey || event.shiftKey
    const opened = newTab ? window.open('', '_blank') : null
    if (opened) opened.opener = null
    void followFresh(target, newTab, opened)
  })

  const onInteraction = (): void => {
    lastInteraction = Date.now()
    if (needsRefresh() && Date.now() - lastAttemptAt >= INTERACTION_REFRESH_GAP_MS) void loadDocuments(false)
  }
  const onReturn = (): void => {
    if (document.visibilityState === 'visible') onInteraction()
  }
  // Capture, so a handler that stops propagation cannot hide an interaction; passive, so none of
  // this can delay a scroll or a tap.
  for (const type of ['pointerdown', 'keydown', 'touchstart'] as const) {
    document.addEventListener(type, onInteraction, { capture: true, passive: true })
  }
  document.addEventListener('visibilitychange', onReturn)
  window.addEventListener('focus', onReturn)
  window.addEventListener('pageshow', onReturn)

  // Another root for the same endpoint changed the session this one shares.
  document.addEventListener(ZONE_SESSION_EVENT, (event) => {
    const detail = (event as CustomEvent<ZoneSessionEventDetail>).detail
    if (!detail || detail.endpoint !== zoneEndpoint || detail.source === root) return

    if (detail.change === 'signing-out' || detail.change === 'logout-failed') {
      showSigningOut(detail.change === 'logout-failed')
      return
    }
    if (detail.change === 'signed-in') {
      if (passwordInput) passwordInput.value = ''
      void loadDocuments(false)
      return
    }
    forgetSession()
    if (detail.change === 'unavailable') setState('unavailable')
    else showLogin(detail.change === 'expired' ? message('sessionExpired') : '')
  })

  // A reset link opened this page: its token leaves the address bar (and the history entry) before
  // anything else runs, so it is not left where a reload, a bookmark or a shared URL would keep it.
  // The first root on the page takes it; a root without the forms leaves the link alone.
  const rendersResetForms = q('form[data-zone-forgot-form], form[data-zone-reset-form]') !== null
  if (rendersResetForms) wireResetForms()
  // Nothing to open: a "forgot your password" control that does nothing is worse than none.
  if (forgotButton && !rendersResetForms && !resetTemplate) forgotButton.hidden = true

  const linkToken = resetTokenFrom(window.location.hash)
  if (linkToken && mountResetForms() && resetForm) {
    resetToken = linkToken
    window.history.replaceState(window.history.state, '', window.location.pathname + window.location.search)
  }

  if (resetToken) {
    setState('reset')
    q<HTMLInputElement>('form[data-zone-reset-form] [name="password"]')?.focus()
  } else if (currentToken() && recall(logoutKey)) void signOut()
  else if (currentToken()) void loadDocuments(false)
  else showLogin()
}
