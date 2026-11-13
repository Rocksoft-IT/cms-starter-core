import { afterEach, describe, expect, test, vi } from 'vitest'
import {
  reportZoneUnavailable,
  resetZoneUnavailableReports,
  resolveProtectedZone,
} from '../core/protected-zone/settings'

// The build-time switch: a protected_zone block renders a working form only when site-settings
// says the zone is on AND names an endpoint a form can post to. Everything else — including the
// ABSENT key a mock build, an older panel and a failed fetch all produce — is the "unavailable"
// notice, never a form posting to nowhere.

afterEach(() => {
  resetZoneUnavailableReports()
  vi.restoreAllMocks()
})

describe('resolveProtectedZone()', () => {
  test('on, with the endpoint normalised', () => {
    expect(
      resolveProtectedZone({ protected_zone: { enabled: true, endpoint: 'https://bee.diligently.pl/api/zone/' } }),
    ).toEqual({ enabled: true, endpoint: 'https://bee.diligently.pl/api/zone' })
  })

  test('absent, null or off is off', () => {
    for (const settings of [
      null,
      undefined,
      {},
      { protected_zone: { enabled: false, endpoint: null } },
      // A stray endpoint does not switch the zone on by itself.
      { protected_zone: { enabled: false, endpoint: 'https://bee.diligently.pl/api/zone' } },
    ]) {
      expect(resolveProtectedZone(settings), JSON.stringify(settings)).toEqual({ enabled: false, reason: 'disabled' })
    }
  })

  test('on without a usable endpoint is off, and says why', () => {
    for (const endpoint of [null, '', '/api/zone', 'javascript:alert(1)']) {
      expect(resolveProtectedZone({ protected_zone: { enabled: true, endpoint } }), String(endpoint)).toEqual({
        enabled: false,
        reason: 'no_endpoint',
      })
    }
  })
})

describe('reportZoneUnavailable()', () => {
  test('one [cms] line per build, naming the first page it was seen on', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})

    reportZoneUnavailable('/akty-notarialne/', 'disabled')
    reportZoneUnavailable('/en/notarial-deeds/', 'disabled')

    expect(warn).toHaveBeenCalledTimes(1)
    const line = String(warn.mock.calls[0]![0])
    expect(line.startsWith('[cms]')).toBe(true)
    expect(line).toContain('/akty-notarialne/')
    expect(line).toContain('unavailable')
  })
})
