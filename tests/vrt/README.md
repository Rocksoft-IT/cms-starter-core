# Visual-regression harness — what core owns and what a site must wire

`compare-old-vs-new.spec.js` screenshots a representative set of routes on a **reference** and on
**this build**, then pixel-diffs them. Artefacts land in the consuming repo's `test-results/vrt/`
(git-ignored): a PNG per side, a diff PNG, and a `<route>-report.txt` carrying either a
`% pixels differ` number or a dimension mismatch.

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
