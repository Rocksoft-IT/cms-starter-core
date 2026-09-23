// The conformance floor: what must be true of EVERY page on EVERY site built on this core.
//
// These are engine properties, not design ones. Nothing here knows a brand colour, a measure or a
// type scale — a site's own `design-contract` spec owns all of that and must stay in its repo.
// What lives here is the class of defect that is invisible until someone hits it on a real device:
// a page that pans sideways on a phone, an image with no name, a heading outline with a hole in
// it, an embed a screen reader cannot announce.
//
// WHY IT IS HERE AND NOT COPIED INTO EACH SITE. Measured across the fleet on 2026-08-26: this
// floor existed in exactly ONE of seven client repos. Six sites had no narrow-viewport check at
// all, and the template new sites are born from had none either — so a client provisioned that
// morning started life with 29 specs covering core's block renderers and nothing covering whether
// its pages fit on a phone. The bug that prompted this (smbp#207, a pill 18px wider than a 320px
// viewport) would have been invisible on six of the seven.
//
// Copying it seven times is what produced that spread: rebelia and raw-operations carry 21 and 22
// near-identical specs, differing by one file, while kaffemaskin-til-bedrift has four. A site's
// quality bar should not be a function of the day its repo was forked.
import { expect, test } from '@playwright/test'
import { routes, routeWithBlock } from './fixtures.js'
import { exempt, selectorExcluding } from './exemptions.js'

/**
 * Asserted over every built page, so a regression on a quiet one is as loud as on the home page —
 * except on routes the site has excused for this check.
 *
 * The per-route escape hatch is not decoration. Three of these checks have no DOM handle to
 * exempt (a page overflows, or starts on an `h2`, or carries an image the CMS will not give an
 * `alt` — there is no selector for "this one, deliberately"), so without a route-level opt-out a
 * site with one such page has a suite it cannot make pass, and a suite that cannot pass gets
 * switched off. The route is still listed and still reported as skipped, so the debt stays
 * visible rather than disappearing.
 */
const eachRoute = (name, check, assert) =>
  test.describe(name, () => {
    const excused = new Set(exempt(check))
    for (const route of routes()) {
      test(route, async ({ page }) => {
        test.skip(excused.has(route), `excused for this route in tests/conformance.exemptions.json`)
        await page.goto(route)
        await assert(page, route)
      })
    }
  })

/**
 * Every way the fleet loads a webfont. Astro's font API self-hosts under `_astro/fonts/`
 * (smbp, scandinavian-taste); a site still on the CMS `fonts` branding pulls from Google. A glob
 * that covers only the first silently turns this check into a no-op on the second — which is worse
 * than not having it, because it reports green.
 */
const FONT_REQUESTS = [
  '**/_astro/fonts/**',
  '**/fonts.gstatic.com/**',
  '**/fonts.googleapis.com/**',
  '**/*.woff2',
  '**/*.woff',
]

eachRoute('nothing overflows a narrow phone', 'narrowOverflow', async (page, route) => {
  // Measured in the FALLBACK face, and that is the whole value of this check rather than a detail
  // of it. `font-display: swap` renders the fallback until the webfont lands, so it is what a
  // visitor on a slow connection actually sees — and it is the WIDER of the two, so a layout that
  // survives it survives the webfont too.
  //
  // Measuring whichever face won the race is how smbp#207 stayed open for two weeks: the suite
  // passed on a warm local cache and failed on a cold CI runner, and the difference read as a flake.
  //
  // A SECOND page, blocked before its first navigation, rather than blocking and reloading this
  // one: a route handler registered after a page has already fetched its fonts may never see the
  // request again, since the reload can serve them from cache. Blocking first is what makes the
  // strict case deterministic instead of merely likely.
  const strict = await page.context().newPage()
  for (const pattern of FONT_REQUESTS) await strict.route(pattern, (r) => r.abort())
  await strict.setViewportSize({ width: 320, height: 800 })
  await strict.goto(route)

  // A single unwrapped element makes the WHOLE page pan sideways, which on a phone reads as broken
  // rather than as one wide element — so the document, not the element, is what is asserted.
  const overflow = await strict.evaluate(() => ({
    doc: document.documentElement.scrollWidth,
    view: document.documentElement.clientWidth,
  }))
  await strict.close()
  expect(overflow.doc, 'the document is wider than the viewport').toBeLessThanOrEqual(overflow.view)
})

