// Visual comparison between a REFERENCE site and this build, route by route.
//
// Two things are called "old" here and only one of them is a website that used to be live. The
// reference is whatever the build is supposed to look like: the Webflow site being replaced
// (diligently.pl), or — the case this generalisation is for — a static HTML/CSS prototype served
// locally while its design is ported into CMS blocks. Serving the prototype and pointing
// `OLD_BASE_URL` at it turns a port that was done by eye into a loop with a number in it:
// scaffold → write the UnoCSS → `test:vrt` → read the percentage → iterate.
//
// NOT A PASS/FAIL GATE, and nothing here should become one. The new build is a genuine rewrite,
// not a byte-for-byte port, so a nonzero percentage is the normal state; what the run catches is
// unintentional drift — spacing, sizing, a section that never rendered — which is easy to miss
// reviewing one screenshot at a time. The tests fail only when the run itself is broken (a bad
// response, a missing route list), never on a diff.
//
// WHY IT IS HERE AND NOT COPIED INTO EACH SITE. Measured across the fleet on 2026-08-27: this
// harness existed in exactly ONE of seven client repos, and not in the template new repos are cut
// from — while the skill documenting `pnpm test:vrt` was vendored into the dashboard twice, naming
// commands no tree there could run. Same shape as the conformance floor before #1792, and the same
// split: core ships the harness, the site ships its list (tests/vrt.routes.json).
//
// Usage — start the new build (`pnpm dev` or `pnpm preview`) and the reference, then:
//   OLD_BASE_URL=http://localhost:8080 pnpm test:vrt
// Artefacts land in `test-results/vrt/` (git-ignored): a PNG per side, a diff PNG, and a
// `<route>-report.txt` carrying either a `% pixels differ` number or a dimension mismatch.
import { test } from '@playwright/test'
import { mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { PNG } from 'pngjs'
import pixelmatch from 'pixelmatch'
import { loadRoutes, ROUTES_FILE } from './routes.js'

// NO DEFAULT, deliberately. diligently.pl's copy defaulted this to its own production host, which
// is how a shared harness starts lying on the other six sites — a run with a forgotten env var
// would compare this build against somebody else's website and report a large, plausible-looking
// percentage.
const OLD_BASE_URL = process.env.OLD_BASE_URL
if (!OLD_BASE_URL) {
  throw new Error(
    '[vrt] OLD_BASE_URL is required and has no default — it is the reference this build is ' +
      'compared against (the site being replaced, or a static prototype served locally). ' +
      'e.g. OLD_BASE_URL=http://localhost:8080 pnpm test:vrt',
  )
}
// Astro's dev/preview default, and site-neutral, so this one may keep a default.
const NEW_BASE_URL = process.env.NEW_BASE_URL ?? 'http://localhost:4321'

const { routes: ALL_ROUTES, oldDismiss: OLD_DISMISS } = loadRoutes()

// Every site built on this core sets `trailingSlash: 'always'`, so both `astro dev` and `astro
// preview` hard-404 on the slashless form — `/contact` is NOT redirected to `/contact/`. The route
// list stores the slashless path because that is what a reference commonly serves (either form),
// so only the new URL is normalized. Without this, every route but `/` screenshotted Astro's 404
// page, and the diff then reported it as a plain dimension mismatch rather than as a broken run —
// which is the whole reason it belongs in core rather than being rediscovered per repo.
//
// `lib/href.ts` normalizes the same thing more thoroughly and is the obvious call to make here.
// It cannot be: it is TypeScript, and this file runs out of `node_modules` where Node refuses to
// strip types (../conformance/README.md). Importing it would make the whole suite `0 tests in 0
// files` in every client repo. A route list holds bare internal paths, so the narrow form is
// enough — but keep the two in step if the trailing-slash convention ever changes.
const newUrl = (routePath) => `${NEW_BASE_URL}${routePath.endsWith('/') ? routePath : `${routePath}/`}`

// Desktop by default; override for a mobile pass, e.g. VRT_WIDTH=430 VRT_HEIGHT=932.
const VIEWPORT = {
  width: Number(process.env.VRT_WIDTH ?? 1440),
  height: Number(process.env.VRT_HEIGHT ?? 900),
}
// Artefacts from a non-default viewport get their own filename suffix so a mobile run never
// overwrites the desktop PNGs (and vice versa).
const SUFFIX = VIEWPORT.width === 1440 ? '' : `-${VIEWPORT.width}`

// VRT_ROUTE_NAMES=home,pricing narrows a run to specific entries in the route list — each entry is
// a full-page screenshot of both sides, so iterating on one page should not pay for all of them.
const ROUTE_FILTER = process.env.VRT_ROUTE_NAMES?.split(',')
  .map((name) => name.trim())
  .filter(Boolean)
const ROUTES = ROUTE_FILTER?.length ? ALL_ROUTES.filter((r) => ROUTE_FILTER.includes(r.name)) : ALL_ROUTES
if (ROUTE_FILTER?.length && !ROUTES.length) {
  // Otherwise a typo'd filter reports "0 tests" — indistinguishable, at a glance, from a run that
  // had nothing to do.
  throw new Error(
    `[vrt] VRT_ROUTE_NAMES=${ROUTE_FILTER.join(',')} matched nothing in ${ROUTES_FILE} ` +
      `(names there: ${ALL_ROUTES.map((r) => r.name).join(', ')}).`,
  )
}

// `process.cwd()` is the consuming repo's root, and it has to be: `import.meta.url` resolves inside
// the installed package, so a path relative to this file would write a client's screenshots into
// `node_modules/@rocksoft/cms-starter-core/` — outside the `test-results/` the repo git-ignores,
// and gone on the next install.
const outDir = path.join(process.cwd(), 'test-results', 'vrt')
mkdirSync(outDir, { recursive: true })

/**
 * Scrolls the whole page once, then returns to the top.
 *
 * Reference sites and this build both animate elements in via an IntersectionObserver, so a
 * `fullPage` screenshot taken without ever scrolling captures most of the page still in its
 * pre-reveal state — which reads as "a huge blank gap" in the artefact, not as an obvious
 * animation issue.
 */
async function scrollThroughPage(page) {
  await page.evaluate(async () => {
    const step = window.innerHeight
    for (let y = 0; y < document.body.scrollHeight; y += step) {
      window.scrollTo(0, y)
      await new Promise((r) => setTimeout(r, 120))
    }
    window.scrollTo(0, 0)
  })
  await page.waitForTimeout(300) // let the final reveal transitions settle before screenshotting
}

/**
 * Clicks a consent banner away, warning rather than failing if it does not go.
 *
 * A modal covering the viewport makes the comparison meaningless, but its absence is equally
 * normal — a static prototype has no banner, and a fresh load is not guaranteed to show one every
 * time. So this never fails a route; it says what it could not dismiss and moves on, which is
 * visible in the run output next to a percentage that will then look wrong.
 *
 * `probe` is a selector whose absence means "this site has no banner at all, stop waiting". Only
 * the new side can have one: core's banner is server-rendered, so it is in the DOM at load or it
 * is never coming. A third-party script on the reference side injects its dialog asynchronously
 * AFTER `networkidle`, so there is nothing to probe there and the wait has to be paid.
 *
 * Without the probe, a site with no consent configured pays the full timeout on every route for a
 * locator that can never match — measured at 10s a route against the starter's own build.
 */
async function dismissConsent(page, selector, label, { timeout, probe = null }) {
  if (!selector) return
  if (probe && (await page.locator(probe).count()) === 0) return
  try {
    await page.locator(selector).first().click({ timeout })
    await page.waitForTimeout(300) // the banner animates out; capturing mid-fade is its own diff
  } catch (e) {
    console.warn(`[vrt] ${label}: consent banner not dismissed via \`${selector}\` — ${e.message}`)
  }
}

// This build's banner is core's own, so core knows the handle — a data attribute rather than the
// button's text, which is per-locale and would silently stop matching on a site that is not in
// English. The container starts `hidden` and the inline script reveals it, so the click waits on
// `:not([hidden])` rather than racing it.
const NEW_CONSENT_ROOT = '[data-cookie-consent]'
const NEW_CONSENT_REJECT = `${NEW_CONSENT_ROOT}:not([hidden]) [data-cookie-consent-reject]`

for (const route of ROUTES) {
  test(`${route.name}: visual diff old vs new`, async ({ browser }) => {
    const [oldPage, newPage] = await Promise.all([
      browser.newPage({ viewport: VIEWPORT }),
      browser.newPage({ viewport: VIEWPORT }),
    ])

    try {
      const oldTarget = `${OLD_BASE_URL}${route.oldPath}`
      const newTarget = newUrl(route.path)
      const [oldResponse, newResponse] = await Promise.all([
        oldPage.goto(oldTarget, { waitUntil: 'networkidle' }),
        newPage.goto(newTarget, { waitUntil: 'networkidle' }),
      ])

      // Fail loudly on a bad response. A screenshot of an error page is still a valid PNG, so an
      // unchecked 404 degrades into a "dimension mismatch" report that reads like a layout finding
      // — the one failure mode this comparison must never disguise.
      for (const [label, response, url] of [
        ['reference', oldResponse, oldTarget],
        ['new build', newResponse, newTarget],
      ]) {
        const status = response?.status()
        if (status !== 200) {
          throw new Error(`[vrt] ${route.name}: ${label} returned ${status ?? 'no response'} for ${url}`)
        }
      }

      // Concurrently, like every other pair of two-page operations here: these are separate pages,
      // and the reference side can legitimately burn its whole timeout waiting for a banner that
      // never appears on this particular route. Serially that worst case is 15s + 10s per route.
      await Promise.all([
        // The reference's banner belongs to whatever stack the reference runs, so the site names
        // it (`old_dismiss` in the route list) and a run against a prototype names nothing.
        // Generous timeout, and no probe: Cookiebot and its kin inject their dialog asynchronously
        // AFTER `networkidle`, so its absence right now proves nothing and the wait has to be paid.
        dismissConsent(oldPage, OLD_DISMISS, `${route.name}: reference`, { timeout: 15_000 }),
        // Rejected rather than accepted, to match the most privacy-preserving choice above.
        dismissConsent(newPage, NEW_CONSENT_REJECT, `${route.name}: new build`, {
          timeout: 10_000,
          probe: NEW_CONSENT_ROOT,
        }),
      ])

      await Promise.all([scrollThroughPage(oldPage), scrollThroughPage(newPage)])

      const [oldBuffer, newBuffer] = await Promise.all([
        oldPage.screenshot({ fullPage: true }),
        newPage.screenshot({ fullPage: true }),
      ])

      writeFileSync(path.join(outDir, `${route.name}${SUFFIX}-old.png`), oldBuffer)
      writeFileSync(path.join(outDir, `${route.name}${SUFFIX}-new.png`), newBuffer)

      const oldPng = PNG.sync.read(oldBuffer)
      const newPng = PNG.sync.read(newBuffer)
      const footer = `reference: ${oldTarget}\nnew: ${newTarget}\nviewport: ${VIEWPORT.width}x${VIEWPORT.height}\n`

      // Different page lengths are themselves a meaningful signal (a missing or extra section) —
      // report it rather than cropping or padding to force a pixel-level diff that would then be
      // describing the crop instead of the site.
      if (oldPng.width !== newPng.width || oldPng.height !== newPng.height) {
        writeFileSync(
          path.join(outDir, `${route.name}${SUFFIX}-report.txt`),
          `${route.name}: dimension mismatch — reference ${oldPng.width}x${oldPng.height}, ` +
            `new ${newPng.width}x${newPng.height}\n` +
            `Skipped the pixel diff (dimensions must match). Compare the two PNGs directly.\n` +
            footer,
        )
        console.log(
          `[vrt] ${route.name}: dimension mismatch — ${oldPng.width}x${oldPng.height} vs ${newPng.width}x${newPng.height}`,
        )
        return
      }

      const { width, height } = oldPng
      const diffPng = new PNG({ width, height })
      const diffPixels = pixelmatch(oldPng.data, newPng.data, diffPng.data, width, height, { threshold: 0.1 })
      const diffPercent = ((diffPixels / (width * height)) * 100).toFixed(2)

      writeFileSync(path.join(outDir, `${route.name}${SUFFIX}-diff.png`), PNG.sync.write(diffPng))
      writeFileSync(
        path.join(outDir, `${route.name}${SUFFIX}-report.txt`),
        `${route.name}: ${diffPercent}% of pixels differ (${diffPixels}/${width * height})\n` + footer,
      )
      console.log(`[vrt] ${route.name}: ${diffPercent}% pixels differ`)
    } finally {
      // In a `finally` so a bad response or a decode failure does not leak two pages per route into
      // a run that still has to open two more for the next one.
      await Promise.all([oldPage.close(), newPage.close()])
    }
  })
}
