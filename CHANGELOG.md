# @rocksoft/cms-starter-core

Client sites pin this package by git tag (`package.json`:
`git+https://github.com/Rocksoft-IT/cms-starter-core.git#v0.6.0`), so a bump is a deliberate act —
this file is what tells you what the bump changes.

## Reading v0.43.0 → v0.49.0 together

Seven tags in eleven hours, backfilled here after the fact. Three things a reader coming from
v0.42.0 needs before the individual entries:

**Three of them need a per-client edit, not just a pin bump.** The conformance floor (v0.43.0),
the VRT harness (v0.46.0) and custom code (v0.49.0) all ship code that runs only once the repo
mounts or registers it. **The template is already wired** — `frontend/`'s `playwright.config.ts`,
`playwright.vrt.config.ts` and `Layout.astro` carry all three — so a client provisioned from here
is born correct. An **existing** repo is not: the panel writes a repo's tree once, at provisioning.
That is the [Core capability needs per-client wiring](../../../docs/agents/frontend-and-fleet.md)
case, and the order per repo is unchanged: **bump the pin first, wire second, both on the same
`starter-update` branch** — the wiring imports modules the older pin does not have.

**The conformance floor did not work on any client until v0.45.0.** v0.43.0 shipped it as
TypeScript, which Playwright's Node loader refuses to strip under `node_modules`; v0.44.0 converted
it and v0.45.0 fixed the ESM extensions it needed. **Do not pin to v0.43.0 or v0.44.0 for the
floor** — it is present and silent there.

**v0.48.0 is empty.** It carries nothing a client can use; see its entry.

## Unreleased

### A band a client's own wash fits in — `tint`, beside a `brand` that admits it is solid (dashboard#1940)

The `background` select gains a sixth value, `tint`, and `brand`'s panel label now reads **"Brand
(solid fill)"**. Two problems, one enum:

`brand` is `[&.is-brand]:bg-primary` — a **solid** fill, the inverted band `dark` is. The name reads
like a wash, and that reading is where the allteck port started before the code said otherwise. The
stored value is unchanged (no migration, nothing published moves); what changed is the option label,
which is the only place an editor could ever have read it.

`tint` is the wash that reading expected. Its fill is `--band-tint-bg`, derived as 12% of
`--color-primary` mixed into `--color-surface`, behind `@supports (background: color-mix(…))` — an
unsupported function in a *defined* custom property poisons the declaration reading it rather than
falling back, the same trap `--band-brand-text`'s `oklch()` gate exists for. Without support the
token stays on its static `--color-surface-alt` value, i.e. a neutral band rather than a broken one.

