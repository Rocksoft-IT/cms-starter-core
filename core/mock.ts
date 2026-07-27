// Starter contract: whether this build should serve fixture data instead of hitting the live CMS
// API. Read by `lib/api.ts` in this package, against the fixtures each repo supplies at
// `src/fixtures/` — see docs/starter.md.
//
// NOTE: this is a module-level `import.meta.env` read, which is why this module — and everything
// importing it, `lib/api.ts` included — can only be loaded by a Vite build. In plain Node
// `import.meta.env` is undefined and this line throws.
export const MOCK_MODE = import.meta.env.ASTRO_API_MOCK === '1'