eachRoute('images describe themselves and reserve their space', 'imageContract', async (page) => {
  const offenders = await page.locator('img').evaluateAll((imgs) =>
    imgs
      .map((img) => ({
        src: (img.getAttribute('src') ?? '').split('/').pop(),
        // `alt` must be PRESENT; empty is a valid, meaningful value (decorative).
        missingAlt: !img.hasAttribute('alt'),
        // Without both, the browser cannot reserve the box and the page jumps as photos land.
        //
        // Asked only of an image the CMS actually MEASURED, which `srcset` is the marker for. An
        // unmeasured one has no dimensions to emit, and core renders it as a plain tag rather than
        // inventing them — requiring it here would fail that case for having no data rather than
        // for being wrong.
        unsized: img.hasAttribute('srcset') && !(img.hasAttribute('width') && img.hasAttribute('height')),
      }))
      .filter((r) => r.missingAlt || r.unsized),
  )
  expect(offenders).toEqual([])
})

eachRoute('the heading outline has no gaps', 'headingOutline', async (page) => {
  const levels = await page
    .locator('h1, h2, h3, h4, h5, h6')
    .evaluateAll((els) => els.map((el) => Number(el.tagName[1])))

  if (!levels.length) return // a page may legitimately render no headings (a bare redirect stub)
  expect(levels[0], 'the first heading on a page is its <h1>').toBe(1)
  // A jump (h2 → h4) leaves a screen reader's outline claiming a section that was never opened.
  for (let i = 1; i < levels.length; i++) {
    expect(levels[i] - levels[i - 1], `heading ${i} jumps from h${levels[i - 1]} to h${levels[i]}`).toBeLessThanOrEqual(
      1,
    )
  }
})

eachRoute('framed third-party content says what it is', 'iframeTitle', async (page) => {
  // An iframe with no accessible name is announced as an unlabelled frame: the listener is told
  // something is embedded and nothing about what (WCAG 2.1 4.1.2).
  const untitled = await page
    .locator(selectorExcluding('iframeTitle', 'iframe'))
    .evaluateAll((frames) => frames.filter((f) => !f.getAttribute('title')?.trim()).map((f) => f.getAttribute('src')))
  expect(untitled).toEqual([])
})

/**
 * The attributes the HTML spec says an `<a>` WITHOUT an href must not carry.
 *
 * An href-less `<a>` is a placeholder — "a link might otherwise have been placed here" — and a
 * placeholder that wears one of these is claiming to be a link that goes nowhere.
 * html.spec.whatwg.org/multipage/text-level-semantics.html#the-a-element
 */
const HREF_ASSOCIATED = ['target', 'download', 'ping', 'rel', 'hreflang', 'type', 'referrerpolicy']

