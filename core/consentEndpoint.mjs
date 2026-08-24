// The build-time half of the consent cookie (#1470): an Astro integration that writes the endpoint
// core/consent.mjs describes into the build output.
//
// Separate from consent.mjs so that module stays free of `node:` builtins — core/analytics.ts
// imports the constants from it, and analytics.ts is reachable from component frontmatter.
//
// Plain .mjs with a .d.mts sibling, for the reason redirects.mjs is: astro.config.mjs loads this in
// Node before the Vite pipeline exists, and a client repo consumes core as an installed git
// dependency where TypeScript refuses a JS module carrying no declarations.

import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { CONSENT_ENDPOINT_PATH, CONSENT_MAX_AGE_DAYS, consentEndpointSource } from './consent.mjs'

/**
 * Astro integration: write the consent endpoint into the build output.
 *
 * Emitted from core rather than committed to each client repo's `public/` for the same reason
 * cmsRedirects() lives here — a fix then ships with a core pin bump instead of a per-repo file
 * sync across the fleet.
 *
 * `astro:build:done` and not `public/`: this file's content depends on CONSENT_MAX_AGE_DAYS, and
 * generating it is what keeps the lifetime a single constant instead of a number duplicated into
 * a static asset that nobody remembers to change.
 *
 * A dev server never runs this hook, so `pnpm dev` has no endpoint and the browser half falls
 * back to localStorage — the pre-#1470 behaviour, which is the right thing for local work.
 *
 * @param {{ cookieName?: string, maxAgeDays?: number }} [options]
 * @returns {import('astro').AstroIntegration}
 */
export function cmsConsentEndpoint(options = {}) {
  return {
    name: '@rocksoft/cms-starter-core:consent-endpoint',
    hooks: {
      'astro:build:done': async ({ dir, logger }) => {
        const target = path.join(fileURLToPath(dir), CONSENT_ENDPOINT_PATH.replace(/^\//, ''))

        await mkdir(path.dirname(target), { recursive: true })
        await writeFile(target, consentEndpointSource(options), 'utf8')

        const days = options.maxAgeDays ?? CONSENT_MAX_AGE_DAYS
        logger.info(`consent endpoint at ${CONSENT_ENDPOINT_PATH} (cookie lasts ${days} days).`)
      },
    },
  }
}
