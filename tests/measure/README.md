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
| this | **by what**, on the selectors a site named | `600x462` against `800` tall, `gap: 48px` against `12px`, `16/25.6` against `18/29` |
| `../../scripts/parity-audit.mjs` | **by what**, without naming anything first | both sides walked element by element, plus a screenshot of each |

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

A site whose export shares no class names with its build lists a page **twice** — a build-flavoured
target and a reference-flavoured one, named by convention `post` and `post-ref`. Recording naturally
happens against `post-ref` (its selectors are the ones that resolve on the reference), and the file
lands under `post.json` regardless — the name `MEASURE_BASELINE=1` will look for once it runs the
build-flavoured target — rather than needing a rename by hand (dashboard#1966).

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
| `MEASURE_REPO` | read the target list and the baseline from ANOTHER checkout — see below |

## Measuring a checkout you are not standing in

`MEASURE_REPO` points a run at another repo's list and baseline. The reason is that the tooling and
the guidance around it — this file, the `measure-workflow` skill, `parity:audit` — live in the
**starter dev tree**, while a client repo receives its copy once at provisioning and never again
(dashboard#1694). Aiming the harness at a client checkout is cheaper than shipping the guidance
seven ways, and it is what lets a port be driven from the tree that has the tools.

```sh
MEASURE_REPO=../../www/allteck \
OLD_BASE_URL=https://www.old-allteck.no \
NEW_BASE_URL=https://allteck.no \
pnpm test:measure
```

The build under measurement is whatever `NEW_BASE_URL` answers — a local `pnpm preview` in that
checkout, or the **deployed** site, which needs no checkout at all beyond the target list.

**The two roots differ on purpose:**

| what | where it goes | why |
| --- | --- | --- |
| `tests/measure.targets.json`, `tests/measure.baseline/` (read) | `MEASURE_REPO` | the site owns its list, wherever you happen to be standing |
| `tests/measure.baseline/<name>.json` (written by `MEASURE_SAVE=1`) | `MEASURE_REPO` | it is committed, and it is the measured site's own data |
| `test-results/measure/` | the **cwd** | scratch to be looked at once, git-ignored, belongs to whoever ran the comparison |

Unset, everything resolves from the cwd exactly as before. Set to a path that is not a directory,
the run fails naming the variable — rather than falling through to "no target list at …", which
reads as a site that never wired the harness up and sends you editing the wrong repo.

`VRT_REPO` does the same for the route list in `../vrt`; that harness has no baseline, so its PNGs
and reports stay in the cwd.

## Notes

- **The two capture traps are handled**, in `../shared/page-prep.js` shared with VRT: a consent
  modal shifts everything under it, and a page never scrolled holds its lazy images unloaded — an
  image measures `height: 0` and sends you hunting a CSS bug that is not there.
- **A selector matching nothing FAILS the run** rather than reporting "no differences". The two are
  indistinguishable in a report, and the second is the more comforting of the two lies.
- **An `<img>` with `naturalWidth: 0` FAILS the run**, for the same reason: its box is laid out by
  CSS whether or not the bytes arrive, so a wrong `src` (a full CDN URL where the field stores a
  public-disk path, say) measures perfectly while rendering nothing (dashboard#1966).
- **Keep the property list in `compare-metrics.spec.js` shared, not per-site.** A run prints only
  what differs, so an irrelevant property costs a line in the JSON and nothing in the report; the
  cost of a per-site list is that two sites disagree about what "measured" means.
- **This can only check what somebody already named.** Everything outside the target list is
  invisible to it, and on one port that gap is where a footer's six rows, a quote's portrait and a
  form's whole inline stylesheet shipped wrong while the run stayed green (dashboard#1966). Walk
  the section with `pnpm parity:audit` instead of extending the list one selector after each miss.

## See also

- `../../scripts/README.md` — `parity:source` (what the reference authored) and `parity:audit` (a
  whole section, both sides, with screenshots).
- `../vrt/README.md` — the visual-regression harness.
- The `measure-workflow` skill in a repo's `.claude/skills/`, which carries this in the form a
  porting session reads.