eachRoute('every link is crawlable', 'crawlableAnchors', async (page) => {
  // Lighthouse's `crawlable-anchors` audit, run against our own build instead of against the live
  // site by whoever happens to open PageSpeed Insights on it.
  //
  // It found a real defect in rocksoft that nothing else in this floor could have: the footer's
  // language switcher rendered the CURRENT locale as a row that never navigates, so it had no
  // `href` — but it kept its `hreflang`. 744 of that site's 747 live pages shipped exactly that,
  // and every one of them reported "Links are not crawlable". The switcher is core's, so every
  // other site on this engine was one locale away from the same report.
  //
  // TRANSCRIBED from the audit's own source, deliberately, rather than paraphrased — because the
  // interesting half is what it does NOT fail:
  //
  //   <a>just text</a>                 a bare placeholder, no href-associated attributes: PASSES
  //   <a href="mailto:x@y.z">          exempt outright, before the href is even looked at
  //   <a href="#">                     resolves against the base URL, so it is a valid address
  //   <a href="">                      `.href` reports the page's own URL, not '': PASSES
  //   <a id="section-3"></a>           a jump target, not a link
  //
  // A looser "every <a> needs an href" would fail all five, and a check that flags correct markup
  // is a check the first site to hit it switches off. The rule is subtle on purpose; keep it in
  // step with the audit rather than tightening it locally.
  //
  // github.com/GoogleChrome/lighthouse/blob/main/core/audits/seo/crawlable-anchors.js
  const offenders = await page
    .locator(selectorExcluding('crawlableAnchors', 'a'))
    .evaluateAll((anchors, hrefAssociated) => {
      // The audit reads `href` as the IDL PROPERTY and `rawHref` as the attribute, and the gap
      // between them is what catches the defect: on an <a> with no href attribute the property is
      // the empty string, while on `href=""` it is the resolved page URL.
      const resolveOrEmpty = (url) => {
        try {
          return new URL(url, document.baseURI).href
        } catch {
          return ''
        }
      }

      /** @returns {string | null} why this anchor fails, or null when the audit lets it through. */
      const verdict = (el) => {
        const html = el instanceof HTMLAnchorElement
        const rawHref = (el.getAttribute('href') ?? '').replace(/\s/g, '')
        // SVG's `href` is an SVGAnimatedString, so it takes the gatherer's own resolution step.
        const href = html ? el.href : resolveOrEmpty(el.href.baseVal)
        // `getAttribute`, not the `name` IDL property the gatherer reads: identical value, and
        // the property is deprecated loudly enough that `astro check` files a hint on it.
        const name = (html ? (el.getAttribute('name') ?? '') : '').trim()
        const attributeNames = el.getAttributeNames()

        if ((el.getAttribute('role') ?? '').trim().length > 0) return null
        // Exempt outright, even when it uses one of the failing patterns below.
        if (rawHref.startsWith('mailto:')) return null
        // `<a id="…">` used as a jump target rather than as a link.
        if (rawHref === '' && (el.getAttribute('id') ?? '')) return null
        if (rawHref.startsWith('file:')) return 'href points into the filesystem (file:)'
        if (name.length > 0) return null

        if (!attributeNames.includes('href') && hrefAssociated.every((a) => !attributeNames.includes(a))) {
          // A genuine placeholder — unless something is wired to it, in which case it is a link
          // built out of JavaScript and a crawler sees nothing.
          //
          // Lighthouse asks the debugger for every listener; from inside the page we can only see
          // the ones written as attributes. So this arm UNDER-reports where the audit would fail,
          // and never the other way round — the right direction for a floor, and the reason a
          // green run here is not a promise that PageSpeed agrees.
          const wired = attributeNames.filter((a) => a.startsWith('on'))
          return wired.length ? `placeholder <a> that only works via ${wired.join('/')}` : null
        }

        if (href === '') {
          const carried = hrefAssociated.filter((a) => attributeNames.includes(a))
          return carried.length
            ? `<a> with no href carrying ${carried.join('/')} — a placeholder must omit these`
            : '<a> whose href resolves to no address'
        }
        if (/javascript:void(\(|)0(\)|)/.test(rawHref)) return 'href is javascript:void(0)'
        if (resolveOrEmpty(rawHref) === '') return 'href is not a valid URL'
        return null
      }

      return anchors.map((el) => ({ why: verdict(el), html: el.outerHTML.slice(0, 200) })).filter((o) => o.why !== null)
    }, HREF_ASSOCIATED)

  expect(offenders, 'Lighthouse would report "Links are not crawlable" here').toEqual([])
})

