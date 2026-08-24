// Types for consentEndpoint.mjs — see consent.d.mts for why these hand-written declarations exist
// at all. This is the one a client repo's astro.config.mjs needs: without it, importing
// cmsConsentEndpoint() from an installed git dependency fails ts(7016) and takes `pnpm check` down.

import type { AstroIntegration } from 'astro'

/** Astro integration: emit the consent endpoint into the build output on `astro:build:done`. */
export declare function cmsConsentEndpoint(options?: {
  cookieName?: string
  maxAgeDays?: number
}): AstroIntegration
