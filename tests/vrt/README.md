# Visual-regression harness — what core owns and what a site must wire

`compare-old-vs-new.spec.js` screenshots a representative set of routes on a **reference** and on
**this build**, then pixel-diffs them — both as one whole page AND section by section (see
"Section-by-section breakdown" below). Artefacts land in the consuming repo's `test-results/vrt/`
(git-ignored): a full-page PNG per side, a whole-page diff PNG when the two are the same size, a
`<route>-report.txt`, and a `<route>-sections/` directory with a PNG pair (plus a diff PNG when
that one section's heights happen to match) per section.

The reference is whatever the build is supposed to look like — the site being replaced, or a
**static HTML/CSS prototype served locally** while its design is ported into CMS blocks. The
second case is why route entries may carry an `old_path`: a prototype answers at `/kontakt.html`
where the built site answers at `/kontakt/`.

**It is not a pass/fail gate and should not become one.** The new build is a rewrite, not a
byte-for-byte port, so a nonzero percentage is normal. A test fails only when the run itself is
broken — a non-200 on either side, a missing route list, a filter matching nothing.

## Wiring a site (four things)

Bumping the core pin ships the harness but does not switch it on — same as the conformance floor
(diligently-dashboard#1792). Per repo, on the same `starter-update` branch:

1. `playwright.vrt.config.ts` — its own config, because this one has **no `webServer`**: it
   compares two independently served URLs rather than testing the repo in isolation. Point
   `testDir` at this directory through
   `require.resolve('@rocksoft/cms-starter-core/package.json')` — see `frontend/playwright.vrt.config.ts`
   in the dev tree, and **never** write a literal `./packages/…` path (that directory does not
   exist in a client repo; `StarterTemplate::EXCLUDED_PREFIXES` strips it).
2. `tests/vrt.routes.json` — the site's list. One entry per **distinct layout**, not per page:
   each is two full-page screenshots and a diff.
3. `"test:vrt": "playwright test --config=playwright.vrt.config.ts"` in `package.json`.
4. `pixelmatch` + `pngjs` as devDependencies. They are optional peerDependencies here because core
   is consumed raw as a git dependency and installs nothing of its own.

## Running it

```sh
pnpm preview                                   # or pnpm dev, in another terminal
OLD_BASE_URL=http://localhost:8080 pnpm test:vrt
```

`OLD_BASE_URL` has **no default**, deliberately: diligently.pl's copy defaulted to its own
production host, and a shared harness carrying one client's hostname is how it starts lying on the
other six.

| env                        | effect                                                                                                            |
| -------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| `OLD_BASE_URL`             | the reference origin — **required**                                                                               |
| `NEW_BASE_URL`             | this build (default `http://localhost:4321`)                                                                      |
| `VRT_WIDTH` / `VRT_HEIGHT` | viewport; anything but 1440 wide gets its own filename suffix, so a mobile pass never overwrites the desktop PNGs |
| `VRT_ROUTE_NAMES`          | `home,pricing` — narrow a run while iterating on one page                                                         |
| `VRT_REPO`                 | read the route list from ANOTHER checkout; the PNGs still land in the cwd (`../measure/README.md` explains why)   |

Serving a static prototype for the reference side is whatever is at hand, e.g.
`npx serve -l 8080 .` inside the prototype repo.

## Two things that silently corrupt every screenshot

Both are handled here, and both are the reason this is one file in core rather than seven copies:

- **Consent modals.** A full-viewport dialog makes the diff meaningless. The reference's belongs to
  whatever stack the reference runs, so the site names it in `old_dismiss` (Cookiebot's is
  `#CybotCookiebotDialogBodyButtonDecline`); a prototype has none and names nothing. This build's
  banner is core's own, so core clicks it by data attribute rather than by button text, which is
  per-locale. The reference's is waited for _generously_ — a third-party script injects its dialog
  after `networkidle`, and the two page loads run concurrently — while the new side is probed
  first, so a site with no consent configured pays nothing per route instead of a full timeout.
- **Scroll-triggered reveals.** A `fullPage` screenshot taken without ever scrolling captures most
  of the page in its pre-reveal state — which reads as a huge blank gap, not as an animation issue.
  The spec scrolls the whole page first.

And one that corrupts a whole run: the starter sets `trailingSlash: 'always'`, so `astro dev` and
`astro preview` **hard-404 on the slashless form**. The spec normalizes the new URL. Without it,
every route but `/` screenshotted Astro's 404 page and the diff reported a plain dimension mismatch
rather than a broken run.

## Why these files are `.js`

Same reason as `../conformance/README.md`, which has the measurement: a consuming site runs them
straight out of `node_modules`, and Node refuses to strip types there —
`Total: 0 tests in 0 files`, in exactly the repos the suite was built for, while passing in the dev
tree where core is a workspace symlink whose realpath escapes `node_modules`.

The site's route list is **JSON** for a related reason. A `.ts` file in the site is outside that
jail, but reaching it from here means a runtime `import()` whose type stripping depends on the
consumer's Node minor — off by default before 22.18, and the fleet pins `node >= 22.12`. JSON has
none of that surface, and it is what `tests/conformance.exemptions.json` already established;
prose goes under `_`-prefixed keys.

## Reading the result

`test-results/vrt/<route>-report.txt` gives a percentage or a dimension mismatch. A mismatch means
_"do not bother pixel-diffing this — open the two PNGs"_, not _"the tool failed"_.

A huge mismatch where the new side is roughly one viewport tall usually is not a frontend bug at
all: check whether that page has any blocks in the CMS before touching a component. Two
"empty-looking" routes once turned out to have had their content never migrated.

For confirming one specific fix, compare `getBoundingClientRect()` / `getComputedStyle()` on the
element. Pixel-diff percentages are good at _finding_ differences across many routes at once and
noisy at _confirming_ a single one.

## Section-by-section breakdown

Every route also gets a `<route>-sections/` directory: the page's top-level elements (`body > *`
by default — one `<section>` per CMS block, plus the header and footer), paired old-vs-new by
POSITION, each cropped to its own PNG pair (and a diff PNG when that one section's height happens
to match between the two sides). `<route>-report.txt` gets a matching table.

**This is why it exists, and when to reach for it instead of the whole-page numbers above:** a
page ported section by section spends most of its life at a different TOTAL height than its
reference — one section is still mid-fix while the rest already matches. The whole-page comparison
sees that as a single dimension mismatch and gives up on pixel-diffing entirely ("compare the two
PNGs directly"), which is exactly the state a page is in for most of a port, not an edge case.
Section pairing survives an individual section's height differing; the whole page's total does
not have to. Read `<route>-sections/NN-old.png` / `NN-new.png` (and `NN-diff.png` where present)
directly — the report's per-section line is the index into which pair to open.

**Both sides' selector are overridable per site** (`section_selector` / `old_section_selector` in
`tests/vrt.routes.json`, both default to `body > *`) because a Webflow export's own nesting is not
guaranteed to put one wrapper per visual section directly under `body` — some exports bury a
section a level deeper, or wrap the whole content column in one extra `div`. If the reference
side's row count in the report looks wrong (far more or fewer rows than the page visibly has
sections), read the export's actual markup and point `old_section_selector` at whatever IS the
right level, rather than trusting `body > *` blindly.

**Pairing is positional, not by tag/class/id**, and only tolerates a HEIGHT difference — inserting
or removing a section shifts every pairing after it, the same way the whole-page comparison always
could not tell "everything moved down by one section" from "everything is wrong". A section-count
mismatch is reported as its own line (`⚠ section count differs`) rather than silently truncated,
which is the signal to re-check by eye rather than trust the rows past that point.

**Static, at-rest comparison only — not a substitute for checking motion.** A scroll-triggered
reveal, a hover state, a parallax offset, or a decorative canvas/video-driven effect computes to
its RESTING value in a screenshot (usually `none`/its initial frame), never to what a visitor
actually sees while scrolling or pointing at it — matching or not matching at rest says nothing
about either. Read the export's own interaction data instead (`pnpm parity:source --motion` in the
`webflow-parity` skill, which decodes Webflow's IX2 action lists directly) and verify anything
scroll/hover/parallax-driven by hand in a real browser, not from these PNGs.
