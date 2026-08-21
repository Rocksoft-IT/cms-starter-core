# @rocksoft/cms-starter-core

Client sites pin this package by git tag (`package.json`:
`git+https://github.com/Rocksoft-IT/cms-starter-core.git#v0.6.0`), so a bump is a deliberate act —
this file is what tells you what the bump changes.

## v0.25.0 — the sitemap script ships its types

`scripts/fetch-sitemap.mjs` became a core export in v0.24.0, but with no declaration beside it. A
client repo importing its helpers in a test therefore failed its own `astro check` with
`ts(7016)` — TypeScript infers a local `.mjs` under `allowJs`, but not one resolved from
`node_modules`. The starter never hit it, because there the file is inside the repo.

Fixed by shipping `scripts/fetch-sitemap.d.mts`. Nothing else changed; a client that does not
import those helpers is unaffected either way.

**If you are moving from v0.24.0**, this is the release to take — v0.24.0 cannot pass
`astro check` in a repo whose sitemap spec imports from core.

## v0.24.0 — a client that is not public yet stays out of search

The CMS gained a per-client `search_visible` flag (dashboard #1169/#1312); this is the half that
acts on it. A client that is not public yet — typically pre-cutover, live only on a provisional
domain while its real domain still serves the old site — now builds a site search engines leave
alone.

| changed | what it does when `search_visible` is false |
| --- | --- |
| `core/Seo.astro` | every page emits `noindex, nofollow` — a third term beside the `noindex` prop and the per-page `seo.noindex` |
| `core/robots.ts` | `robots.txt` drops the `Sitemap:` line |
| `core/scripts/fetch-sitemap.mjs` | the build writes no sitemap files at all |
| `core/effectiveConfig.ts` | exposes `searchVisible`, read from `GET /api/site-settings` |

**No `Disallow: /`.** `Disallow` blocks crawling, and a crawler that cannot fetch the page never
reads its `noindex` — which prevents indexing a staging copy Google has not seen, but permanently
freezes one it has. Staying crawlable is correct either way. A test fails if a `Disallow` reappears.

**A missing `search_visible` means VISIBLE**, the opposite of the CMS column's default. That
default governs a newly created client, where a person decides; this one governs missing data — a
mock build, a failed fetch, a panel older than the field — where defaulting to hidden would
noindex every live site over one bad request.

### Breaking for a client repo: `scripts/fetch-sitemap.mjs` moves into core

It was the last piece of this feature that did not ride a pin bump, and the copies had already
drifted — diligently.pl carried an env fix the starter never got back. Same treatment
`core/robots.ts` got in v0.20.0.

Per repo, when bumping to this release:

1. Replace `scripts/fetch-sitemap.mjs` with the one-line wrapper:
   ```js
   import { run } from '@rocksoft/cms-starter-core/scripts/fetch-sitemap.mjs'
   await run()
   ```
   The file must still EXIST at that path — `package.json` runs it by path.
2. Ensure `build` and `sitemap:fetch` in `package.json` invoke it as
   `node --env-file-if-exists=.env scripts/fetch-sitemap.mjs`. **Load-bearing:** this is a plain
   Node script, so without the flag the API URL and token are absent on a server build, the step
   throws, and under `set -e` the deploy dies before Astro starts — `public_html` never flips.
   A repo that solved this with vite's `loadEnv` inside the script drops that variant here.

### Note on v0.21.0–v0.23.0

Those releases shipped without entries in this file. This entry does not reconstruct them.

## v0.20.0 — the client template stops carrying core's own machinery

Four things a client repo used to own a copy of now live here, so a fix to any of them arrives with
a pin bump instead of a per-repo edit (dashboard #1195 step 8, PR #1247).

| new in core | what it is |
| --- | --- |
| `deploy.sh` (package root) | the build-onward half of the deploy: build, package the release, verify, the atomic go-live flip, prune, the history log |
| `core/sitePaths.ts` | `getSitePaths(cmsConfig)` — the whole `getStaticPaths` body of the catch-all route |
| `core/PageDispatch.astro` | the page-type lookup and render that route's template used to inline |
| `core/robots.ts` | the `robots.txt` handler |
| `core/Seo.astro` | moved here from the site layer; unchanged otherwise |

### For an existing client: nothing breaks, and nothing changes on its own

Your repo keeps its own `src/pages/[...uri].astro`, `robots.txt.ts`, `components/Seo.astro` and
root `deploy.sh`, and they all keep working exactly as before — this release does not touch them.
What it does is make the thinner versions available, so adopting them is a separate, deliberate
edit. Newly generated repos are born with them.

`Seo.astro` is the one worth adopting soonest: while it lives in your `src/`, the CMS-resolved
`siteName` / `defaultImage` / `siteUrl` from v0.16.0 reach newly generated repos ONLY. Switching
your `Layout.astro` to `import Seo from '@rocksoft/cms-starter-core/core/Seo.astro'` and deleting
your copy is what puts a pin bump in charge of your head tags from then on.

### `deploy.sh` is now two files, and the split is not where you would guess

The repo-root wrapper keeps everything with a hard ordering or physical-location dependency —
layout detection (it keys off `$script_dir/../artisan`, a signal destroyed once the logic runs from
inside `node_modules`), the deploy lock, the #969 untracked-lockfile guard, `pnpm install`, and
provenance logging — then `exec`s into this package's `deploy.sh` for the rest. A literal one-line
wrapper is impossible: `node_modules/@rocksoft/cms-starter-core/deploy.sh` does not exist until the
install has run, and the install is one of the steps being relocated.

Consequence worth stating plainly: **this does NOT remove the need for the panel's deploy-script
sync.** #969's fix is the lockfile guard plus the `--no-lockfile` install logic, both of which must
precede install and therefore stay in the wrapper. A future bug of that class still needs the
whole-file sync to reach the fleet.

### Also

`core/Faq.astro` gained a fallback on `var(--color-surface-alt)`, which it had been reading without
one. `astro-seo` is now declared in this package's `peerDependencies` — it became a real dependency
the moment `Seo.astro` moved here.

## v0.19.0 — opt-in granular consent categories

Statistics and Marketing become separate, independently-consentable categories rather than one
all-or-nothing switch, opt-in per client. Touches `core/ConsentMode.astro`,
`core/CookieConsent.astro`, `core/analytics.ts`, `core/uno.core.ts` and `lib/api.ts`. Source:
diligently-dashboard #1246.

No client action required: a client that has not opted in behaves exactly as before.

## v0.18.0 — the cookie banner actually closes

`.cookie-consent` set `display:flex` unconditionally while `CookieConsent.astro` hides itself with
the `hidden` DOM attribute. Both are single-class/attribute specificity, so on a tie the
later-loaded stylesheet wins — and this one loads after the UA sheet. Every click handler fired and
consent really was recorded; the banner simply never left the screen. Confirmed live on the
Diligently client (`computedDisplay` stayed `flex` with `hidden` already true). The shortcut now
carries `[&[hidden]]:hidden`, whose compound selector wins regardless of load order — the same fix
`tabpanel` already needed. Source: diligently-dashboard #1241.

No client action required; a bump is the whole fix.

## v0.17.0 — the cookie banner gets a real default look

`CookieConsent.astro` shipped semantic markup and no visual CSS, so a client switching consent on
got a bare unstyled bar. The theme's default look now lives in `coreShortcuts`
(`cookie-consent`, `cookie-consent__message`, `cookie-consent__link` and friends), built on the
site's own brand tokens and overridable by redefining any of those keys in `src/uno.ts` — site keys
win on collision, no `!important`. Deliberately its own compact scale rather than reusing
`btn-primary`/`btn-outline`, which are sized for hero CTAs and would dwarf a slim banner. Source:
diligently-dashboard #1232.

No client action required.

## v0.16.0 — the config seam reads the CMS, and `siteUrl()` becomes async

Four values a site used to hand-write in `cms.config.ts` now come from the CMS, each keeping its
local value as a fallback. `core/effectiveConfig.ts` is the single place that precedence lives.

| value | CMS source |
| --- | --- |
| `defaultLocale` | `GET /api/locales`, the entry flagged `is_default` |
| `seo.siteName` | `GET /api/site-settings`, `site_name` |
| `seo.defaultImage` | `GET /api/site-settings`, `default_og_image` |
| `seo.siteUrl` | `frontend_url`, ranked under `ASTRO_SITE_URL` |

### BREAKING — `siteUrl()` is now async

`core/site.ts`'s `siteUrl()` returns `Promise<string | null>`. It gained the CMS's `frontend_url`
as a middle candidate (`ASTRO_SITE_URL` -> `frontend_url` -> `cmsConfig.seo.siteUrl`), because a
test or staging domain is attached in the panel routinely and previously the only way one could
reach a build was a hand-edited repo value that then outlived it.

A client repo owns the two call sites, so **both need `await` at bump time**:

| file | un-awaited symptom | caught by `astro check`? |
| --- | --- | --- |
| `src/components/Seo.astro` | `canonicalUrl({ origin: Promise })` | **yes** |
| `src/pages/robots.txt.ts` | `Sitemap: [object Promise]` | **NO** — a Promise is truthy |

The second is the trap: it ships silently on a green build. After bumping, grep the built
`dist/robots.txt` for a real URL. `src/pages/robots.txt.ts` also has to become
`export const GET: APIRoute = async () => {`.

`astro.config.mjs` keeps its own two-candidate `resolveSiteOrigin()` call and does NOT gain
`frontend_url`: it is evaluated before Vite exists, so it can neither await nor fetch. Both
surfaces still share `resolveSiteOrigin()`, so only the candidate list differs.

### New — a site declares only the palette keys it wants to differ

`NEUTRAL_PALETTE_DEFAULTS` covers all 19 `REQUIRED_PALETTE_KEYS`, and `resolveThemeColors()` merges
a site's palette over it instead of throwing on a missing key. `brand: { colors: {} }` is now legal.
The required-key LIST is unchanged since v0.9.0, so an existing palette keeps working untouched.

Two consequences worth knowing:

- `Layout.astro` in the template merges the same defaults when emitting `:root`. A client keeping
  its own `Layout.astro` and a FULL palette is unaffected; one that trims its palette without that
  merge would emit `--color-button-primary-border: undefined`, which overrides the stylesheet's
  own `var(--x, fallback)` rather than falling through to it.
- A palette with a MISSPELLED key name no longer fails the build — the real key silently takes its
  neutral default and the typo becomes an unused extra colour. `astro check` cannot see it either.

### New — `pathForLocale()` takes the resolved root locale

`pathForLocale(page, locale, fallbackLocale?)`. A two-argument call still compiles and keeps the
old behaviour, so it is not a bump blocker — but it then answers "is this the locale that routes
unprefixed?" from `cms.config.ts` instead of from the CMS, which is wrong whenever the two
disagree. `buildStaticPaths` now puts `defaultLocale` on every route's props next to `locale`, so a
page-type component can forward it; its own signature is unchanged.

### Also

`menus` is optional in `CmsConfig` (core defaults `header` / `footer`), and the template's
`Navbar.astro` reads `cmsConfig.menus.header` instead of a hardcoded literal. `Faq.astro` gained a
fallback on `var(--color-surface-alt)`, which it had been reading without one.

## v0.15.0 — a stored Google Tag / GA4 id actually reaches the browser

Consent Mode v2 was wired but the configured analytics id never made it into the shipped page, so
a client that had filled in its GTM container or GA4 measurement id still loaded no analytics.
Touches `core/ConsentMode.astro`, `core/ConsentModeNoscript.astro`, `core/CookieConsent.astro`,
`core/analytics.ts` and `lib/smoke.mjs`. Source: diligently-dashboard #1197.

No client action required — the components self-gate exactly as before (nothing is emitted unless
the client enabled cookie consent AND configured an id). If your repo mounts `<ConsentMode/>` in
its own `Layout.astro`, this is the release that makes that mount do something.

## v0.14.0 — a pricing plan card can carry a tier illustration

`PricingPlan` gained `plan_image` (plus the `plan_image_meta` sibling carrying intrinsic size and
srcset, absent for an SVG), rendered at the head of the card through the new `pricing-plan-image`
shortcut. A four-card set now has room: the new `container-wide` shortcut and its
`--layout-container-wide` token (1400px) sit one step past the page container, and only a block
that asks for it reaches there. Source: diligently-dashboard #1172.

Additive — no client action. A site may override `--layout-container-wide` or the
`pricing-plan-image` shortcut like any other.

## v0.13.0 — a FAQ accordion can arrive with its first answer open

`FaqBlock.data.open_first?: boolean`. Source: diligently-dashboard #1166. Additive, editor-driven,
no client action.

## v0.12.0 — a FAQ block can render as a plain list

`FaqBlock.data.layout?: 'accordion' | 'list'` — the list variant drops the disclosure behaviour for
content that reads better fully expanded. Source: diligently-dashboard #1164. Additive; the default
stays `accordion`, so an existing block renders unchanged.

## v0.11.0 — flattening an image no longer throws its `srcset` away

v0.10.0 flattened every CMS media object to its URL string so templates that expect
`string | null` would stop rendering `[object Object]`. That fixed the visible bug and quietly
created an invisible one: a media object carries `srcset`, `width` and `height` **inside it**, and
flattening dropped all three.

The split that made this easy to miss: a **block's** image already arrives flat, with its
responsive attributes in an explicit `<key>_meta` sibling (the CMS's `BlockResolver`), so blocks
were never affected. A **page-level** field — a case study's `cover` or `gallery`, a post's
`thumbnail` — arrives as the whole object instead, so only those lost their attributes. The result
was an `<img>` with no `srcset` to choose from, fetching the full-size variant however many rungs
the CMS had generated: on diligently.pl, a 4000x3000 cover into a 572x360 tile.

Flattening now synthesises the same `<key>_meta` sibling, so a page-level field feeds
`responsiveImageAttrs` the way a block's image already did. A multi-media field gets an
index-aligned array, with `null` holding the place of an unmeasured entry. A sibling the API sent
itself is never overwritten — a block's `<key>_meta` stays authoritative.

Two deliberate divergences from the block-side sibling, worth knowing at a call site: this one is
**absent** when nothing was measured (a block's is always an object with all three keys), and the
**array** form for a multi-media field is a shape no backend producer emits, so it must be indexed.

Done in the adapter rather than by having the API send it too: the payload already carries these
values _inside_ the object, and the object cannot be slimmed in exchange — `<Seo>` and `Footer`
consumers need the whole thing — so a backend sibling would put the same `srcset` string on the
wire twice. To be clear about what this saves: a frontend release was needed either way, so the
gain is avoiding an _additional_ backend release, not avoiding one altogether.

**What this does NOT restore:** `alt`. Flattening drops four attributes and this brings back three.
For a block that is fine — it carries its own authored `alt` — but for a page-level field the
media's `alt` is the only answer there is, and it is still lost. `keepRootKeys` remains the escape
hatch (it is why `getFooter` keeps `logo` raw). Revisit if a template needs page-level alt text.

**Nothing renders differently until a template asks for it** — pass the sibling to
`responsiveImageAttrs(meta, sizes)` (lib/image.ts) at the call site. And `srcset` is only as good
as the generated conversions: an image whose width ladder was never built still has `srcset: null`,
which is a CMS-side backfill, not this.

## v0.10.0 — image fields stop rendering "[object Object]"

The CMS now serves most image fields — a case study's `cover`/`gallery`/`client_logo`, a block's
`image`/`src`, `BrandingData.logo`/`favicon`, and more — as a Spatie MediaLibrary object
(`{ url, original, width, height, alt, conversions, focal_point }`) instead of a plain URL string.
Every block and site template still consumes these fields as `string | null` (`ImageBlock`'s `src`,
`CaseStudy`'s `cover`, `Navbar`'s `logo`, ...), so an unflattened object landed in the DOM as
`<img src="[object Object]">` — on diligently.pl this made every `/portfolio/` card lose its cover
image.

`apiFetch` and `getPage` now flatten any CMS media object to its `.url` string before handing the
response to a client site, the single boundary every `lib/api.ts` fetcher already passes through.
Two ROOT-level fields are kept as the full object on purpose, because their consumer reads more
than the URL: a page/case-study's own `seo` (`<Seo>` needs `image.conversions.og`, the fixed
1200x630 JPG social crop, plus its dimensions — not the WebP "best variant" a flattened URL would
hand it) and, for `getFooter` only, its own `logo` (`Footer.astro` reads both `.url` and `.alt` off
it). The exemption is deliberately root-only rather than a by-name match at any depth: a
by-name match would also spare an admin-defined `custom_fields` entry or a future block field that
happens to be called `seo`/`logo` from flattening, silently reintroducing this same bug somewhere
else.

No client-site change needed — every field a template already treated as a URL string now actually
receives one.

## v0.9.0 — a block finally knows which language it is in

Until now a block could not tell which locale tree it was being rendered into. `BlockRenderer`
passed exactly one prop — `block` — and `Astro.currentLocale` is `undefined` on these sites,
because core builds the locale trees itself (`buildStaticPaths`) and no site declares Astro's own
`i18n` config. So every block silently assumed the default locale.

Two things went wrong because of it, and the second one is the reason this is a release rather than
a tidy-up:

- a block formatting a date (`documents` and any client block doing the same) formatted it in the
  default locale on **every** tree;
- core's own controls — the lightbox close button, the gallery zoom control, the testimonials
  arrows — were English literals with a comment admitting why (`Testimonials.astro`: "core has no
  i18n string seam yet"). Those strings are `aria-label`s. They are announced and never displayed,
  so a Polish site told exactly the users who cannot see the page `Close`, `Next photo`,
  `Previous testimonial`, and nobody reviewing the site could notice.

**`BlockRenderer` now takes a `locale` prop and hands it to every block it renders** — including
through the four blocks that render blocks of their own (`columns`, `component_ref`, `hero`,
`tabs`), so a gallery nested inside a tab does not lose it on the way down. The prop is optional and
falls back to `cmsConfig.defaultLocale`, so a client site keeps building unchanged across this bump;
passing `locale` at the `<BlockRenderer />` call site is what makes a non-default tree correct, and
a site with one locale needs to do nothing at all.

**Core's own strings now come from a per-locale table** (`core/ui-strings.ts`), shipped for `en` and
`pl`. Its fallback rule is deliberately the opposite of what a client repo should do with its own
chrome: an unknown locale falls back to English rather than failing the build. A client owns its
dictionary and should fail loudly when a locale is missing; core is shared, cannot know which
locales a client will enable, and must not take a build down over a word it never promised to
translate. A control announced in the wrong language still has a name — one announced as nothing
does not.

A site that needs a locale core does not ship, or disagrees with a wording, supplies it through the
new **`cmsConfig.coreStrings`** key:

```ts
coreStrings: {
  de: { close: 'Schließen', nextPhoto: 'Nächstes Foto' },
}
```

Per locale, per key, and partial — anything left out still resolves through core.

### Upgrading

Nothing is required. To make a multi-locale site correct, pass the locale you already have at each
`<BlockRenderer />` call site:

```diff
- <BlockRenderer {blocks} />
+ <BlockRenderer {blocks} {locale} />
```

A site block registered in `cmsConfig.blocks` now receives `locale` too, and can declare it as an
optional prop to use it. This is what closes the `Astro.currentLocale ?? defaultLocale` workaround
those blocks were written around (smbp #166, #168).

## v0.8.2 — your site's origin actually reaches Astro

`astro.config.mjs` sets `site` from `ASTRO_SITE_URL`, and it never worked on a real build. Astro
populates `process.env` from `.env` inside a Vite plugin's `buildStart`, long after the config module
has been evaluated — so the variable was invisible there, and `site` was `undefined` whenever the
value lived in `.env`, which is where the deploy script puts it (dashboard #1090).

Worse for most sites: `site` had no fallback to `cmsConfig.seo.siteUrl`, and the generated deploy
`.env` contains only `ASTRO_API_URL` and `ASTRO_API_TOKEN` — so unless you set `ASTRO_SITE_URL`
yourself, your config value was your site's **only** origin, and `site` never saw it. Meanwhile
`<Seo>`'s canonical resolved it fine through `import.meta.env`. One build, two answers.

> **Addendum, added after this release.** The paragraph above describes the world at v0.8.2. The
> panel's deploy script now writes `ASTRO_SITE_URL` into that `.env` too, from the client's default
> domain (dashboard #1107), so on a CMS-provisioned site the environment supplies the origin and
> `cmsConfig.seo.siteUrl` is the fallback. No core change — that is the resolution order this
> release introduced, finally with both candidates populated.

Today the visible symptom is small: `Astro.site` is read only by the redirect pages `cmsRedirects()`
emits (v0.8.0), whose canonical came out relative — valid, and it resolves to the right address. The
reason to take the bump is that the config claimed an origin it did not have, so the next thing to
rely on `site` (`@astrojs/sitemap`, an `Astro.site` read, an adapter) would have broken silently and
looked like a CMS problem.

### New — `resolveSiteOrigin()`, one rule for both surfaces

`core/siteOrigin.mjs` is now the single definition of the site's public origin: first non-empty
candidate wins, trailing slashes stripped, whitespace trimmed, `null` when there is nothing to use.
`siteUrl()` already delegates to it; your `astro.config.mjs` should too, so the two cannot drift
apart again.

**What you must do:** in `astro.config.mjs`, add the two imports and replace the `site` line.

```diff
+import { loadEnv } from 'vite'
 import { cmsRedirects } from '@rocksoft/cms-starter-core/core/redirects.mjs'
+import { resolveSiteOrigin } from '@rocksoft/cms-starter-core/core/siteOrigin.mjs'
+import { cmsConfig } from './src/cms.config.ts'
+
+const configDir = fileURLToPath(new URL('.', import.meta.url))
+const env = loadEnv(process.env.NODE_ENV ?? 'production', configDir, 'ASTRO_SITE_URL')

 export default defineConfig({
-  site: process.env.ASTRO_SITE_URL || undefined,
+  site: resolveSiteOrigin(env.ASTRO_SITE_URL, cmsConfig.seo?.siteUrl) ?? undefined,
```

`fileURLToPath` is already imported in the stock config (it resolves the `~site` alias). Use the
config's own directory, not `process.cwd()`, which is wherever the build was invoked from. The
third `loadEnv` argument is a prefix filter — naming the variable in full keeps the returned object
to that one key, rather than the documented `''`, which hands the module every secret in the file.

`loadEnv` merges matching `process.env` values after the file's, so a variable set in the real
environment still wins. Nothing else changes, and no content or component in your repo has to.

> **One constraint this adds:** `src/cms.config.ts` is now loaded at config-evaluation time, before
> the Vite pipeline exists. Keep its module scope free of eager `.astro`/CSS imports and of
> `import.meta.env` reads — the stock block and page-type registries are lazy `() => import(…)`
> loaders, so this holds unless you added a static component import.

## v0.8.1 — `astro check` accepts the redirects integration

`v0.8.0`'s `cmsRedirects()` is a `.mjs` module with no type declarations, which this tree never
noticed: here core is a workspace link, so `astro check` reads the source and infers everything. In
a CLIENT repo it is an installed git dependency, where TypeScript refuses a declaration-less JS
module — `astro.config.mjs` failed with `ts(7016)` and took `pnpm check` down with it.

Fixed by shipping `core/redirects.d.mts` beside it. **If you already pinned `v0.8.0`, move to
`v0.8.1`**; nothing else changes, and no code in your repo has to.

## v0.8.0 — a renamed page's old URL stops 404ing

> `v0.7.0`–`v0.7.3` shipped without entries here. This file resumes at `v0.8.0`; for what those
> carried, `gh api repos/Rocksoft-IT/cms-starter-core/compare/v0.6.0...v0.7.3` is the record.

### New — `cmsRedirects()`, and one line your `astro.config.mjs` must add

Renaming or moving a page in the CMS has always recorded the old address, and on a statically built
site that record did nothing: the redirect contract was request-time only (`GET /api/pages/{path}`
answers a vacated path with a 301), and a static build never asks — it renders every page from
`getPages()`, which lists only pages that exist. So the old URL was a route the build never emitted,
i.e. a hard 404, with the correct row sitting in the CMS the whole time (dashboard #1084).

Core now ships an Astro integration that fetches the whole map (`GET /api/redirects`, new in the
same change) at config time and merges it into `redirects`, so the build emits one redirect page per
entry — `<meta http-equiv="refresh">` plus `noindex` and a canonical at the destination, which is
what a static host can serve. An adapter that understands redirects (Netlify, Vercel, Cloudflare)
turns the same config into real 301s with no change here.

**What you must do:** add it to `integrations` in `astro.config.mjs`. Nothing else changes.

```js
import { cmsRedirects } from '@rocksoft/cms-starter-core/core/redirects.mjs'

export default defineConfig({
  integrations: [UnoCSS(), cmsRedirects()],
})
```

Safe to bump before the CMS side is deployed: a backend without the endpoint answers 404 and the
build carries on. Any other failure warns in the build log and carries on too — no redirects is the
state the site is in today, and that is not worth failing a content deploy over. The call is
bounded by a 15s timeout (an unresponsive CMS must not hang a build), and it is skipped entirely
for commands that emit no routes — so `astro check` gains no dependency on a reachable CMS.

**`test:smoke` skips redirect stubs.** A redirect page is deliberately minimal — a meta refresh,
`noindex` and a canonical, no `<html>` wrapper, no description, no share image — so the SEO smoke
check would fail three of its assertions on every one of them. It now recognises them by the
refresh tag and reports the count it skipped instead of checking them.

**Offline builds:** in `ASTRO_API_MOCK=1` the map is read from `src/fixtures/data/redirects.json`,
the fixture the `getPage()` contract already uses. Keys and values are normalized on the way in, so
an existing fixture written as `{"old-path": "/new-path"}` keeps working; new ones should use the
public shape the API emits, `{"/old-path/": "/new-path/"}`.

## v0.6.0 — one `cards` block, a `gallery`, and images sized to their slot

Four changes since v0.5.0. **One of them needs a look before you bump**: three block types are gone,
replaced by one.

### Changed — `nav_tiles`, `mainfeatures` and `info_cards` became `cards`

Three blocks carried the same shape — a repeater of items, each an icon and some text — and each
solved the same problems differently: three repeater names, two spellings of the link field, three
header sets, two ways to give an icon. An editor was picking a **block** in order to pick a **look**,
and the names did not say so. Now one block, whose `layout` field chooses the presentation:
`tiles` (compact, link-led), `cards` (icon chip, label, multi-line value), `steps` (numbered
sequence). The same content can be re-laid-out without being re-entered.

**What you must do:** nothing, if you register the core palette wholesale (`coreBlocks` from
`@rocksoft/cms-starter-core/core/blockRegistry`) — `cards` arrives with the bump. If your
`cms.config.ts` names `nav_tiles`, `mainfeatures` or `info_cards` explicitly, replace those three
entries with `cards`.

**Your content is converted for you.** A data migration on the CMS rewrites every persisted instance
in place — position preserved, the stable `data.id` reused, idempotent and reversible. Deploy order
does not matter either: this release still renders a `nav_tiles` block through the new component, so
a frontend bumped before the migration runs, or after, is correct either way.

Custom CSS naming the old shortcuts needs remapping — the vocabulary is now `section-cards` /
`cards-inner` / `cards-grid` / `card`, with `is-tiles` / `is-cards` / `is-steps` on the section.

### New — `gallery`

A grid of photos as ONE editable thing: an optional eyebrow/heading, a note beside the heading (a
caption for the SET, not per image), and a repeater of images each carrying its own alt text.
Composing six image blocks by hand gave an editor a puzzle instead of a gallery, and no way to
reorder the set at once. `anchor_id` makes it a scroll target, the same contract `team` and
`pricing_table` already offer. An entry with no image is dropped rather than rendered broken; a
missing alt yields an empty one — correct for a decorative tile, and better than inventing alt text
from a filename.

### New — images are served at the size their slot actually needs

Every image-bearing block rendered `<img src>` and nothing else, so the browser downloaded the
editor's original whatever size it was about to display it at — a 240px gallery tile could be handed
a 4000px file. Blocks now emit `srcset` and `sizes` together (neither is any use alone).

**Additive: nothing breaks and no client change is required.** Image fields stay URL strings; the
responsive attributes ride in a sibling object the API adds. A block whose image has no variants
renders exactly the tag it rendered before.

Two things worth knowing:

- **The `sizes` values are viewport fractions, not pixels** — deliberately. A slot's pixel width
  depends on `container-global`, which every site overrides, so a pixel baked into core would be
  right for one site and wrong for every other. A `vw` fraction slightly over-estimates the slot,
  which costs bytes; under-estimating would cost sharpness.
- **The smaller files have to exist.** New uploads and newly-authored blocks get them automatically;
  everything authored earlier needs one backfill pass per kind, run on the CMS — see **Developer
  Docs → Responsive images** in the panel. Until then a page renders exactly as it does today, just
  without a `srcset`.

### New — cookie consent, and two exports your fixtures module must add

A CMS-toggled consent banner, off unless the client enables it. Nothing to do for the live site.

**But the OFFLINE build breaks until you add two exports.** Core's `lib/api.ts` now imports
`getMockSiteSettings` and `getMockCookieConsent` from `~site/fixtures`, so `pnpm build:mock` fails
at bundle time with `"getMockSiteSettings" is not exported by "src/fixtures/index.ts"` — before any
page renders. Add both to `src/fixtures/index.ts`, mirroring the shipped default (consent off, no
authored copy):

```ts
import type { SiteSettingsData, CookieConsentData } from '@rocksoft/cms-starter-core/lib/api'

export async function getMockSiteSettings(): Promise<SiteSettingsData> {
  return { cookie_consent: { enabled: false, privacy_page_id: null }, integrations: {} }
}

export async function getMockCookieConsent(_locale: string): Promise<CookieConsentData | null> {
  return null
}
```

### One more thing a client may have to change

The upgrade notes above cover registering and rendering blocks. If your site also **reads** a block
— pulls one out of `page.blocks` by type to compose it by hand, rather than letting the renderer
handle it — then a retired type is a compile error in your own code, not just a registry entry.
smbp hit exactly this: its home composes the quick panel from what used to be `nav_tiles`. Grep your
`src/` for the three retired type names before bumping.

## v0.5.0 — documents block, CMS-managed footer, href normalization

Published 2026-07-28 without an entry here; recorded after the fact from the commits it carried, so
it is a summary rather than the usual upgrade note.

- **`documents` block** — a list of library files (PDF and friends) with resolved name, description,
  size and URL.
- **CMS-managed footer** — the footer becomes a global component edited in the panel (#232).
- **Internal hrefs normalized to the configured trailing slash**, so a CMS value authored without
  one stops 404ing under `trailingSlash: 'always'`.
- Core unit tests moved into the package under Vitest, and the SEO/render smoke preset now ships
  with core rather than with each site.

## v0.4.0 — an inline CTA on the FAQ block

**Additive: nothing breaks, and nothing must change in a client to take this.** Bump the pin and
`pnpm install`.

- **The `faq` block gains `cta_label` + `cta_href`** — an optional action beside the heading, for the
  person the answers did not help. Same field names as `promo_split`'s CTA, so an editor learns one
  vocabulary. Both halves are required: a label with nowhere to go, or a bare URL with no label,
  renders nothing rather than a dead link. An absolute `http(s)` target opens in a new tab with
  `rel="noopener noreferrer"` and gets an external glyph; a path stays in place.
- **New shortcuts:** `faq-header-row` (the header becomes a baseline-aligned row only when there is
  something to sit beside the heading) and `faq-action` (a quiet pill in core tokens — this is the way
  out, not the section's primary action). Remap `faq-action` to use your own button.
- Fill the link in the panel, on the FAQ block. It is content, not code.

Comment corrections across the package in the same release: ten references to the pre-flatten
multi-site layout (`sites/<slug>/`, a `SITE` env, `src/core/`) were still sitting in docstrings,
including on the public `CmsConfig` interface every client reads. `core/mock.ts` now also states why
it, and everything importing it, can only be loaded by a Vite build.

## v0.3.0 — core becomes a skeleton

Core no longer carries visual values. A block ships structure and semantic class names; every
width, rhythm and color comes from the site layer through one of three seams, and **`!important` is
no longer needed anywhere** (a CI check now rejects it). Scoped CSS in core dropped from 657 lines
to 76, across 3 files instead of 11.

Full rationale and phase-by-phase history: `context/changes/core-styling-seams/` in the
diligently-dashboard repo (which holds the backend and the starter dev tree). The contract itself:
`docs/starter.md` § "Styling contract".

### BREAKING — required to build

1. **`uno.config.ts` must be rewritten.** The shortcut vocabulary and the brand-color → theme
   mapping now ship WITH this package instead of being copy-pasted into every client repo (where
   they drifted silently — a client's `features-inner` said 900px while the component hardcoded
   1200px). Replace the whole file with:

   ```ts
   import { defineConfig, presetUno } from 'unocss'
   import { coreShortcuts, resolveThemeColors } from '@rocksoft/cms-starter-core/core/uno.core'
   import { cmsConfig } from './src/cms.config'
   import { siteUno } from './src/uno'

   export default defineConfig({
     presets: [presetUno()],
     content: { filesystem: ['node_modules/@rocksoft/cms-starter-core/**/*.{astro,ts}'] },
     // Inline literal: assigning a pre-typed theme object makes TypeScript infer UnoCSS's Theme
     // generic from it, which then rejects presetUno().
     theme: { colors: resolveThemeColors(cmsConfig.brand.colors) },
     // Site shortcuts last, so a site key overriding a core one wins.
     shortcuts: { ...coreShortcuts, ...siteUno.shortcuts },
   })
   ```

   Your site's own shortcuts stay exactly where they were, in `src/uno.ts`.

2. **`brand.colors` must define seven more keys.** Core blocks resolve them as theme colors, and
   UnoCSS emits nothing for an unknown color name — so a missing key used to mean a silently
   unstyled block. `resolveThemeColors()` now fails the build instead, naming every missing key:
   `primary-soft`, `surface`, `surface-alt`, `surface-tint`, `border`, `heading`, `eyebrow`.
   The authoritative list is `REQUIRED_PALETTE_KEYS` in `core/uno.core.ts`.

3. **`cmsConfig.layout` is gone.** Delete the entry from `src/cms.config.ts` (it is a type error
   otherwise). Geometry is not CMS configuration: widths live in `--layout-*` tokens and the
   container shortcuts, both overridable from the site layer. `custom_html` no longer builds an
   inline style from it — it uses the `custom-html-inner` container.

### BREAKING — renamed or removed keys

| Key                   | Change                                                                                                                                                                           |
| --------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `promo-split-inner`   | **Now the container.** The tinted grid panel is `promo-split-panel`. A site overriding `promo-split-inner` for panel styling must move that override to `-panel`.                |
| `section-promo-split` | No longer carries the container (it is `section-y` now). A site overriding it purely for rhythm is unaffected; one relying on its 1180px width should remap a container instead. |
| `section-content`     | No longer carries the container; the measure moved to `content-inner`.                                                                                                           |
| `step-number`         | Removed. It was unused and its values contradicted the component's markup.                                                                                                       |

### Changed visual defaults

These are deliberate: core carried one client's design values, which every other client then had to
fight. Restore any of them from your site layer by redefining the named shortcut.

- **One eyebrow treatment** (`eyebrow`, 13px/bold/0.08em/`text-eyebrow`) instead of five. All
  `*-eyebrow` keys compose it; `section-eyebrow` (used by ten blocks, previously 20px/normal) is now
  an alias.
- **One section header** (`section-header` + `core/SectionHeader.astro`) instead of six spellings of
  the same wrapper. Per-call-site `mt-2` / `text-text-primary` / `max-w-[680px]` variations are gone.
- **FAQ renders at the full content width** — it hardcoded `max-width: 760px` in scoped CSS, which
  no site could widen without `!important`.
- **Hero has one measure** instead of three nested ones (1080 / 1040 / 990).
- **Features**: the doubled vertical rhythm (`py-16` on both the section and its wrapper) is halved;
  the number badge takes `accent` instead of a hardcoded yellow from a `--color-jonquil` token that
  no palette defined.
- **The CTA badge no longer pulses.** A shared engine should not animate a client's badge.
- Client font utilities (`font-suse`, `font-montserrat`) are gone from core — they were absent from
  the Uno theme and emitted no CSS at all. Headings use `font-brand`, i.e. `--font-primary`.

### New

- **`@layer core`.** Core's remaining scoped CSS is layered, so an UNLAYERED site rule — and every
  Uno utility — beats it at any specificity. This is what makes existing `!important` in a site
  layer removable. Do NOT put your site CSS in a layer; that would weaken it.
- **`--layout-*` tokens** (`core/styles/tokens.css`): `--layout-container`, `-narrow`, `-prose`,
  `--layout-space-y`. Override in a site-level `:root` to retune every block at once.
- **`core/SectionHeader.astro`** with an optional `action` slot, for a header with an inline action
  beside the heading.
- **`pnpm verify:core-styles`** (`scripts/verify-core-styleless.mjs`, wired into CI by the mirror):
  rejects `!important`, a `max-width` in core's scoped CSS, scoped CSS outside `@layer core`, a
  non-neutral hex in core, and a class name built by interpolation. Expect it to fail on a client
  repo that still has `!important` — that is the point, and the three seams are the fix.

### Migrating a client site

1. Bump the pin to `#v0.3.0`, `pnpm install`.
2. Replace `uno.config.ts` (item 1 above) and delete `cmsConfig.layout` (item 3).
3. `pnpm build:mock` — it fails loudly with the palette keys you are missing (item 2). Add them.
4. `pnpm verify:core-styles` — drop each `!important` it reports, replacing it with a shortcut
   override in `src/uno.ts` or a token in your `:root`. A plain rule now beats core's scoped CSS.
5. `pnpm astro check && pnpm test:e2e`, then review the changed visual defaults above.