eachRoute('no element draws a border nobody asked for', 'border3px', async (page) => {
  // 3px is CSS's initial `border-width: medium`, so a side measuring exactly that is usually a
  // border that appeared rather than one that was chosen.
  //
  // How it happens: `border-t` sets only `border-top-width`, leaving the other three at `medium`.
  // They stay invisible while `border-style` is `none` — but `border-solid`, needed to make the
  // wanted edge visible at all, sets the style on ALL FOUR sides. The result is a full frame.
  //
  // A heuristic, and it can be wrong. Core's own button family — `btn-primary`, `btn-outline`,
  // `btn-white` — is `border-[3px] border-solid` ON PURPOSE: each pairs with `hover:bg-transparent`,
  // so when the fill vanishes the border is what keeps the button's shape.
  //
  // Those three are known HERE rather than left to each site's exemption file, because they are
  // core's own internals and a site should not have to re-declare them to use core's check. A site
  // adds only what is genuinely its own — and a site that retunes these shortcuts to a different
  // border width (smbp makes them 1px pills) needs no entry at all.
  const CORE_DELIBERATE_3PX = ['btn-primary', 'btn-outline', 'btn-white']
  const skip = [...CORE_DELIBERATE_3PX, ...exempt('border3px')]
  const offenders = await page.locator('body *').evaluateAll(
    (els, deliberate) =>
      els
        .map((el) => {
          const classes = el.getAttribute('class') ?? ''
          if (classes.split(/\s+/).some((name) => deliberate.includes(name))) return null
          const c = getComputedStyle(el)
          const sides = ['top', 'right', 'bottom', 'left'].map(
            (s) => parseFloat(c.getPropertyValue(`border-${s}-width`)) || 0,
          )
          return sides.some((w) => w === 3) ? `${el.tagName}.${classes.slice(0, 50)}` : null
        })
        .filter(Boolean),
    skip,
  )
  expect(offenders, 'elements with an unintended 3px border side').toEqual([])
})

test.describe('keyboard', () => {
  // Run against the page carrying the widest spread of controls this site actually builds, rather
  // than every page: the check is about the site's focus styling, which does not vary by route,
  // and walking every control on every page costs far more than it finds.
  const route = routeWithBlock('button_group') ?? routeWithBlock('cta_banner') ?? '/'

  test(`every interactive element takes focus and shows it (${route})`, async ({ page }) => {
    await page.goto(route)

    // A focus ring removed without a replacement leaves a keyboard user with no cursor at all.
    //
    // `checkVisibility`, not `offsetParent`: a closed dropdown's links are hidden by `visibility`
    // or `opacity` while keeping an offset parent, so the cruder test walked into a megamenu that
    // was shut and reported every link in it as "not focusable" — which is the CORRECT behaviour
    // for a closed menu, and a check that flags correct behaviour is a check people switch off.
    const invisible = await page.evaluate(() => {
      const out = []
      for (const el of document.querySelectorAll('a[href], button, [tabindex]:not([tabindex="-1"])')) {
        const visible = el.checkVisibility?.({
          contentVisibilityAuto: true,
          opacityProperty: true,
          visibilityProperty: true,
        })
        // `checkVisibility` ALONE. The `offsetParent === null` clause that stood beside it is null
        // for ANY `position: fixed` element whether or not it is visible, so it silently skipped
        // exactly the controls most worth checking — a floating back-to-top, a sticky CTA, core's
        // own `gallery-dialog-button`. checkVisibility already covers the closed-dropdown case the
        // clause was there for.
        if (visible === false) continue
        el.focus()
        if (document.activeElement !== el) {
          out.push(`not focusable: ${el.tagName}.${el.className}`)
          continue
        }
        const s = getComputedStyle(el)
        const ring =
          (s.outlineStyle !== 'none' && parseFloat(s.outlineWidth) > 0) ||
          s.boxShadow !== 'none' ||
          s.textDecorationLine.includes('underline')
        if (!ring) out.push(`no focus indicator: ${el.tagName}.${el.className}`)
      }
      return out
    })
    expect(invisible).toEqual([])
  })
})
