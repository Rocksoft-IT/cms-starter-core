// Starter contract: whether this build should serve fixture data instead of hitting the
// live CMS API. Read the same way by src/lib/api.ts here, and by any project built on this
// starter that supplies its own sites/<slug>/fixtures/ — see docs/starter.md.
export const MOCK_MODE = import.meta.env.ASTRO_API_MOCK === '1'
