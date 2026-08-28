# Metric harness — what core owns and what a site must wire

`compare-metrics.spec.js` reads the same CSS selectors on a **reference** and on **this build**,
then prints **only the properties that differ**. Artefacts land in the consuming repo's
`test-results/measure/` (git-ignored): a `<name>.json` with every property read on both sides, and
a `<name>-report.txt` with the table.

## Why this exists next to `../vrt`

They answer different halves of the same question, and porting a layout needs both:

| | asks | answers with |
| --- | --- | --- |
| `../vrt` | **which** pages differ, and roughly where | a `% pixels differ` and a diff PNG |
| this | **by what**, exactly | `600x462` against `800` tall, `gap: 48px` against `12px`, `16/25.6` against `18/29` |

VRT finds the section; this says what to type. Before it existed, the second half was done by
pasting ad-hoc `getBoundingClientRect` snippets into a devtools console — a different set of
properties each time, and nothing written down afterwards.

**Neither is a pass/fail gate by default.** The new build is a rewrite, not a byte-for-byte port,
so differences are the normal state; a red suite would train everyone to ignore it. A test fails
only when the RUN is broken: a non-200 on either side, a selector matching nothing, a missing
target list. `MEASURE_STRICT=1` turns surviving differences into failures, which is what a baseline
regression run wants.

## Wiring a site (three things)

Bumping the core pin ships the harness but does not switch it on — same as the conformance floor
and VRT. Per repo:

1. `playwright.measure.config.ts` — its own config, because like VRT it has **no `webServer`**: it
   compares two independently served URLs. Point `testDir` here through
   `require.resolve('@rocksoft/cms-starter-core/package.json')`, and **never** write a literal
   `./packages/…` path (that directory does not exist in a client repo).
2. `tests/measure.targets.json` — the site's list: one entry per layout being ported, each naming
   the selectors worth watching on it.
3. `"test:measure": "playwright test --config=playwright.measure.config.ts"` in `package.json`.

No extra dependencies: this uses Playwright, which the repo already has for the e2e suite.

## Running it

```sh
pnpm preview                                          # or pnpm dev, in another terminal
OLD_BASE_URL=https://www.example.com pnpm test:measure
```

```
2 of 5 selectors differ

  cover  (.post-cover img)
    property   reference  build
    height     462        800
    aspectRatio 600 / 462  auto

  title  ✓  matches
```

### Recording a baseline

A site being replaced gets switched off, and then the reference is gone. Record it first:

```sh
OLD_BASE_URL=https://www.example.com MEASURE_SAVE=1 pnpm test:measure   # → tests/measure.baseline/
MEASURE_BASELINE=1 pnpm test:measure                                    # offline, no reference needed
```

The baseline is committed (it is small JSON), which also makes it reviewable: a diff against it in a
PR is a legible statement about what the port changed.

| env | effect |
| --- | --- |
| `OLD_BASE_URL` | the reference origin — **required** unless `MEASURE_BASELINE=1` |
| `NEW_BASE_URL` | this build (default `http://localhost:4321`) |
| `MEASURE_SAVE=1` | record the reference to `tests/measure.baseline/<name>.json` and compare nothing |
| `MEASURE_BASELINE=1` | compare the build against the saved baseline instead of a live reference |
| `MEASURE_STRICT=1` | fail the test when anything still differs |
| `MEASURE_WIDTH` / `MEASURE_HEIGHT` | viewport (default 1440x900) |
| `MEASURE_NAMES` | `post,home` — narrow a run while iterating on one layout |
| `MEASURE_TOLERANCE` | px difference treated as noise (default `0.5`) |

## Notes

- **The two capture traps are handled**, in `../shared/page-prep.js` shared with VRT: a consent
  modal shifts everything under it, and a page never scrolled holds its lazy images unloaded — an
  image measures `height: 0` and sends you hunting a CSS bug that is not there.
- **A selector matching nothing FAILS the run** rather than reporting "no differences". The two are
  indistinguishable in a report, and the second is the more comforting of the two lies.
- **Keep the property list in `compare-metrics.spec.js` shared, not per-site.** A run prints only
  what differs, so an irrelevant property costs a line in the JSON and nothing in the report; the
  cost of a per-site list is that two sites disagree about what "measured" means.
