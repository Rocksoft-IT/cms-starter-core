import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, test } from 'vitest'
import { SOCIAL_NETWORKS, socialNetwork } from '../lib/social-networks'

/**
 * The glyph map and the CMS's network list are one contract, held equal here in both directions
 * (dashboard: social-links-block).
 *
 * A network the panel offers with no glyph in core renders as NOTHING - SocialLinks.astro skips
 * the row, on purpose, so the failure has no other signal. A glyph nothing can pick is dead weight
 * that drifts. Reading the COMMITTED schema rather than the live API keeps this offline and makes
 * a registry edit without a core edit fail the build, which is where a new network should be
 * caught: the same PR, not the first client that selects it.
 */
const SCHEMA = JSON.parse(readFileSync(fileURLToPath(new URL('../../../schema/blocks.json', import.meta.url)), 'utf8'))

const offered: string[] = Object.keys(SCHEMA.social_links.fields.links.fields.network.options)

describe('social network glyphs', () => {
  test('the schema actually offers a network list', () => {
    // Without this the two set assertions below pass vacuously on an empty list.
    expect(offered.length).toBeGreaterThan(10)
    expect(offered).toContain('linkedin')
  })

  test('every network the CMS offers has a glyph, and every glyph is offered', () => {
    expect(Object.keys(SOCIAL_NETWORKS).sort()).toEqual([...offered].sort())
  })

  test('every glyph is one filled path on the 24x24 box with a display name', () => {
    for (const [key, network] of Object.entries(SOCIAL_NETWORKS)) {
      expect(network.label, key).not.toBe('')
      expect(network.path, key).toMatch(/^M[\d.]/)
      // A stroked outline from lib/icons.ts pasted here would render as a filled blob; the two
      // maps are siblings, not interchangeable.
      expect(network.path, key).not.toContain('stroke')
    }
  })

  test('the lookup answers only for a known string key', () => {
    expect(socialNetwork('linkedin')?.label).toBe('LinkedIn')
    expect(socialNetwork('twitter')).toBeUndefined()
    expect(socialNetwork('')).toBeUndefined()
    expect(socialNetwork(undefined)).toBeUndefined()
    expect(socialNetwork(3)).toBeUndefined()
  })
})
