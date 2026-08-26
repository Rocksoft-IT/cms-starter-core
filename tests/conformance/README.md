# Conformance suite — why these files are `.js` and not `.ts`

Everything else this package ships is TypeScript, and these three files deliberately are not.

A consuming site runs them straight out of `node_modules`, and Node refuses to strip types there:

```
Error: Stripping types is currently unsupported for files under node_modules,
for ".../@rocksoft/cms-starter-core/tests/conformance/quality.spec.ts"
Total: 0 tests in 0 files
```

Measured in scandinavian-taste on 2026-08-27, on the first real adoption. The rest of the package
(`core/*.astro`, `lib/*.ts`, `types/*.ts`) is fine because **Astro and Vite compile it** — this is
specifically Playwright's Node-based loader, and only for files under `node_modules`.

The blocker is TypeScript, not `node_modules`. A plain-JS spec in the same directory is discovered
and runs (verified with a throwaway `probe.spec.js`: `Total: 1 test in 1 file`), which is what
makes JS the fix rather than, say, copying the suite into every client repo at install time —
copies are the thing this suite exists to stop.

## What that costs, and what it does not

- **No type checking on these three files.** `astro check` in the dev tree no longer sees them.
  They are test code with a small surface, and the alternative was a build step in a package that
  is consumed raw as a git dependency.
- **Nothing else changes.** They are ES modules either way, they import `@playwright/test` the same
  way, and the dev tree runs them from `packages/` where TS would also have worked.

## If you are tempted to convert them back

Run the suite from a CLIENT repo, not from `frontend/`. In the dev tree core is a workspace folder,
so type stripping applies and TypeScript appears to work — which is exactly how this shipped as
`.ts` in the first place (diligently-dashboard#1792, corrected the same night).
