// The two things that silently corrupt a capture of a page — whether that capture is a screenshot
// (tests/vrt) or a set of measurements (tests/measure).
//
// They live here rather than in either harness because they are the same problem in both, and the
// VRT README already had to record them at length once. A second copy in the measure harness would
// be a second place to fix the next thing learned about consent banners, and the fleet's whole
// argument for shipping tooling in core is that it must not work that way.
//
// Deliberately NOT parameterised beyond what the two callers actually differ on. Base URLs,
// viewport and the route/target list are per-tool (their env prefixes and their JSON shapes
// differ), and folding them in here would produce a helper whose signature is longer than the code
// it saves.

/**
 * Scrolls the whole page once and returns to the top.
 *
 * A page captured without ever scrolling holds every scroll-triggered reveal in its PRE-reveal
 * state, and every lazily-loaded image unloaded. In a screenshot that reads as a huge blank gap;
 * in a measurement it reads as `height: 0` on an image that is perfectly fine — a finding that
 * sends you looking for a CSS bug that is not there.
 *
 * @param {import('@playwright/test').Page} page
 */
export async function scrollThroughPage(page) {
  await page.evaluate(async () => {
    const step = window.innerHeight
    for (let y = 0; y < document.body.scrollHeight; y += step) {
      window.scrollTo(0, y)
      await new Promise((r) => setTimeout(r, 120))
    }
    window.scrollTo(0, 0)
  })
  await page.waitForTimeout(300) // let the final reveal transitions settle
}

/**
 * Clicks a consent banner away, warning rather than failing if it does not go.
 *
 * A modal covering the viewport makes a screenshot meaningless and shifts what is under it, which
 * moves every box a measurement reads. But its absence is equally normal — a static prototype has
 * no banner, and a fresh load is not guaranteed to show one every time. So this never fails a
 * route; it says what it could not dismiss and moves on, which is visible in the run output next
 * to the numbers that will then look wrong.
 *
 * `probe` is a selector whose absence means "this site has no banner at all, stop waiting". Only
 * the new side can have one: core's banner is server-rendered, so it is in the DOM at load or it
 * is never coming. A third-party script on the reference side injects its dialog asynchronously
 * AFTER `networkidle`, so there is nothing to probe there and the wait has to be paid.
 *
 * Without the probe, a site with no consent configured pays the full timeout on every route for a
 * locator that can never match — measured at 10s a route against the starter's own build.
 *
 * @param {import('@playwright/test').Page} page
 * @param {string | null} selector  what to click; nothing happens without one
 * @param {string} label            prefixed to the warning, e.g. "home: reference"
 * @param {{ timeout: number, probe?: string | null, tool?: string }} options
 */
export async function dismissConsent(page, selector, label, { timeout, probe = null, tool = 'compare' }) {
  if (!selector) return
  if (probe && (await page.locator(probe).count()) === 0) return
  try {
    await page.locator(selector).first().click({ timeout })
    await page.waitForTimeout(300) // the banner animates out; capturing mid-fade is its own diff
  } catch (e) {
    console.warn(`[${tool}] ${label}: consent banner not dismissed via \`${selector}\` — ${e.message}`)
  }
}

// This build's banner is core's own, so core knows the handle — a data attribute rather than the
// button's text, which is per-locale and would silently stop matching on a site that is not in
// English. The container starts `hidden` and the inline script reveals it, so the click waits on
// `:not([hidden])` rather than racing it.
export const NEW_CONSENT_ROOT = '[data-cookie-consent]'
export const NEW_CONSENT_REJECT = `${NEW_CONSENT_ROOT}:not([hidden]) [data-cookie-consent-reject]`

/**
 * Every site built on this core sets `trailingSlash: 'always'`, so both `astro dev` and `astro
 * preview` hard-404 on the slashless form — `/contact` is NOT redirected to `/contact/`. A route
 * or target list stores the slashless path because that is what a reference commonly serves
 * (either form), so only the NEW url is normalized. Without this, every route but `/` reads
 * Astro's 404 page, which then reports as a layout finding rather than as a broken run.
 *
 * `lib/href.ts` normalizes the same thing more thoroughly and is the obvious call to make here. It
 * cannot be: it is TypeScript, and this file runs out of `node_modules` where Node refuses to strip
 * types (../conformance/README.md). Importing it would make the whole suite `0 tests in 0 files` in
 * every client repo. A list holds bare internal paths, so the narrow form is enough — but keep the
 * two in step if the trailing-slash convention ever changes.
 *
 * @param {string} baseUrl
 * @param {string} routePath
 */
export const withTrailingSlash = (baseUrl, routePath) =>
  `${baseUrl}${routePath.endsWith('/') ? routePath : `${routePath}/`}`