**Derived, not a new branding field** — same argument as `--band-brand-text`: one setting the client
already maintains, nothing to drift from it, and the tint moves over MCP today because `primary`
does (`set_branding`). Mixed towards the *surface* rather than towards white, so it stays on the
page's own side of the theme; a literal near-white inverts on a dark-themed site, which is what
`--band-muted-bg` learned on Täles (#1578). It sets a fill and nothing else — no `color`, no role
re-mapping — because it never crosses over.

**Additive: nothing renders differently until an editor picks the new value.** A site that wants an
exact hex instead of the derived one redefines `--band-tint-bg` in its own `:root` (seam 2) —
allteck's `#eaf4e9` is now one token in a client repo instead of a hand-written band.

**This bump needs the dashboard change too.** The option is served by `config/cms.php`; a repo on
this pin against a panel without it simply never receives `tint`, and `backgroundClass()` returns
`undefined` for a value it does not know, so the section renders unbanded rather than broken.

### `heading` and `eyebrow` follow the client's brand instead of core's neutrals (dashboard#1941)

**A pin bump alone changes how two colour roles render on every client site — read this before
taking it.** Core declares 19 palette keys and the CMS has branding fields for nine. `heading` and
`eyebrow` were two of the ten with no field, so they painted core's neutral `#151516` / `#3b5aff`
on every site until somebody hand-wrote them into that repo's `cms.config.ts`. Measured on allteck,
whose branding says `#080808`: every heading was off by a shade too small to notice, and every
eyebrow — across twelve blocks — was core's neutral **blue**, which reads as a deliberate accent.
No MCP call could fix it; the only route was a PR against the client repo.

They now **derive** from roles the client already sets through `/api/branding`: `heading` from
`text-primary`, `eyebrow` from `primary`. In practice a site that has set a brand will see its
headings take its text colour and its eyebrows take its brand colour on this bump. **Look at the
site after rebuilding** — this is the intended correction, but it is a visible one.

**No per-client wiring, and no `Layout.astro` edit.** The derivation is written into
`NEUTRAL_PALETTE_DEFAULTS` as a `var()` chain rather than resolved in `Layout.astro`, which is a
per-site file the panel writes once at provisioning: a fix there would reach newly generated repos
only. Both consumers of that record put its values straight into a CSS value slot, so the chain
resolves at use time against the `--color-text-primary` / `--color-primary` the same `:root` block
already carries from the CMS.

**Nothing is forced.** A site's own `brand.colors` value still replaces the key, so a repo that
hand-wrote `heading`/`eyebrow` as a workaround keeps exactly what it has and can drop the override
later. A site with no branding at all is unchanged — each chain falls back to the neutral hex the
entry used to be. The inverted-band rules (`.section-band.is-dark`, `.section-band.is-brand`)
redefine both roles at a more specific selector and are untouched, so the #1693 contrast work still
wins — an eyebrow on an inverted band keeps the band's own colour and never the derived accent.

**A second, smaller visible change rides along: an eyebrow on a light card inside an inverted band
becomes visible.** `.surface-light` — the rule that gives an opaque light card its light text roles
back — restored `heading`, `text-primary`, `text-secondary`, `muted` and `border`, and not
`eyebrow`. So that one role kept the BAND's value, which defaults to the band's own text colour:
white on a white card. Absent rather than low-contrast, which is how it survived #1693 adding
`--color-eyebrow` to the band set in the first place. It now returns to the light value like its
siblings, through a `--band-eyebrow-base` capture at `:root`. If a site has been relying on an
eyebrow being invisible there, this is where it reappears.

The other eight unreachable roles — `surface`, `surface-alt`, `surface-tint`, `section-bg`,
`border`, `muted`, `body`, `primary-soft` — are unchanged: they need branding fields, which is a
dashboard-side change rather than a default.
### `pricing_teaser`, `cta_banner` and `promo_split` read `intro`, not `body` (dashboard#1977)

**This bump CHANGES three existing renderers rather than adding anything.** All three used to
declare a local `body` for the sentence under the heading; it is now the shared `intro` universal
part. The dashboard migration `2026_09_02_120000_unify_standfirst_vocabulary` moved the stored
values — per locale, and through nested blocks — on the deploy that shipped it.

**Nothing visual moves.** All three fields were already `textarea`, identical to the part's own
declaration, so this is a change of NAME and nothing else. `CtaBanner.astro` still draws
`<p class="cta-body">` and `PromoSplit.astro` still draws `<p class="promo-split-body">`; only what
they destructure changed. `PricingTeaser.astro` dropped an indirection — it was already passing
`intro={body}` into `SectionHeader.astro`, so the value had always been the `intro` prop.

**Nothing breaks at this pin, and nothing breaks before it either.** The API still emits `body` for
these three blocks, projected from `intro`, as a **deprecated alias** — precisely so a repo can take
this bump on its own schedule. It is removed in a later release, tracked as dashboard#1978 alongside
the CTA alias below, because both retire through the same operation. A repo that has not migrated by
then loses the sentence under its heading, silently.

**If your repo OVERRIDES `CtaBanner.astro`, `PromoSplit.astro` or `PricingTeaser.astro`, the bump is
not enough — migrate the override too.** A core release cannot reach a component your repo owns.
Measured at the time of writing, four repos read one of these three: `diligently.pl` (CtaBanner,
PricingTeaser), `scandinavian-taste` (CtaBanner, PromoSplit), `taeles-kebap-astro` (CtaBanner,
PromoSplit) and `kaffemaskin-til-bedrift` (CtaBanner) — the last of which vendors `src/core/` and
takes no core releases at all, so only a hand edit reaches it. The port is one identifier per
override: destructure `intro` instead of `body`.

**Convert your own fixtures in the same branch as the bump.** Nine of the ten repos carry these
blocks in `src/fixtures/data/pages.*.json` under the old key, so `build:mock` and any e2e spec
reading the fixture break on the bump even where the renderer comes from core unchanged. That is
exactly what CI caught on dashboard#1959: the starter's `promo-split.spec.ts` read the retired key
off its fixture and threw.

**Three blocks kept their own name, permanently**, and this is not an unfinished rename:
`hero.subheading` is richtext with `paragraph` under it (two slots, and a type the part cannot
supply), `rich_content.body` IS the block's content, and `quote.lede` is in the quoted article's
words. Their reasons are recorded beside each block and in `SectionHeaderCoverageTest`.

### `promo_split` and `faq` read `ctas`, not `cta_label`/`cta_href` (dashboard#1959)

**This bump CHANGES two existing renderers rather than adding anything.** Both blocks used to
carry a `cta_label` + `cta_href` scalar pair; they now read the same `ctas` repeater that `hero`,
`cta_banner` and `pricing_table` already used, held to one row by the panel (`max => 1`). The
dashboard migration `2026_09_01_120000_unify_cta_vocabulary` moved the stored values — per locale,
and through nested blocks — on the deploy that shipped it.

**Nothing breaks at this pin, and nothing breaks before it either.** The API still emits
`cta_label`/`cta_href` for these two blocks, derived from `ctas[0]`, as a **deprecated alias** —
precisely so a repo can take this bump on its own schedule. What the alias does not do is last
forever: it is removed in a later release — tracked as dashboard#1978, which lists the condition
and the repos it is waiting on — and a repo that has not migrated by then loses its CTA silently.

**If your repo OVERRIDES `PromoSplit.astro` or `Faq.astro`, the bump is not enough — migrate the
override too.** A core release cannot reach a component your repo owns. Concretely, on
`scandinavian-taste`, `PromoSplit.astro` reads `cta_href` directly and treats a
`webforms.pipedrive.com` value as a **mode switch** that replaces the block's visual column with an
inlined contact form. That override keeps working through the alias and has to move to `ctas`
before the alias goes — and note its "href with no label" state is meaningful there, so read the
row rather than `usableCtas()` if you are reproducing that behaviour.

The port is otherwise small: destructure `ctas` instead of the pair and take `usableCtas(ctas)[0]`
(`lib/ctas.ts`, already exported). `usableCtas()` drops a row missing either half, which is the
same rule the old `cta_label && cta_href` gates stated locally — so a half-filled row renders
exactly what it rendered before.

Also here: the block-field coverage gate's header no longer cites `hero.ctas` as its example of a
field rendered in only one branch. `HeroCtas.astro` fixed that, and the example had been left
behind as a false statement in the one file whose job is to be trusted about coverage.

### Two porting tools: read the source, then audit the port (dashboard#1966)

`pnpm parity:source` and `pnpm parity:audit`, both shipped from core's `scripts/` and both run
against a **static source** — a Webflow export, a hand-built HTML/CSS prototype, a mirror. We port
one of these often enough that the two questions are worth naming separately:

- **`parity:source '<selector>' [--motion]`** — what IS it. Serves the source, walks the section,
  and prints every declared rule that owns each element beside the value it computes to, plus a DOM
  tree and a mapping skeleton to fill in.
- **`parity:audit <build-url> <ref-url> <selector> [ref-selector] [--shot DIR]`** — is it right
  yet. Walks the same section on the build and on the live reference and prints both, element by
  element, with screenshots.

**Why the first one exists at all.** A rendered page — which is what VRT, `tests/measure` and any
`getComputedStyle` check read — structurally cannot report three things, and on the port that
prompted this each was guessed at instead:

- **the authored unit.** `inset: 0 8vw 0 auto` measures 115.2px at 1440, and 115.2px is what four
  measuring passes wrote into the stylesheet. Correct at exactly one width.
- **a rule that does not apply.** A `min-height: 520px` parked in another breakpoint's media query
  reads like the element's height in the file and computes to `auto` on the page. Copying it made a
  card 275px too tall. The property table prints both and marks the dead one `✗`.
- **an interaction that has not run.** Webflow's IX2 action lists compute to `none` on a page nobody
  has scrolled or hovered. `--motion` decodes them out of the export's own JS into keyframe tables —
  evaluated as the object literals they are rather than scraped, because a regex over that blob is
  how one pass concluded a parallax did not exist at all. Reconstructing them by eye had produced a
  hover magnet at an eighth of its throw, a parallax with two of four photos drifting the wrong way,
  and a text reveal missing the stagger that is its whole character. The tool contradicted the last
  of those within an hour of it shipping.

Only `--motion` needs Webflow; the DOM and rule halves need a directory with an index.html.

**Existing repos need a per-client edit.** `frontend/package.json` carries both script entries, so a
client provisioned after this is born with them — an existing one gets the files with the pin bump
and needs the two `scripts` lines added on the same `starter-update` branch. Nothing else is wired:
neither tool is part of `pnpm build` or any test, and neither can fail a build.

The `webflow-parity` skill now opens by telling you to run `parity:source` first.
### A section heading can carry the client's own glyph (dashboard#1968)

Twenty blocks gained `heading_icon`, an **optional** universal part holding raw SVG. It is the
answer to "every client wants a different icon": core's `lib/icons.ts` has eleven named glyphs,
which is a census of what two blocks happened to need, and a plumber's wrench or a roaster's bean
was previously a core release plus a pin bump per repo — for one drawing.

**What now renders.** `HeadingIcon.astro` is the one place the glyph is drawn and the only caller
of the sanitiser, so the thirteen blocks that delegate to `SectionHeader.astro` get it by forwarding
one prop, and the seven that head themselves (`Hero`, `RichContent`, `Heading`, `CtaBanner`,
`PromoSplit`, `Faq`, `Map`) place the same component at the top of their own cluster. Size is the
new `section-heading-icon` shortcut — one key, retunable per site, beside `section-animation`.
`Documents` deliberately does **not** take the part: its `icon` select already draws a glyph on that
header.

**Two fixes ride along, and one of them was live.** `sanitizeSvg()` spelled its allowlist in
camelCase while `sanitize-html` parses as HTML and lowercases names, so nothing matched — **every
SVG lost its `viewBox`**, along with `preserveAspectRatio`, `gradientUnits`, `stdDeviation` and the
tags `linearGradient` / `radialGradient` / `clipPath` / `textPath` / all seven `fe*` filters. Paste
an unmodified Lucide icon and it came back unscalable, which nobody noticed because a 24-unit
drawing in a 20px box still shows something. The `style` attribute was also getting through
verbatim, carrying a full-viewport `position:fixed` and a `background-image:url()` fetch; it is
dropped now. **If your site renders `pricing_table` billing-tab icons, they will start scaling
correctly on this bump** — no client had one when this shipped, so it was measured as a no-op.

**`sanitizeIcon()` is new and it forces `currentColor`.** A glyph here is monochrome by
construction: `fill="none"` is preserved so outline icons stay outlines, every other colour is
replaced, and `class`/`width`/`height` come off the root so the shortcut decides the size. That is
deliberate — a pasted `fill="#1a3d7c"` would otherwise outlive the next rebrand — and it is why a
mark needing its own colours stays a picture rather than a glyph. `pricing_table.tab_icons[].icon_svg`
renders through the same function and changed type from `richtext` to `textarea`, which is also
what makes it editable in the panel at all: `richtext` built a prose editor with no `svg` node.

**No per-client wiring needed** — a pin bump is the whole change on the client side.

### Eleven blocks gained a standfirst, three gained a label above the heading (dashboard#1958)

The CMS gave the section header — `eyebrow` / `heading` / `intro` — the rule `background` and
`anchor_id` already follow: *a block that renders a section of its own content carries the section
header, and carries all of it*. Core is the other half of that, because a field the registry
declares and no component reads fails `pnpm cms:blocks:verify`.

**What now renders.** `intro` is forwarded to `SectionHeader.astro` by `Gallery`, `Team`,
`Testimonials`, `SectionTeaser`, `Highlights`, `Hours`, `Contact` and `PricingTable`. `Documents`
and `Map` draw their own header, and each now draws the whole cluster — a `section-eyebrow` above
the heading and a `section-intro` below it, in their own left-aligned rhythm rather than through
the centred shared component.

**`VideoSection` was folded onto `SectionHeader.astro` instead**, and it is the one block here
whose output changes. It had headed itself with a literal `text-3xl font-bold` where every other
section heading is the `section-heading` shortcut (40px, `font-brand`), so a site retuning its
headings from its palette retuned twenty of them and not this one. Its left alignment was the same
kind of accident: the three blocks that head themselves are exactly the three that predate the
component, and none recorded a reason — unlike `hero`, `cta_banner`, `promo_split` and `faq`,
which each do. **Safe to correct here because no client uses this block yet**, so there is nothing
to repaint; a site adopting `video_section` after this release gets the header every other section
has. `Documents` and `Map` were left alone for exactly the reason this one could move: folding
them WOULD repaint published pages, so it is a design decision rather than a declaration one.

**Nothing published changes.** Every new field is absent on every existing block and every emit is
guarded, so a block carrying only a heading renders byte-identical HTML — including the class
attribute, which is why the three own-header blocks got a conditional bottom margin on the heading
rather than a rewritten header. Verified by building the mock site and comparing the three
sections' markup before and after.

**Not done here, on purpose.** `hero`, `cta_banner`, `promo_split` and `faq` still draw their own
header and keep it: folding them onto `SectionHeader.astro` would recentre the FAQ header
(`faq-header` is `mb-7` and left-aligned where `section-header` is `text-center mb-12`), repaint
the dark CTA band and turn hero's richtext `<h1>` into a plain `<h2>`. Each carries that reason
beside itself in the block registry.

### A pricing plan's bundled sub-plans and client logos finally render (dashboard#1779)

`PricingTable.astro` drew twelve of the fourteen fields the `plan` item type declares. The two it
dropped were `sub_plans` — the offers a bundle contains, which #1288 added to the backend for a
$790 card holding a $490 and a $390 offer of its own — and `example_logos`, the client-mark row a
card shows underneath. Both were authored in the panel and fully resolved by the API; core simply
never read them, so an editor filled them in and the page showed nothing.

**Additive, and the guards are the reason.** Every emit is behind a length check, so a plan
carrying neither field renders exactly what it rendered before — that is provable by inspection of
the two guards, and it is what the source-walk test asserts. (An earlier draft of this entry led
with an HTML comparison of the fixture site before and after: 0 of 22 pages differed. That proved
nothing about this change, because no fixture plan carried either field, so neither new path ran.
Both fields are now IN the fixture instead, which is worth more: `build:mock`, the VRT sweep and
Playwright all render the new nodes.)

**`example_logos` is now typed, and it is not a string list.** It reaches `PricingPlan` as
`TeaserImage[]`, the existing type for a whole `MediaUrls::for()` object, because a `multiple` media
field emits one object per file (`url`, `alt`, `width`, `height`, `srcset`, …) — not a URL.
`packages/cms-core/BLOCKS.md` still shows the old string-list example; `PagePayload::mediaFields()`
is the authority. A fork reading the field structurally (diligently.pl does) can now read it by
name. Note that `PricingPlan` is hand-maintained above the generated marker — `pnpm cms:types`
skips ref blocks and will not add this for you.

**The visual answers core picked, both deliberately conservative.** `sub_plans` renders as an
indented list of name + price (plus each offer's own CTA as a text link), placed **above** the
card's button — a card inside a card needs surface and padding decisions core does not have, and
the button's `mt-auto` would otherwise push the bundle to the card's foot, away from the price it
qualifies. `example_logos` renders as an unlabelled row at the card's foot, below the feature list.
diligently.pl derives *"Small package examples:"* from the card's own `size_label`; that is a good
idea and that site's editorial voice, so core emits no copy of its own and leaves the label to an
override. Sites wanting a different treatment redefine `pricing-sub-plans`, `pricing-sub-plan-*`,
`pricing-logos` or `pricing-logo` in their own `src/uno.ts`.

Both collections are `<ul>`/`<li>`, like the feature list in the same card and like Gallery's and
Team's tiles — a bundle's offers and a mark row are lists, and the count is what an assistive reader
should hear. The logo `<img>` goes through `responsiveImageAttrs` with a new `IMAGE_SIZES.planLogo`
(`112px` — a fixed value, the one exception to that table's vw rule, because `pricing-logo` is
`h-8 max-w-[7rem]` and so never scales with the container): `MediaUrls::srcset()` emits `w`
descriptors, and a `w` srcset with no `sizes` makes the browser assume `100vw` and fetch the largest
rung for a 112px picture. And the row is guarded on the RESOLVED list, so a card whose every logo
failed to resolve emits no row rather than `pricing-logos`' top rule around nothing.

**Neither field is reachable by the field-coverage gate**, so it could not have caught this and
cannot catch a regression: `pricing_table.plans` is an `items` reference with no inline `fields`, so
`leafFields()` collapses it to one leaf and never descends into the `plan` registry. The guard is a
source-walk test, `tests/pricing-plan-fields.test.ts`.

### A band of video cards, each with its own label (dashboard#1914)

New `videos` block: an eyebrow, a heading, an intro and a repeater of `{ url, label, image }`.
It exists because `video_section` beside it is **one** URL rendered as **one** inline embed, so a
section closing on two clips with different captions — "Se video fra bakeriet" and "Se video" on
scandinaviantaste.no/referanser — had no shape in the CMS at all. `gallery` carries no link per
picture, and `cards` with `layout: bento` makes the editor paste a thumbnail URL by hand.

`core/blocks/Videos.astro` and `lib/video.ts` are new. The **poster is derived from the URL**
(`lib/video.ts` recognises every YouTube form — `watch?v=`, `youtu.be`, `/embed/`, `/shorts/`,
`/live/`, `-nocookie` — and returns `i.ytimg.com/vi/<id>/hqdefault.jpg`), so an editor pastes a
link and types a label and there is nothing to re-upload when a clip is replaced. That parse is
**pure**: no oEmbed, no fetch, nothing that could make a build fail or hang without the content
having changed. Vimeo is recognised for its id and its link but has **no** derivable poster — its
thumbnail lives behind an API call — so those cards fall back to the block's optional `image`, and
to the play mark alone when there is none. An uploaded `image` **wins** over a derived poster
wherever it is set: a control an editor can fill that changes nothing on the page is the failure
`background` shipped with, and it is not being repeated.

A card is a **link, not a second embed** — six players on one page is six third-party frames
loaded before anyone asked to watch anything. The only third-party request the block makes is the
YouTube poster image (`i.ytimg.com`, no cookies); a site that will not make even that one supplies
its own `image` per row.

New core string `videoCard` ("Watch video" / "Obejrzyj wideo") names a card that carries no label
of its own, so a screen reader never meets an unnamed link. New shortcuts `section-videos`,
`videos-inner`, `videos-grid`, `video-card`, `video-card-media`, `video-card-play`,
`video-card-label` — neutral, no brand values, no hover motion; a site retunes any of them.

**Pin bump only, no per-client wiring.** `coreBlocks` gains the type, so a repo that spreads it
(`blocks: { ...coreBlocks }`) renders the block the moment its pin moves. A case study can receive
it once its section has a page builder — `builder: true` on that section, which is per-client
config in the panel and needs no code.

### Every block whose renderer emits a root `<section>` now takes the band (dashboard#1939)

`background` was declared on eight blocks and absent from seventeen others — `hero`, `heading`,
`video_section`, `promo_split`, `section_teaser`, `documents`, `gallery`, `faq`, `team`,
`highlights`, `quote`, `hours`, `map`, `contact`, `custom_html`, `columns` and `tabs`. All
seventeen now declare it and render it, which is `anchor_id`'s rule (v0.50.0 / dashboard#1775)
applied to the field it was written against: **a block gets the band when its root element is a
`<section>`.** The backend holds it as a closed list from both directions (`BlockBackgroundTest`),
so the next block cannot ship with one and not the other.

**No per-client wiring needed, and no visual change** — a pin bump is enough. `default` and an
absent value emit no modifier, so every page published before this renders byte-for-byte as it
did; the field only starts doing something when an editor picks a value in the panel's collapsed
**Advanced** section, where it lands automatically by name.

**What DID move, inside the band mechanism.** Six blocks carried literal neutrals a band cannot
follow, and they are now the role tokens that can:

- `border-gray-200` / `border-black/8` → `border-border` on `section_teaser`, `documents`,
  `highlights`, `hours`, `pricing_table`, `pricing_teaser` and the `pricing-card` / `pricing-badge`
  shortcuts. `--color-border`'s neutral default is `#e3e5ea` against gray-200's `#e5e7eb`, so a
  light band is unchanged to the eye — but the hairline now follows an inverted band and a client
  palette, which a literal never could.
- `.surface-light` — the class that gives an opaque light card its light roles back inside an
  inverted band — now also rides the FAQ item and its action pill, the `section_teaser` card and
  row, the `documents` row and the `team` photo frame. Without it those paint white-on-white on a
  dark band, which is the `pricing-card` bug (v0.50.0) one block over.

**Known limit, unchanged by this and now reachable from more blocks:** `is-brand` is a *solid*
`primary` fill, so a brand-coloured accent on it (a `text-primary` link, the pull quote's rule)
paints primary on primary and disappears. It cannot be fixed by re-mapping `--color-primary`,
which the band reads for its own fill; a site that needs visible accents there redefines those
component keys in its `src/uno.ts`. See the note beside `.section-band.is-brand` in
`core/styles/tokens.css`, and dashboard#1940.

### A background photo on `hero` itself (dashboard#1925)

`hero` gains `background_image` / `background_image_meta` / `background_image_alt` (a
`media_upload` field, resolved and scoped exactly like `cta_card_image`) and `HeroBackground.astro`
draws it full-bleed behind the block, replacing the honeycomb/gradient default only when a picture
is set. The rendered `<section>` gains a `has-bg` class when it does.

**No per-client wiring needed** — a pin bump is enough. Unlike the carousel block (v0.51.0), this
does not add a new block TYPE a site has to opt into; it adds two fields to a block every site
already renders, and a hero with neither set is byte-for-byte unchanged.

**The styling seam, and why core ships none of it.** `.section-hero.has-bg` is the whole contract:
a site adds its own scrim, text-colour flip, crop or minimum height by targeting that class in its
own stylesheet. Core paints no scrim, because every client site has its own — the same reasoning
`carousel`'s `carousel-scrim` token exists for LOCALLY, on a block that already had one from the
day it shipped. `hero` is the block every site's `/` route uses, so an opinionated default here
would restyle the fleet's homepages on the next pin bump; a bare seam does not.

Before this, a hero background was only reachable by wrapping the hero in a one-slide `carousel`
(v0.51.0) — undiscoverable, and not what an editor reaching for "Hero" expects.


## v0.51.0 — a carousel block, and an eyebrow on the heading block

### A carousel block, and one container may finally hold a hero (dashboard#1838)

New `carousel` block: an ordered set of slides, one shown at a time, each holding its own blocks
and its own background picture. It renders wherever a block can go — the first block of a page or
mid-page — which is what a `slides` repeater on `hero` could never have done, since `hero` is
barred from every container. That is the one rule this ships an exception to: a slide of a
**top-level** carousel may hold a whole `hero`, so a rotating hero keeps its real typography, CTAs
and CTA card instead of a copy of five of its fields (dashboard#1838).

`core/blocks/Carousel.astro` is new. Progressive enhancement, same contract as `Tabs.astro`: every
slide is a real element in a **scroll-snap track**, not a transformed strip, so with no JavaScript
every slide stays reachable by scrolling and a swipe is the browser's own gesture, not code. Arrows
and dots appear, and the ~1 KB inline script ships, only once `slides.length > 1` — a one-slide
carousel is a plain section. Autoplay (the block's own `autoplay`/`interval` fields) pauses on
hover, on keyboard focus and off screen, and never runs at all under `prefers-reduced-motion`.

**A fix that reaches this package, not the site layer, on purpose.** Building the rotating-hero
fixture surfaced a real bug: `blocksCarryHeading()` — which of a page's blocks already put an
`<h1>` on it, so the layout knows whether to add its own — only looked inside `columns`/`tabs` and
only one level deep, so a hero in a carousel slide got a SECOND `<h1>`, the layout's fallback
outranking the authored one. The fix (adding `slides`, and making the walk recursive under
ADR-0003) is not a template file — it used to live at `src/lib/page-title.ts`, a **site-layer**
file "Update starter" cannot touch. It has moved into this package as `lib/page-title.ts`; the
site file is now a one-line re-export, so a site's own imports need no change, but this is the
last time this class of bug fixes itself only in newly generated repos.

**Wiring required for a repo that already carries `src/lib/page-title.ts`** (every repo generated
before this tag): replace its content with the re-export —

```ts
export { blocksCarryHeading } from '@rocksoft/cms-starter-core/lib/page-title'
```

— on the same `starter-update` branch as the pin bump. Skipping this keeps the OLD bug: a rotating
hero on that client still ships two `<h1>`s until the file is swapped, even though the pin is
current.

### The `heading` block gets an eyebrow (dashboard#1857)

**Visible on any site whose editors fill the new field; inert everywhere else.** `heading` was the
last section-shaped block with no `eyebrow` — the other thirteen all carry one. So a band that pairs
a small label with a headline had one string for two, and the label won: on scandinavian-taste's
home the `<h2>` holds "Våre produsenter" and the real headline was simply dropped. That is the same
content-destroying workaround the hero's eyebrow closed in dashboard#1509, not a cosmetic gap.

`Heading.astro` now renders `{eyebrow && <p class="section-eyebrow">{eyebrow}</p>}` above the
heading, and the field is `data.eyebrow` on `HeadingBlock`. It is **not** routed through
`SectionHeader.astro`, for the reason the hero recorded: that component emits a fixed `<h2>`, and an
authorable h1–h4 is this block's entire point. It reuses `section-eyebrow` so it reads as one family
with the ten blocks already using it, which also means a site that has retuned that key gets the new
eyebrow already in its own voice.

**The second half is per-client and this bump does not do it.** A site whose component keys a layout
off the heading's literal TEXT — scandinavian-taste's `src/project/blocks/Heading.astro` matches
`text === 'våre produsenter'` to open a white band — keeps that matcher until its own repo drops it
in favour of the real field. Until then, renaming that heading in the panel still silently drops the
band.

## v0.50.0 — the footer defaults to styled, populated and present

Published as v0.50.0 (dashboard#1867 pinned the template to it). Its entries were written
under "Unreleased" and the tag was cut before anyone relabelled them, so they are filed here
now — a heading that says "Unreleased" above shipped code is the one thing this file exists
to prevent.

### The footer stops being unstyled, and stops being absent (dashboard#1852)

Three changes to `Footer.astro`, and one of them is visible on every existing site the moment the
pin moves.

**It now has a default look.** `Footer.astro` emitted `.site-footer`, `.footer-inner`,
`.footer-columns`, `.footer-links` and friends and painted none of them, deferring to a site
stylesheet — `src/styles/site.css` — that the starter ships EMPTY. So every generated repo rendered
a black-on-white column of browser-default bullet lists flush against the viewport edge. The paint
is now `coreShortcuts` entries, exactly the treatment `cookie-consent__*` already has and for the
reason its own comment gives: a component that ships no CSS leaves a fresh client with a bare
unstyled bar. Every value is a palette token, so it inherits a client's brand unedited and inverts
on a dark theme. **A site overrides any of those keys in its own `src/uno.ts`** — site keys win on
collision, no `!important`.

**It reads the footer MENU.** Columns come from the `footer` component's `footer_links` as before,
and *failing that* from `GET /api/menus/{cmsConfig.menus.footer}` — a menu group becomes a column,
its children the links, a top-level leaf a link in the unlabelled column. `footer_links` keeps
precedence, so a client that filled it in sees no change. This is not a new idea: smbp's own
`Footer.astro` has always driven its columns off `getMenu('footer')` while core knew only the
component, so the two halves of the fleet did one thing two ways. The `menus.footer` config seam and
the `menus.footer.json` fixture already existed and had no reader.

**It no longer self-gates to nothing.** Neither source exists until an editor creates it, so a
freshly provisioned site had no footer at all. With neither, the component now renders a copyright
line — `© <year> <site name>`, from `seo.siteName`, which provisioning stamps with the client's
brand name — in the same wrapper, so one set of styles paints all three states.

### `section-content` blocks get the measure v0.3.0 moved to `content-inner`

**Visible on any site using the `heading` or `paragraph` block.** v0.3.0 took the container off
`section-content` and moved it to `content-inner`; `RichContent` was migrated and `Heading` and
`Paragraph` were not, so their text ran edge to edge on any site whose stylesheet had no opinion of
its own. Both now wrap in `content-inner` like `RichContent`, i.e. `container-narrow` (900px)
instead of full-bleed. A site that had compensated for the old behaviour in its own CSS should
check those two blocks after the bump.


## v0.49.0 — a client can paste an embed without a developer

Per-client custom code: an admin pastes raw `<script>`/HTML into the panel, it is stored on the
client and served by `GET /api/site-settings`, and the build emits it.

Core gains `core/CustomCode.astro` and `core/customCode.ts`, with `lib/api.ts` carrying the values
through. The snippets are sanitised and placed, not trusted verbatim — that is what the 245 lines
of `customCode.ts` and its 214 lines of tests are for.

**Wiring required.** The component has to be mounted where the snippets belong:

```astro
import CustomCode from '@rocksoft/cms-starter-core/core/CustomCode.astro'
…
<CustomCode placement="head" />   <!-- in <head> -->
<CustomCode placement="body" />   <!-- last in <body> -->
```

`CookieConsent.astro` moved with it, so a site that mounts consent should re-read that section
rather than assume its old shape.

## v0.48.0 — nothing

Cut from a pin-bump merge commit nine minutes after v0.47.0, so its tree is v0.47.0's tree. **No
core file differs between them.** A site already on v0.47.0 gains nothing by moving to v0.48.0;
a site below it should simply go past both.

It is recorded rather than skipped because a gap in the sequence reads as a lost entry, and
"there is nothing here" is the useful thing to know.

## v0.47.0 — every section-level block can be linked to

`anchor_id` was **copy-pasted into eight block definitions** instead of declared once, so in-page
navigation worked on exactly those eight. Roughly fifteen section-level blocks an editor would
reasonably link to — a hero, a contact band, a tabbed panel, a columns row — could not be linked to
at all (#1775).

`config/cms.php` already stated the intended model: a field named `anchor_id`, `background`, `align`
or `reveal` lands in every block's collapsed **Advanced** section, because it means the same thing
wherever it appears (`Blocks::ADVANCED_FIELDS`). Three of the four were declared once. This one was
not.

The rule for which blocks get it is structural, not taste: **every block whose renderer emits a root
`<section>`**, because that is the element an id can address. A pin bump and nothing else — a block
with no `anchor_id` set emits no id, exactly as before.

## v0.46.0 — the visual-regression harness ships with core

It existed in **one client repo of seven**, while the `vrt-workflow` skill documented it as though
every repo had it (#1798). Now `packages/cms-starter-core/tests/vrt/` carries the spec and the route
list, resolved the way the conformance floor is.

Beyond "the old site we replaced", it takes a **static prototype** as the reference: serve a repo of
HTML locally, point `OLD_BASE_URL` at it, and a port becomes a loop with a number in it — scaffold,
write the UnoCSS, `test:vrt`, read the percentage, iterate.

`OLD_BASE_URL` has **no default**: one client's production host as a shared default is how a shared
harness starts lying on the other six.

**Wiring required** — `playwright.vrt.config.ts` and a `routes.ts` with one entry per distinct
layout, not per page. It is a report, not a gate: the new build is a rewrite, not a byte-for-byte
port, so it surfaces drift for a human to read.

## v0.45.0 — the floor actually runs now

Two corrections to v0.44.0's conversion, **both found by running the suite from a client repo rather
than from this tree** — which is the only place either could show up.

1. **ESM needs the extension.** `from './fixtures'` resolves under TypeScript and does not in plain
   ESM. The suite was discovered in scandinavian-taste — `Total: 236 tests in 1 file`, the mechanism
   working — and then died on `Cannot find module '.../conformance/fixtures'`.
2. The regex used to strip `as T` casts also stripped the word "as" out of prose comments.

Fix 1 was verified by patching the installed package in place **before** releasing anything; the
same 236 tests then collected and ran.

## v0.44.0 — the conformance suite becomes JavaScript, and two fields land

**The floor could not run on any client as shipped in v0.43.0.** Pinning scandinavian-taste to it
and adding the conformance project produced:

```
Error: Stripping types is currently unsupported for files under node_modules,
       for ".../tests/conformance/quality.spec.ts"
Total: 0 tests in 0 files
```

Node refuses to strip types from `.ts` under `node_modules`. The rest of the package is unaffected
because Astro and Vite compile it — this is Playwright's Node-based loader specifically. So
`tests/conformance/` is plain JavaScript, and anything else core ships for a client to *execute*
must be too.

Riding the same tag, two field additions, each closing a gap that failed silently:

- **`feature_cards` gains an `icon` select.** Which glyph sits in a card's tinted square is per-card
  data; the drawing is not, so the field holds a **name** — raw `<svg>` in a text field is
  unthemeable and an injection hole. The vocabulary is a census, not a guess: 127 cards across 26
  machines drew 18 glyphs, of which two clocks, two bolts and two screens differ by a stroke
  invisible at 22px. Folded, that is the fifteen offered. Optional; a card without one still renders.
- **`hero` gains `paragraph`.** `subheading` is the hero's LEAD, sized to carry the headline. A hero
  that also wanted ordinary body copy could only pour it into the lead, where it renders at lead size.

## v0.43.0 — the quality floor ships with core

Counted across all seven client repos: the floor existed in **one**. The defect that started it — a
pill 18px wider than a 320px viewport — would have been invisible on the other six, and the template
had no such checks either, so a client provisioned that morning was born with 29 specs covering
core's renderers and nothing covering whether its own pages fit on a phone.

`packages/cms-starter-core/tests/conformance/` asserts engine properties, not design ones, across
five checks — `narrowOverflow`, `headingOutline`, `imageContract`, `iframeTitle`, `border3px` — plus
focus visibility on interactive elements. Per-site escapes go in `tests/conformance.exemptions.json`,
where **every entry must carry a `reason`**; one without is ignored and warned about, because an
unexplained silence is what the file exists to prevent. Core's own deliberate cases are known to the
checks, so a site never re-declares them. The template ships **no** exemptions, and that is the state
to aim for.

Reasoning: [`0004-conformance-floor-ships-with-core.md`](../../../context/discovery/decisions/0004-conformance-floor-ships-with-core.md).

**Expect red on first wiring, and that is not a regression.** Run against 24 pages of a live site,
it found two real defects on its first outing (`scandinavian-taste#101`): the phone could pan
sideways, and every page opened its outline on an `h4`.

**But see v0.44.0 and v0.45.0 — as shipped here the suite collects zero tests.** Wire it at v0.45.0
or later.

## v0.42.0 — the declared-but-unrendered fields are settled, and the advisor pill becomes a CTA card

**Seven changes ride this tag, and two of them are breaking.** Read those two first — everything
else here is additive, and a page that uses none of the new fields renders byte-identical markup.

### Before you bump

| breaking change | who it reaches |
| --- | --- |
| `advisor_*` on `hero` is renamed to `cta_card_*` | a repo overriding `Hero.astro` / `HeroCtas.astro`, or styling `.hero-advisor*` |
| `rich_content.image` / `.alt` are **retired** | a repo whose `RichContent` override reads either field |

Neither breaks at runtime the moment you bump: the renamed props and the retired fields arrive
undefined, and an override falls through rather than throwing. What breaks is `astro check`. Stored
content for both is migrated by the dashboard, so nothing has to be re-authored and no page loses a
photograph.

The rest of the release is one audit finishing: `rich_content` and `paragraph` between them declared
five fields that no core renderer read, and each is now settled in one of the only two honest
directions — rendered, or removed. None was left standing. Plus a contrast fix the eyebrow work
uncovered, which is the only change here that alters a page nobody edited.

These were not speculative fields. Measured on production the day this was written: taeles-kebap.de
carries a `rich_content` with `eyebrow` filled in, diligently.pl's `/pricing` stores non-default
values on 26 plans, and **four of seven client repos fork a renderer for exactly these fields** —
smbp's `Paragraph` override is 32 lines whose entire difference from core is one class name.

### `advisor_*` is renamed to `cta_card_*` (dashboard#1767) — **breaking**

The four fields v0.41.0 shipped on `hero` as `advisor_image` / `advisor_name` / `advisor_role` /
`advisor_href` are now `cta_card_image` / `cta_card_title` / `cta_card_subtitle` / `cta_card_href`.
The rendering is unchanged; only the vocabulary moved.

The old name described one occupant of the slot rather than the slot. What the fields hold is a
picture, a strong line, a quiet line and a target — a person to talk to, yes, but equally a partner
mark, an app-store badge or a certification, and an editor filling it with any of those read a form
asking for a "Role". Worse, the name did not travel: the same pill was wanted on `cta_banner` and on
the `cta_default` component, and neither could adopt a word that does not describe them.

Config now declares the group once and spreads it into all three, so a CTA card authored on a
banner and one authored on a hero are the same four keys. The `cta_default` component matters most
here: a block reaches only a page that HAS a page builder, and the field-driven templates (a
producer, a product, a category landing) have nowhere to put one — read from the component, they
all get the same pill, edited once.

**The CSS shortcut names moved with the fields**, since leaving them behind would reintroduce the
inconsistency the rename removes:

| before | after |
| --- | --- |
| `hero-advisor` | `hero-cta-card` |
| `hero-advisor-photo` | `hero-cta-card-photo` |
| `hero-advisor-text` | `hero-cta-card-text` |
| `hero-advisor-name` | `hero-cta-card-title` |
| `hero-advisor-role` | `hero-cta-card-subtitle` |

#### What a client repo has to do

Stored data is migrated by the dashboard
(`2026_08_26_140000_rename_hero_advisor_to_cta_card`), including the per-block media collection the
picture lives in — so nothing has to be re-uploaded and no page loses its photograph. On the
frontend:

- a repo that only renders core's `hero` needs the pin bump and nothing else;
- a repo that **overrides** `Hero.astro` or `HeroCtas.astro` must rename the four props it reads;
- a repo that **styles** `.hero-advisor*` must rename those selectors — `grep -rn "hero-advisor" src tests`
  before bumping, the check #1759 added for exactly this kind of rename;
- re-run `pnpm cms:types` after the dashboard is deployed, so `HeroBlock` picks up the new keys.

### `cta_banner` and the `cta_default` component gained the same group

Both now carry `cta_card_*`. Additive: a banner or a component that sets none of them renders
exactly as before. Core does not yet render the banner's card — a site that wants it reads the
fields in its own `CtaBanner` override, which is what scandinavian-taste does.

### `paragraph.variant` renders (#1693)

`paragraph` has offered two ways of reading since #1142 — running prose, or a set-apart note for
formal terms and caveats — and core drew one. An editor picked "Note", the panel saved it, and the
page was unchanged.

| value | renders |
| --- | --- |
| `default` (or absent) | running prose — unchanged, class attribute included |
| `note` | a tinted box: `surface-alt` fill, 1px border, 12px radius, 24px padding |

**The default is byte-identical.** A paragraph that never set the field still renders exactly
`class="rich-body"` — the modifier and its painter key are both absent, not inert.

**The seam** is one key. The block emits `is-note` beside `rich-body`, and core paints it through
`paragraph-variant`; a site retunes the note by redefining that key, exactly like `section-band`.
The values are core's own neutral tokens, so this introduces no new `--note-*` namespace and no
brand colour.

### `rich_content` renders its `eyebrow` and its `animation_url` (#1693)

The block's own panel description has promised an eyebrow since July 2026, when the field was added
backend-first and the renderer deferred to a follow-up that never landed. Three client repos forked
the component to draw it.

- **`eyebrow`** renders above the heading in the shared `section-eyebrow` treatment, aligned with
  the heading — `align` is section-header alignment and the eyebrow is part of that cluster. It is
  drawn inline rather than through `SectionHeader`, because that component has no notion of
  `heading_level`, which this block declares and uses; routing through it would have traded one
  dead field for another. The new `rich-eyebrow` key composes `section-eyebrow` and adds the one
  thing that does not carry over: `SectionHeader` spaces its eyebrow with a flex `gap`, while
  `.content-inner` is plain block flow.
- **`animation_url`** emits the contract core already defines — `<div class="section-animation"
  data-animation-src="…" aria-hidden="true">`, the same element `SectionHeader` gives the eleven
  blocks that draw a header. **Core still ships no player and makes no third-party request**: a
  site that mounts nothing gets a sized, empty, decorative box.

Both emit nothing when unset.

### An eyebrow on a dark or brand band is readable (#1693)

**This is the one change here that can alter a page nobody edited.** If a site has an inverted band
carrying an eyebrow, that label changes colour on this bump.

`--color-eyebrow` was the last text role missing from the band re-maps — v0.37.0 and v0.38.0 added
every other one. Twelve blocks draw an eyebrow and five hand it to `SectionHeader` inside a band, so
this was never specific to `rich_content`; that block is only what finally made it visible.
Measured in a browser on core's own defaults:

| band | before | after |
| --- | --- | --- |
| `dark` | brand accent on the dark fill — **4.09:1** at 13px/700, under the 4.5:1 that size needs | 21:1 |
| `brand` | the palette ships `primary` and `eyebrow` at the **same** default, and the brand band's fill is `bg-primary` — so the label was drawn in the fill's own colour, **contrast 1.0, invisible** | the band's text colour |

The brand band's remaining ratio is a property of `--band-brand-text`, shared with the heading and
both text roles, and is not addressed here.

**The seam:** `--band-dark-eyebrow` / `--band-brand-eyebrow`, each defaulting to that band's own
text colour. A site that wants a coloured eyebrow on an inverted band redefines one token rather
than overriding a component — the same shape as `--band-dark-text-secondary`, which exists because
a band is a different surface and one token cannot serve both sides of it.

### `rich_content.image` and `.alt` are RETIRED — this one needs action (#1693)

**The only breaking change in this release.** `rich_content` no longer declares an `image` or an
`alt`. `RichContentBlock` in `types/blocks.ts` loses both keys, so a site whose override
destructures them stops type-checking on this bump.

A picture beside prose is a **`columns` row holding the prose block and an `image_block`** — the
same call v0.28.0's backend made for `hero`, and what editors were already authoring by hand. That
is not a lesser option:

| | carries |
| --- | --- |
| `columns` | any block per column, `width: prose`, `mobile_reverse` |
| `image_block` | its own `alt`, `caption`, `aspectRatio`, `objectFit`, `objectPosition`, `maxWidth` |
| the two retired fields | a path, and a string |

The layout was left to whichever renderer received them, which is why every repo that forked this
block answered it differently — and why core never rendered them at all.

**Stored content is converted for you.** The panel migration rewrites each affected block into a
`columns` row and moves the picture into the `image_block`'s own media collection, atomically: a
block whose file cannot be moved is left exactly as it was and logged, never half-converted.
`audit_rich_content_media` (MCP) or `cms:audit-rich-content-media` reports what is left; an empty
result is the proof it finished.

**What a site must do on this bump:** if its `RichContent` override reads `image`/`alt`, delete
that branch. Nothing breaks at runtime before you do — the fields simply arrive undefined and the
override falls through to its no-image path — but `astro check` will fail on the types.

### Notes

**A renderer override is not a shield against ALL of this, and v0.42.0's first draft said it was.**
It is true of the components: a site that overrides `paragraph` or `rich_content` renders its own,
so the `variant` / `eyebrow` / `animation_url` work above does not reach it. It is **false of the
shortcut layer**. A site that happens to use one of the new key names in its own component picks up
core's definition on this bump — and one already does: `taeles-kebap-astro`'s `RichContent`
override writes `class="rich-eyebrow"` in its no-image branch, and its own `src/uno.ts` defines
`rich-heading` and `rich-body` but not that key. It paints nothing today and will paint core's
eyebrow treatment after the bump. Redefine `rich-eyebrow` in `src/uno.ts` to keep the current look.

smbp's `Paragraph` override can be deleted after this bump, moving its note styling from a
component to a redefinition of the `paragraph-variant` key.

`reveal` still renders nothing anywhere, for the reason v0.41.0 gave: it needs a scroll observer the
site layer mounts.

## v0.41.0 — the `align` select renders, and hero and cards gain the fields sites were forking for

**Six changes ride this tag**, because none of them had been published when the next one landed.
Every one is additive in what it RENDERS: a page that does not use the new field or value produces
byte-identical markup, and none of them needs a config or layout edit.

**One of them renames two class names, though** — `.hero-2col-left` / `.hero-2col-right` become
`.hero-2col-own` / `.hero-2col-track` (see [that section](#a-heros-own-content-is-a-movable-track-1632)).
The output is unchanged; a site that *names* the old classes in a stylesheet or an e2e test is not.
`grep -rn "hero-2col" src tests` before bumping. Everything else here is a pin bump and nothing else.

Five of the six exist because a client repo had already paid for them in a fork. That is the
through-line worth reading this entry for: `hero` and `cards` were the two blocks sites overrode
most, and these are the fields those overrides were buying.

### `align` renders on seven blocks (#1643)

`align` shipped on six blocks and was read by **none** of them. An editor picked "Centered", the
panel saved it, `/api/pages` returned it, and the page was unchanged — the same silent no-op
`background` was until v0.37.0, and measurably not a field nobody used: 38 blocks on one client
site and 2 on another store a non-default value today, and that first site had forked six core
components to read it. `hero` did not offer the field at all, so the one thing an editor could not
author was a hero whose content is simply centred.

A pin bump and nothing else — no config edit, no layout edit, and no page changes unless an editor
had already set the field.

#### What renders now

`align` on **`rich_content`**, **`features`**, **`pricing_teaser`**, **`testimonials`**,
**`cards`**, **`pricing_table`** and — new in this release — **`hero`**:

| value | renders |
| --- | --- |
| `default` (or absent) | the block's own design — unchanged |
| `left` | the section header pushed left |
| `center` | the section header centred |

**`left` is a real value, not a synonym for `default`.** Core's shared header and its hero both
centre by design, so "push this one back" is a choice an absent value could never express — which
is why the token has three states and not two.

**Scope is the section HEADER**, not the whole section: a centred `rich_content` centres its
heading and leaves its body copy where it was. That is the field's definition, and it matches the
source these blocks reproduce — a centred heading over prose that stays left.

#### The seam

The block emits `is-align-left` / `is-align-center` on its own `<section>` — the hook a site styles
against, beside `section-band`'s `is-dark` — and core paints the elements it aligns through three
new shortcut keys:

| key | sets | on |
| --- | --- | --- |
| `align-text` | `text-align` | the header box, `.rich-heading`, the hero's own track |
| `align-column` | `align-items` | `.section-header`, `.section-header-text`, `.hero-text` |
| `align-row` | `justify-content` | the hero's button row |

Three and not one because a flex column and a flex row put the horizontal axis in different
properties. A site retunes any of them by redefining the key (seam 1), exactly like `section-band`.

**Nothing is emitted when the field is unset**, painter classes included, so a page built before
this release renders byte-identical markup.

**A site that overrides one of these blocks does not get the fix** — it renders its own component,
and the seven core renderers are what changed here. `reveal`, the sibling token in the same
registry, still renders nothing anywhere: it needs a scroll observer the site layer mounts, so
core emitting a class for it would leave the control just as dead as it is now.

### A cards item can name the person in its picture (#1640)

A card row could already carry a picture, and when that picture is a **person** there was nothing
to say whose it is: `marker` is the eyebrow, `label` the heading, `value` the body, `href` the link,
and `icon` is a select from a fixed set. So a contact card could show a portrait with the name
missing — the state `scandinaviantaste.no/kontakt` shipped in.

`caption` sits beside `image`, because that is what it captions. Optional, so every existing card
row is unchanged. It renders first in the text column, quieter than `card-label`, and it is **not**
also pushed into the picture's `alt`: the name is real text beside the image, so captioning it
twice would only make a screen reader say it twice.

The text column carries `card-text` — a naming hook, not a look — so a site can put the name under
the portrait without writing a selector against an anonymous div.

### A hero can carry an advisor (#1711)

The 2026 redesign puts an advisor pill beside a hero's primary button: a round photo of the person
the visitor would be talking to, their name, their role. No field carried it, so the client that
needs it shipped without it.

The fields sit on `hero` alone, in their own group, all optional and all inert on their own — a
hero that sets none of them renders exactly as it does today, which is every existing hero on every
client. They are deliberately **not** folded into `hero.ctas`: that list is `$ctaList`, shared with
`cta_banner`, and widening it would put a photo and a job title on every banner link as well.

### A hero's own content is a movable track (#1632)

A hero with nested columns always drew its own eyebrow / heading / subheading / CTAs in the layout's
**first** track. The mirror — picture or form left, heading and CTA right — could not be authored at
all, and neither could text in the middle of a three-track hero. The Layout token cannot express it:
`1-2` changes the proportions, never the order.

The flag becomes a position: `own_content_slot => true` is replaced by `own_content_track_key`,
naming a sibling field that holds **which** track the block keeps for itself. Unset or `0` renders
exactly what shipped before, so there is no migration and no visual change to an existing hero.

**⚠ BREAKING — two class names moved with it.** `left` and `right` stop being true once the block's
own content can sit in any track, so:

| before | after |
| --- | --- |
| `.hero-2col-left` | `.hero-2col-own` |
| `.hero-2col-right` | `.hero-2col-track` |

**The rendered result is unchanged** — the same `flex-grow` values land on the same two elements, so
nothing about the page moves. What breaks is anything that *names* the old classes: a site
stylesheet, or an e2e test.

**Four of the seven client repos named them.** Measured while rolling v0.41.0 out, by grepping each
clone — an earlier count from `gh api search/code` said one, and its index was stale:

| repo | how it named them | needed a fix |
| --- | --- | --- |
| smbp | `tests/e2e/layout-shares.spec.ts` | **yes** — 410 passed, 1 failed |
| rebelia | the same test | **yes** |
| raw-operations | the same test | **yes** |
| diligently.pl | its own forked `Hero.astro` emits **and styles** them | no |

The three tests are the same file, because they come from the same template. Each was two renamed
selectors; the values they assert did not move.

**diligently.pl is the case worth understanding.** Its fork emits `hero-2col-left` in its own markup
*and* defines `.hero-2col-left { flex: 1 1 0; text-align: center }` in its own scoped `<style>`. It
never depended on core's rule, so the rename cannot reach it — its build came out byte-identical.

So the question is not "do you name these classes" but **"do you name them AND let core style
them"**:

```
grep -rn "hero-2col" src tests
```

- no match → nothing to do (scandinavian-taste, taeles-kebap-astro)
- matches in a test, or in CSS that relies on core's rule → rename to `-own` / `-track`
- matches in your own component that also styles them itself → nothing to do, but check that the
  style really is yours

### `cards.layout` gains `stats` and `bento` (#1692)

Two new values on the select, emitted as `is-stats` / `is-bento` on the section beside the three
that were already there:

| value | renders |
| --- | --- |
| `tiles` | compact, link-led — unchanged |
| `cards` | icon, label and value — unchanged, and still the fallback |
| `steps` | a numbered sequence — unchanged |
| `stats` | **new** — a row of bare figures |
| `bento` | **new** — picture-led cards |

They exist because a site was **inferring** them. With no value to pick, scandinavian-taste read
the intent out of the data: a `tiles` block whose items all lacked an `href` became a dark stat
band, one where any item carried a link became a bento grid. An editor who linked one of four
figures silently changed the layout, and both outcomes were valid renders of valid data, so nothing
could report it.

**These are hooks, not looks.** Core paints none of the five — the difference between cards layouts
belongs to the site layer, so a site styles `.is-stats` in its own `src/uno.ts` (seam 1). Core ships
no shortcut key for them, for the same reason it ships none for `is-tiles` (#1035): a shortcut key
*is* a class name, so a "neutral" one would generate nothing while reading like working style.

`cards` remains the fallback for an absent or unrecognised value, which is what keeps a site pinned
below this tag safe: it renders the old layout rather than a section with no layout class at all.

### Also in this tag, invisible

`align`'s three shortcut keys gained the reason they are shaped the way they are, plus a test that
fails the plausible-looking simplification (#1720). No rendered output changes. It is listed because
the keys look redundant on the cascade and are not — the reason is **extraction**, not specificity.

### Not in this tag

The single-track `columns` Layout (#1679) is **backend-only**: `ColumnLayouts` gained the token and
core's existing share logic already renders it, so no core file changed but a test. A site gets it
from the panel with no pin bump at all.

## v0.40.0 — a pricing section names its own presentation, and a columns hero stops dropping its CTAs

Two independent changes ride this tag.

### A hero with columns rendered no CTAs at all (#1647)

`Hero.astro` renders two layouts and `ctas` was written into only one of them. The editor filled
the field, the panel saved it, the API carried it, and the multi-column hero rendered eyebrow +
heading + subheading and **nothing else**. The field-coverage gate could not see it — the field name
IS mentioned, just in the wrong branch — so it took a rendered page to catch, and scandinavian-taste
had a live hero in exactly that shape whose override hand-rendered the CTA loop.

`HeroCtas.astro` is now rendered from **both** branches, so a third layout cannot lose them again.
`cta_note` (#1354), which had rendered nowhere at all, renders with them — under the buttons, which
is the whole reason it exists.

**Core also stopped shipping one client's animations.** It hardcoded the reference site's two Lottie
JSONs plus an `unpkg.com` `<script>` on every page with a single-column hero. Those files return 200
on that client's own site and **404 on every other** — measured on two. They arrived as
Webflow-parity markup that rode along when core was extracted into a package, and removing them
costs nothing, because the client that uses them overrides `hero` in its own repo.

### A pricing section names its own presentation (#1416)

A seven-entry lookup keyed by `anchor_id`, in a client's forked `PricingTable`, decided per section
which illustration hangs under the heading, how big the price is set, and what closes the section.
Nothing rendered wrongly while it stayed; what it cost is that **no editor could reach any of it**,
and that the map was written twice per section, because the same band appears on the pricing page
and on its service page.

Measured against the source markup and all 149 of that client's pages, two of the five candidate
fields turned out not to be fields at all: `descriptionSlot`'s third state is the `wide` layout the
renderer already knows, and `finePrint` belongs on the **plan**, not the table — the slot follows
what the note says, and the note lives on the plan.

The section's closing block is now a `body` paragraph plus a real CTA through the shared `$ctaList`,
replacing a hardcoded English sentence and a hardcoded `/contact`.

## v0.39.0 — a pricing table names its own billing tabs

The billing-toggle buttons took their names from a map hardcoded in the renderer, so a single pair
had to serve every pricing table on every site. It cannot: the same two billing types read as
"One-time / Subscription" where products are priced, and as "One-time services / Monthly services"
where the same work is priced by engagement. Whichever pair core hardcoded was wrong on the other,
on every build — confirmed on two routes.

`tab_labels` is the per-table override, keyed by `billing_type` exactly like the `tab_icons`
repeater beside it, so the block gains no new mechanism — just a second instance of one it already
had.

**The resolution lives in `lib/tab-label.ts`, not inline in the renderer**, and that is the part
worth knowing if you maintain an override: a client site may register its own `PricingTable`, which
**replaces** core's renderer rather than extending it. An override that calls the shared helper
resolves labels identically, blank-row rule included, and `defaults` is a parameter, so a site whose
own wording differs passes its pair and still inherits the precedence.

Precedence is own label → default pair → raw billing type, joined with `||` and not `??`: a repeater
row saved with a `billing_type` but a blank label is half-filled input, not a deliberate empty
caption.


## v0.38.0 — a band derives its readable text, and a section block can be the page H1

Two independent changes ride this tag, because neither had been published when the other landed.
Both are a pin bump and nothing else — no config edit, no layout edit.

### A section block can render its heading as the page `<h1>`

A section block renders an `<h2>` for its own heading. That is right while the section sits under a
page title and wrong when the section **is** the page title: a page composed only of blocks then
ships no `<h1>` at all, its real title renders one level down, and every heading below it hangs off
nothing. Four pages on one client site were in exactly that state — each opens with a `promo_split`
or a `rich_content`, so each rendered its title as an `<h2>` with no `<h1>` anywhere (dashboard
#1579).

`heading_level` is a new select on **`promo_split`** and **`rich_content`**:

| value | renders |
| --- | --- |
| `default` | `<h2>` — unchanged |
| `h1` | `<h1>` — "this section is the page title" |
| `h2` / `h3` | that tag |

It rides the same shared-field seam as `background` / `align` / `reveal`, so extending it to another
block later is one line. **`default` keeps the current `<h2>`**, and anything unrecognised — an empty
string, a cased `H1`, a value from a newer schema this build does not know — falls back to `h2` too,
which is what makes it render-identical for every page that has no opinion.

It is deliberately **not** clamped to one `<h1>` per page: a block cannot see the rest of the page,
so that stays the editor's call — the same position the standalone `heading` block already takes.

### A band derives its readable text instead of guessing it

v0.37.0 left one band variant guessing and another one hardcoded. Both are one line here, and
neither needs a config edit or a new panel field — a pin bump is the whole change.

**The `brand` band's text is now derived from the fill it sits on.** It defaulted to
`--color-button-primary-text`, which is the partner of `button-primary`, not of `primary`. When a
client's primary button is not its brand colour the default is simply wrong: with
`primary: #ffcf00` and `button-primary-text: #ffffff` it produced white on yellow, **1.48:1**. The
token is now computed from the fill — black on a light brand, white on a dark one — so it cannot
disagree with `primary` again.

It makes the same *decision* as the panel's `App\Support\Color::text()`, not the same computation:
that thresholds WCAG relative luminance, which CSS cannot derive from a single hex, so this
thresholds OKLCH perceptual lightness at `0.58`, calibrated against the WCAG crossover across the
sRGB cube. Exact for neutrals; for roughly 2% of highly saturated greens and purples the two metrics
disagree and the derivation can pick the less readable of black/white. Strictly better than the
static default it replaces in every case, but not a guarantee of AA on an arbitrary hue — if your
brand colour is a mid-tone, check the band and set `--band-brand-text` yourself.

This is deliberately **not** a new branding field. A field would be a second value to keep in sync
with `primary`, and the two drifting apart is exactly how the old default broke. There is one
setting — the client picks `primary` in the panel — and the text follows it.

```diff
+ @supports (color: oklch(from red l c h)) {
+   :root {
+     --band-brand-text: oklch(from var(--color-primary, #3b5aff) clamp(0, (0.65 - l) * 1000, 1) 0 0);
+   }
+ }
```

It is gated because an unsupported relative colour function is invalid at computed-value time,
which would poison the declaration reading it rather than fall back. A browser without it keeps
v0.37.0's value — no regression, no fix either. Chrome 119+, Safari 16.4+, Firefox 128+.

**The `muted` band follows the palette instead of a literal.** `--band-light-bg` already read
`var(--color-surface)`; its sibling was a hardcoded `#f2f2f2`, which **inverts on a dark-themed
site** — a site with `surface: #141f16` and `heading: #ffffff` got a near-white slab under a white
heading, 1.07:1. It now reads `var(--color-surface-alt, #f2f2f2)`.

```diff
- --band-muted-bg: #f2f2f2;
+ --band-muted-bg: var(--color-surface-alt, #f2f2f2);
```

**One visual change to check:** a site that sets no `surface-alt` now paints `muted` with core's
neutral `#f5f6f8` where it used to be `#f2f2f2`. Three points apart and indistinguishable in place,
but it is a real difference, so it is stated rather than buried. Every other band value is
unchanged, and a site that sets no band renders byte-identically as always.

**A site that painted its own bands should re-check two things:** if it redefined `--band-brand-text`
in its own `:root`, that still wins (seam 2) and nothing changes; if it relied on `muted` being
exactly `#f2f2f2`, set `--color-surface-alt` or `--band-muted-bg` explicitly.

## v0.37.0 — a section band is readable, and `pricing_teaser` gets one at all

v0.36.0 shipped the `background` select's render half — six blocks declare the field, and until
then only `pricing_table` read it, so an editor picked "Dark", the panel saved it, `/api/pages`
returned it and the page rendered white (dashboard #1498). That half worked. This one fixes what
it painted.

**A "dark" band no longer resolves to a brand colour.** `is-dark` was `bg-secondary`. `secondary`
is one of the client-editable branding colours and is dark only because the neutral palette happens
to default it to `#101841` — nothing guarantees it. Bands now read `--band-*` tokens with neutral
defaults (`#000` / `#f2f2f2` / white). Same defect class as #1475: a token used for a role it does
not promise.

**Known limitation — the `brand` band's text is still a guess.** `is-brand` fills with `primary`,
a hue core does not control, and takes its text from `--band-brand-text` (default
`--color-button-primary-text`). That default is wrong whenever a client's primary BUTTON colour is
not its brand colour: with `primary: #ffcf00` and `button_primary_text: #ffffff` it yields white on
yellow, **1.48:1**. Core cannot compute a readable partner for an arbitrary hue in CSS, so **a site
whose `primary` is light must set `--band-brand-text` itself** until the build derives it. Tracked
separately; `dark` / `light` / `muted` are unaffected.

**A light card inside an inverted band stops rendering its own text invisible.** This is the one
to check on your site. An inverted band re-maps `--color-text-primary` and sets `color`, and four
core surfaces paint their own light background inside that band — `features-card`, the testimonial
figure, the `pricing_teaser` card and `pricing-card`. Their headings carry no colour class, so they
inherited the band's white onto a white card: **1:1 contrast, completely invisible.** Those four now
carry a `surface-light` class that puts the light roles back. If your site defines its own light
card inside a section that can be banded, add `surface-light` to it.

**`pricing_teaser` renders the field at all.** It declares `background` in the schema like the other
five and was missed, so the value was still dropped on the floor there.

**`--color-muted` flips with the band too**, so `text-muted` (`faq-intro`, `gallery-note`,
`team-photo-placeholder`, the separators) is no longer near-black on black.

```diff
- 'section-pricing-table': 'bg-section-bg section-surface',   // [&.is-dark]:bg-secondary
+ 'section-pricing-table': 'bg-section-bg',                   // the band rides `section-band`
```

**Renamed, and this is the only breaking part of the bump:** the `section-surface` shortcut is now
`section-band`, it is no longer composed into `section-content` / `section-features` /
`section-cards`, and each banded block emits `section-band` in its own markup instead. That matters
because the styling contract tells a site to override those section shortcuts in its own `src/uno.ts`
— under v0.36.0 doing so silently dropped `section-surface` and killed every band on the site. It
cannot now. The token re-mapping is also scoped to `.section-band.is-dark` rather than a bare
`.is-dark`, and moved into `@layer core` so a site rule still wins; the `--color-on-dark*` tokens
v0.36.0 introduced are gone, replaced by `--band-*` (`--color-*` is the CMS palette's namespace, and
a client adding an `on-dark` brand key would have collided with it).

**No client action for a site that sets no band**, which today is every site in the fleet —
`default` and an absent value still emit no class at all, so those pages render byte-identically.
A site that overrides `section-content`/`-features`/`-cards`, or that redefined `--color-on-dark*`,
should re-read the two paragraphs above; a site with a light `primary` should read the brand-band
limitation.

## v0.36.0 — `hero` can carry an eyebrow, like every other section block

`hero` was the only section-level block with no `eyebrow`. Ten blocks render one through the
shared `SectionHeader`, and the CMS offers the field on all of them — so an editor composing a
hero had to fold the kicker into the heading itself, where it inherits `heading-h1` and cannot
be styled or translated apart from it. Dashboard #1509, surfaced by the scandinavian-taste
migration.

`HeroBlock.data` gains `eyebrow?: string` and `Hero.astro` renders it above the heading in
**both** layout branches — the two-column hero and the single-column one — so the field does not
silently work in one arrangement and vanish in the other.

**No client action, and no visual change to an existing hero.** The field is optional and absent
on every hero authored so far; a hero that does not set it renders exactly as before.

It is deliberately NOT routed through `SectionHeader`. That component emits an `<h2>`, and a
hero's heading is the page's `<h1>` — composing it would either demote the hero heading or
produce a second heading level above it. The eyebrow reuses the shared `section-eyebrow`
shortcut instead, so it picks up the same typography as the other ten blocks and retunes with
them, without borrowing the wrong document structure.

```diff
- const { heading, subheading, ctas = [], columns = [], columns_layout } = block.data
+ const { eyebrow, heading, subheading, ctas = [], columns = [], columns_layout } = block.data
+ {eyebrow && <p class="section-eyebrow">{eyebrow}</p>}
```

It renders as plain text, not rich text: `hero.eyebrow` is a `text` field in the registry, the
same as every other block's eyebrow, while `heading` and `subheading` stay `richtext`.

## v0.35.0 — a variable brand font registers its whole weight axis, and `columns` stops dropping two settings

Two independent changes ride this tag, because neither had been published when the other
landed. Both are a pin bump and nothing else — no config edit, no layout edit.

### A variable brand font registers its whole weight axis, not a selection

A pin bump and nothing else. No config edit, no layout edit — the change is entirely in what the
build asks Google for.

**The measurement this comes from.** For `Inter` with `subsets: latin, latin-ext`:

| request | woff2 files | bytes | `@font-face` blocks | weights the browser may use |
| --- | --- | --- | --- | --- |
| `wght@400;600;700` | 2 | 47.1 + 83.1 KB | 6 | 400 / 600 / 700 |
| `wght@100..900` | the same 2 | the same bytes | 2 | 100–900 |

Google serves the **variable** file either way. Asking for three discrete weights does not fetch
three smaller files — it fetches the same variable file and declares it three times, which fences
the browser off from weights the downloaded face already carries. On two live sites that showed up
as body copy set in `font-weight: 500` rendering at 400, from a file that contains 500.

So `GET /api/branding` now carries `weight_range` per role — `"100 900"`, the form unifont reads
as a range — and `cmsFonts()` registers that in preference to the discrete list. The preflight
spells it `100..900`, which is what css2 accepts. Fewer `@font-face` declarations in every page's
inlined CSS, the same download, and no weight a site's CSS can reach for and miss.

**Nothing breaks on the way there.** `weights` is still in the payload, so a site that has not
taken this bump keeps building exactly as it does today; `weight_range` is simply a key it does not
read. A backend older than this sends no such key and the discrete list is what registers. And an
unreadable range — anything but two numbers and a space — is ignored rather than passed on, because
a malformed one would reach Google as a family it does not publish and cost the client its font.

**Static families are unaffected**, deliberately. Roughly a fifth of the CMS catalog has no `wght`
axis, and there a range would expand to every instance inside it (Poppins: 3 files becoming 18).
Those keep the discrete list, and the panel keeps offering the weight checkboxes that make it
worth something.

### `columns` stops dropping the two settings the panel offers

The `columns` block has offered **Prose measure** and **Reverse on mobile** since it shipped.
Neither did anything. `ColumnsBlock` declared `layout` + `columns` and stopped there, and
`core/blocks/Columns.astro` read neither field — so an editor picked a setting, the panel saved it,
`GET /api/pages` returned it, and every client site rendered as though it were unset.

That is the failure mode worth naming: not an unsupported field, but a **silently ignored** one.
Nothing in the panel, the payload or the page says the choice did not take, so the only way to find
it is to notice the page looks wrong and go reading a renderer in another repo. It surfaced from the
client side — taeles-kebap-astro#45 narrowed both fields locally with a cast to stop its own site
dropping them, which fixes one client and leaves every other one broken.

**No client action.** Both settings are optional and absent on almost every block; a row that sets
neither renders exactly as before. The two shortcuts changed shape but not their resolved value:

```diff
- 'columns-grid': 'container-global grid gap-8 items-start grid-cols-[var(--cols)] max-md:grid-cols-1',
+ 'columns-grid': 'w-[90%] max-w-[var(--columns-measure,var(--layout-container))] mx-auto ' +
+   'grid gap-8 items-start grid-cols-[var(--cols)] max-md:grid-cols-1',
+ 'columns-reverse-mobile': 'max-md:[&>*]:[order:var(--col-order)]',
```

`container-global` expanded to `w-[90%] max-w-[var(--layout-container)] mx-auto`, which is what the
fallback resolves to — so a site that overrides `columns-grid` keeps its override, and a site that
does not sees no change. The measure rides a custom property rather than swapping `container-global`
for `container-prose`: both expand to a `max-w-[…]` utility, and composing them on one element would
leave the winner to the order Uno happens to emit them in.

`mobile_reverse` reverses with `order` under the `max-md:` variant, from a per-column `--col-order`
the renderer sets. Not by reversing the markup and not by switching the container to
`flex-col-reverse`: the DOM order stays as authored, so reading and focus order stay with it; the
desktop row is untouched because `order` never applies above `md`; and it generalises to the three-
and four-column presets instead of assuming two.

## v0.34.0 — a second brand font role, so a site can drop its Google Fonts `<link>`

v0.33.0 shipped one font token, and it turned out to be one too few. Measured across the fleet
right after that rollout, three live sites were still fetching a `fonts.googleapis.com`
stylesheet at runtime — and every one of them uses a **display face and a body face**, so moving
only the display one would have left the `<link>`, and its third-party request, exactly where it
was. Dashboard #1521.

`GET /api/branding` now carries `fonts.body` next to `fonts.primary`, and `cmsFonts()` registers
both:

| Role | API | Variable |
| --- | --- | --- |
| Display | `fonts.primary` | `--font-primary` — what core's `font-brand` shortcut resolves |
| Body | `fonts.body` | `--font-body` — what the SITE's `body` rule resolves |

**`--font-body` is published, not applied — and adopting it is a one-line site edit.** Running
text inherits from `body`, whose rule lives in the site's own `global.css`: unlayered, later in the
cascade, and therefore unbeatable by anything this package could declare. Point that rule at the
token, keeping the site's current stack as the fallback for a client that picks no body face:

```css
/* src/styles/global.css */
body { font-family: var(--font-body, ui-sans-serif, system-ui, sans-serif); }
```

No change is needed in `astro.config.mjs` or `Layout.astro` — `cmsFonts()` and `<BrandFont />`
handle both roles as they stand. A client that has set no body font registers nothing for it, and
the variable stays undefined, which is why the fallback above is what renders today.

**The roles are independent, in every layer.** Either can be set alone; each is preflighted against
Google on its own, so a family Google has retired in one role never costs the other its face; and
picking one family for both is normal rather than a collision — Astro keys a family by
cssVariable + name + provider, so it is two variables over one cached download.

**A face the CMS does not own stays site-layer.** A decorative accent script belongs in the site's
own `fonts:` entry in `astro.config.mjs` with a `<Font cssVariable="--font-accent" />` in the
layout head — Astro downloads it at build time too, so it costs no runtime request, and
`cmsFonts()` appends rather than replaces, so it coexists with both CMS roles. What it must NOT be
is a `cmsConfig.fonts.stylesheets` URL: that is a `<link>` the visitor's browser fetches, before
any consent decision. See `frontend/docs/starter.md` § Brand fonts.

## v0.33.0 — the CMS can set the brand font, and the build self-hosts it

`font-brand` — the shortcut behind every section, FAQ and CTA heading, and the features step
numbers — resolves `var(--font-primary, inherit)`, and **nothing in this stack ever defined
`--font-primary`**. The build emitted colour tokens at `:root` and no font token at all, so the
brand face was whatever each site's `global.css` put on `body`. Changing it meant a PR against the
client repo, or a `custom_html` block carrying a `<style>` — the anti-pattern #1451 / #1455 exist
to remove. Dashboard #1485 closes the half of #114 that was dropped in 2026-07.

**Two new pieces, and a client repo needs both.** This is the one-time cost; after it, the font is
a panel edit:

```js
// astro.config.mjs — alongside v0.32.0's cmsConsentEndpoint(), which needs an edit of its own
import { cmsFonts } from '@rocksoft/cms-starter-core/core/fonts.mjs'
integrations: [UnoCSS(), cmsRedirects(), cmsConsentEndpoint(), cmsFonts()]
```

```astro
---
// src/layouts/Layout.astro
import BrandFont from '@rocksoft/cms-starter-core/core/BrandFont.astro'
---

<head>
  …
  <BrandFont />
</head>
```

`cmsFonts()` reads `GET /api/branding`.`fonts.primary` at config time — same shape, same
credentials and the same `.env` handling as `cmsRedirects()` — and registers it as an Astro font
family. Astro downloads the files into `_astro/fonts`; `<BrandFont />` emits the `@font-face`
rules, the preload links (opt-in, `<BrandFont preload />`) and the `:root { --font-primary: … }`
that `font-brand` has been reading all along. **The built site makes no request to
`fonts.googleapis.com` or `fonts.gstatic.com`** — which is the point: on a fleet shipping a consent
system, a linked font is a third-party request to gate, and a gated font means text reflowing after
the visitor accepts.

Only upright faces are downloaded (`styles: ['normal']`, against Astro's default of normal +
italic) and both `latin` and `latin-ext` are requested — the second is what carries ą/ć/ę/ł and the
German umlauts, without which Polish text falls back one glyph at a time.

**Nothing here can fail a build.** The integration preflights the family against Google with a
bounded timeout and registers it only if that answers; Astro's own resolver runs with
`throwOnError: false`, so an unresolvable family degrades to the fallback stack; and `<BrandFont />`
renders `<Font>` — which throws on an unregistered `cssVariable` — only when `fontData` says one
was registered. A client that has set no font registers nothing and renders exactly as before.

**A site that declares `--font-primary` in its own `astro.config.mjs` keeps that declaration, but
the CMS overrides it** — the integration appends, and Astro resolves the last registration for a
variable. Same precedence as every other brand value here: `/api/branding` over
`cmsConfig.brand.colors` over core's defaults. Astro logs that the two families did not merge,
which is the signal that a site-level declaration is now being overridden from the panel.

## v0.32.0 — the consent answer moves to a cookie, and the banner says what the ad cookies do

Two consent changes ship in this tag. **The first one needs a line in your `astro.config.mjs`** —
a pin bump alone leaves it inert.

### The consent answer is stored in a first-party cookie, not `localStorage`

WebKit purges script-written storage after seven days of Safari use without interaction with the
site, and the cap is keyed to **how** a value was written, not to which API reads it. So the old
`localStorage.setItem('cookie-consent', …)` re-prompted every Safari visitor roughly weekly
whatever lifetime was configured — and swapping it for `document.cookie` would have changed
nothing. A cookie set by a `Set-Cookie` header from a genuine first-party origin is exempt.

`core/consent.mjs` owns the cookie's name, its lifetime (`CONSENT_MAX_AGE_DAYS = 365`) and the
source of the endpoint that sets it; `core/consentEndpoint.mjs` is the Astro integration that
writes that source to `dist/consent.php` on `astro:build:done`. A `.php` file works because the
built `dist/` **is** the release directory and every client frontend is a RunCloud app with PHP 8.2
on `stack: hybrid` — so the endpoint is origin-local with no new infrastructure.

**Upgrading is two steps, not one:**

```js
// astro.config.mjs
import { cmsConsentEndpoint } from '@rocksoft/cms-starter-core/core/consentEndpoint.mjs'

integrations: [UnoCSS(), cmsRedirects(), cmsConsentEndpoint()],
```

Bump the pin **first**, then add the line — the import resolves against the pinned core, so a config
edit that lands before the bump breaks the build. Skip the line entirely and the banner POSTs to a
URL your build never emitted, silently falls back to `localStorage`, and your Safari visitors keep
being re-prompted weekly: present, inert and quiet, which is why
`tests/unit/consent-endpoint-registered.test.ts` ships as a guard for repos generated from the
template. Verify after deploy with a POST to `/consent.php` — it must answer `204` with a
`Set-Cookie: cookie-consent=…` header.

Reading is unchanged for a returning visitor: the cookie is read first, a pre-existing
`localStorage` record is still honoured and rewritten through the endpoint on the spot, so the
upgrade re-prompts nobody. `pnpm dev` emits no endpoint and takes the fallback, which is the right
thing for local work.

### The banner says what the advertising cookies actually do

The consent banner's built-in copy under-described both categories, and the top-level message
described only half of what accepting does. All three strings change, in all four locales.

| Key                      | Was                                                 | Now names                                                                                                             |
| ------------------------ | --------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| `marketing_description`  | _"Used to measure and improve ad performance."_     | that a click on a Google ad **elsewhere** is matched to this visit, and that **Google** — a third party — receives it |
| `statistics_description` | _"Helps us understand how visitors use this site."_ | the identifier, its **two-year** lifetime, and that it goes to Google                                                 |
| `message`                | _"We use cookies to measure traffic…"_              | advertising as well as traffic                                                                                        |

The `message` row is the one that matters most and is easiest to miss: granular mode is opt-in, so
**most sites render no category rows at all**. For them that sentence is the entire first layer,
and it promised traffic measurement while Accept also grants `ad_storage`, `ad_user_data` and
`ad_personalization`.

The compliance point behind it, from the legal research in #1352: the mandated artefact is the
**purpose description**, not the category label. Cookiebot keeps the word "Marketing" and is fine,
because a paragraph and a per-cookie table sit underneath it. Ours had a seven-word sentence.

Copy only — no behaviour, no schema, no API shape. A site picks it up by bumping the core pin; a
client who has authored their own `cookie_consent` component text is unaffected, since these are
the fallbacks. The panel mirrors them as the editor's per-locale placeholders
(`config/cms.php`), pinned string-for-string by `CookieConsentDefaultsAreMirroredInConfigTest`.

## v0.31.0 — `anchor_id` on cta_banner

`CtaBanner` emitted a bare `<section class="section-cta">`, so nothing could deep-link to a
call-to-action banner — and the banner is the block most likely to BE the target rather than to
hold one. A site whose header menu item and hero button both point at `#kontakt` had to park that
anchor on whatever block happened to precede the banner, so the jump landed one section early.
Observed on a live site (#1474).

`anchor_id` is the same field and the same `sectionAnchorId()` normalization the seven other
section-level blocks already use (`rich_content`, `features`, `faq` since v0.28.0; `cards`,
`gallery`, `team`, `pricing_table` before that). Additive: a banner with no `anchor_id` renders
exactly as before — no `id` attribute at all, not `id=""`.

## v0.30.0 — two blocks stopped formatting dates in the wrong language

Published 2026-08-24 without an entry here; recorded after the fact from the commit it carried
(#1463), so it is a summary rather than the usual upgrade note. **This one is worth taking**: it
is a user-visible bug on every translated page, not a refactor.

`SectionTeaser` and `Documents` read `Astro.currentLocale` to format their dates. On these sites
that is **always** undefined — core builds the locale trees itself and no site declares Astro's
own i18n config, which is the whole reason `BlockRenderer` grew a `locale` prop at all (#1147).
Eleven components took the prop; these two were missed, so both fell back to the default
locale and rendered e.g. "July 8, 2026" on a Polish page. Both now declare and read `locale?:
string`, which `BlockRenderer` was already handing down.

**If your repo has a hand-written renderer for either block**, check it takes the `locale` prop
rather than reading `Astro.currentLocale` — the same miss is invisible until someone reads a date
on a translated page.

## v0.29.0 — the header and footer are fetched once per build, not once per page

`getPages`, `getBranding`, `getLocales` and `getSiteSettings` are all memoized, because a static
build asks for each of them from every route. `getMenu` and `getFooter` were not — and they back
the two things a layout mounts on **every single page**. So a site whose `Navbar` reads the header
menu and whose footer reads the footer component paid two extra HTTP round-trips per built page,
for two answers that cannot change within a build. Nine pages, eighteen wasted requests; three
hundred pages and three locales, rather more.

Both are memoized now, with the same shape `getPages` already uses: a `Map` keyed by what varies
(`key|locale` for menus, `locale` for the footer), and **a rejected fetch is evicted** so one
transient failure is not then served to every later caller.

That eviction is the whole reason this was not a two-line change. `getFooter` used to swallow
_every_ error into `null`:

```ts
.catch(() => null) // 404 (no active footer) / offline → no footer
```

A 404 and a dropped connection came back indistinguishable, and only one of them is an answer.
Cached as-is, a single hiccup early in a build would have pinned a footerless site — on a German
site, that is every page losing its Impressum link, silently. So the two are now separated:

- **404 → `null`, and cached.** The client has no footer component; that is the CMS answering.
- **anything else → rejects, and is evicted.** The renderer's own `.catch(() => null)` still
  degrades that one page, exactly as before, and the next page retries.

**Nothing changes for a caller that already `.catch`es**, which both in-tree callers
(`core/Footer.astro`, the reference `Navbar.astro`) do — and any client Navbar generated from this
template does too. A caller that awaited `getFooter` _bare_ and relied on `null`-on-network-error
would now see a rejection; grep for `getFooter(` before bumping if yours is hand-written.

`apiFetch` throws a new exported `ApiError` carrying `status`, which is what made the split
possible. The message format (`API 404: /api/…`) is unchanged, so anything matching on it still
matches.

## v0.28.0 — `anchor_id` on rich_content, features and faq

Published 2026-08-23 without an entry here; recorded after the fact from the commits it carried
(#1416), so it is a summary rather than the usual upgrade note.

- **`anchor_id` on `rich_content`, `features` and `faq`** — an editor-supplied `id` on the
  section element, so a table of contents (or any link) can deep-link to that block. Normalized
  through the new `lib/anchor.ts` (`sectionAnchorId`).
- **`reveal` on `rich_content` and `features`** in the generated types, alongside the existing
  `background` / `align` keys.

Additive: a block with no `anchor_id` renders exactly as before.

## v0.27.0 — the consent banner can link to a privacy notice the CMS does not own

`CookieConsent` resolved its privacy link from `settings.cookie_consent.privacy_page_id` and
nothing else. A site whose privacy notice is a hand-written route — `src/pages/datenschutz.astro`,
not a CMS page — had no id to point at, so the banner rendered with no link at all: the one piece
of chrome that exists so a visitor can find out what they are agreeing to.

`CookieConsent` now takes an optional `privacyHref`, a path or absolute URL the project layer
supplies:

```astro
<CookieConsent {locale} privacyHref="/datenschutz" />
```

**The CMS still wins whenever it can answer.** A resolving `privacy_page_id` takes precedence, so
a client-admin picking a privacy page in the panel changes the site even on a repo that passes
this prop, and moving a notice into the CMS later needs no code change. The prop only fills the
gap where no configuration answer exists.

Blank and whitespace-only values from either source are treated as "no answer" rather than
rendering `<a href="">`, which reloads the current page and looks like a working link.

Purely additive: a site that passes nothing behaves exactly as before.

## v0.26.0 — a hidden client's old sitemap is removed, not merely left unwritten

v0.24.0 made the build SKIP the sitemap fetch for a client that is not public yet. That is not
the same as publishing no sitemap: `public/` is a build input that survives between deploys, so a
client which had been visible kept serving the files it was given, from a path no later build
touched. Observed on a live site — `noindex` and the `robots.txt` change had both landed, and
`sitemap-index.xml` still answered 200 with a timestamp from before the change.

The step now deletes its own previous outputs (`sitemap-<code>.xml`) when the client is hidden,
and again before writing a fresh set — which closes the same leak for a locale that gets
disabled, whose file would otherwise linger and stay reachable by anything that guessed the URL.

Only names this script writes are removed; a `sitemap.xml` placed in `public/` by hand is left
alone.

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

| changed                          | what it does when `search_visible` is false                                                                  |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| `core/Seo.astro`                 | every page emits `noindex, nofollow` — a third term beside the `noindex` prop and the per-page `seo.noindex` |
| `core/robots.ts`                 | `robots.txt` drops the `Sitemap:` line                                                                       |
| `core/scripts/fetch-sitemap.mjs` | the build writes no sitemap files at all                                                                     |
| `core/effectiveConfig.ts`        | exposes `searchVisible`, read from `GET /api/site-settings`                                                  |

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

| new in core                | what it is                                                                                                               |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| `deploy.sh` (package root) | the build-onward half of the deploy: build, package the release, verify, the atomic go-live flip, prune, the history log |
| `core/sitePaths.ts`        | `getSitePaths(cmsConfig)` — the whole `getStaticPaths` body of the catch-all route                                       |
| `core/PageDispatch.astro`  | the page-type lookup and render that route's template used to inline                                                     |
| `core/robots.ts`           | the `robots.txt` handler                                                                                                 |
| `core/Seo.astro`           | moved here from the site layer; unchanged otherwise                                                                      |

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

| value              | CMS source                                         |
| ------------------ | -------------------------------------------------- |
| `defaultLocale`    | `GET /api/locales`, the entry flagged `is_default` |
| `seo.siteName`     | `GET /api/site-settings`, `site_name`              |
| `seo.defaultImage` | `GET /api/site-settings`, `default_og_image`       |
| `seo.siteUrl`      | `frontend_url`, ranked under `ASTRO_SITE_URL`      |

### BREAKING — `siteUrl()` is now async

`core/site.ts`'s `siteUrl()` returns `Promise<string | null>`. It gained the CMS's `frontend_url`
as a middle candidate (`ASTRO_SITE_URL` -> `frontend_url` -> `cmsConfig.seo.siteUrl`), because a
test or staging domain is attached in the panel routinely and previously the only way one could
reach a build was a hand-edited repo value that then outlived it.

A client repo owns the two call sites, so **both need `await` at bump time**:

| file                       | un-awaited symptom                  | caught by `astro check`?     |
| -------------------------- | ----------------------------------- | ---------------------------- |
| `src/components/Seo.astro` | `canonicalUrl({ origin: Promise })` | **yes**                      |
| `src/pages/robots.txt.ts`  | `Sitemap: [object Promise]`         | **NO** — a Promise is truthy |

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
