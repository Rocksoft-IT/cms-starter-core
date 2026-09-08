# Porting scripts — what the source says, and whether the port says it yet

Two commands, both shipped from here and both run from the consuming repo through the
`package.json` keys the template already carries:

```json
"parity:source": "node node_modules/@rocksoft/cms-starter-core/scripts/parity-source.mjs",
"parity:audit":  "node node_modules/@rocksoft/cms-starter-core/scripts/parity-audit.mjs"
```

They sit beside the two harnesses in `../tests`, and the four together are one toolkit:

| tool | question | answer |
| --- | --- | --- |
| `parity:source` | **what is it?** | the reference's _authored_ values |
| `test:vrt` | **which** pages differ? | a `% pixels differ` per route, plus a diff PNG |
| `test:measure` | **by what**, on the selectors we named? | a property table per selector, against a committed baseline |
| `parity:audit` | **by what**, anywhere in this section? | both sides walked element by element, plus a screenshot of each |

Neither script here has a baseline or a pass/fail: they are the exploratory half. `../tests/measure`
is what holds a value in place once it is right.

## `parity:source` — what is it

```sh
pnpm parity:source '<selector>' [--page /path/] [--source DIR] [--motion] [--motion-only] [--depth N]

PARITY_SOURCE=../reference-site pnpm parity:source '.empower_component' --motion
```

Serves a **static source** — a Webflow export, a hand-built HTML/CSS prototype, a `wget` mirror —
walks the section, and prints its DOM tree, every declared rule that owns each element beside the
value that element computes to, and (with `--motion`) the Webflow IX2 action lists decoded into
keyframe tables. The source root comes from `--source`, `$PARITY_SOURCE`, or `./reference-site`; it
is not committed, so the path is configuration rather than a default worth guessing at.

**Why it exists at all.** A rendered page — which is what VRT, `tests/measure`, `parity:audit` and
any `getComputedStyle` check read — structurally cannot report three things, and each was guessed
at instead on the port that prompted this:

- **The authored unit.** `inset: 0 8vw 0 auto` measures 115.2px at 1440, and 115.2px is what four
  measuring passes wrote into the stylesheet — correct at exactly one width.
- **A rule that does not apply.** A `min-height: 520px` parked in another breakpoint's media query
  reads like the element's height in the file and computes to `auto` on the page. Copying it made a
  card 275px too tall. The table prints both and marks the dead one `✗`.
- **An interaction that has not run.** IX2 action lists compute to `none` on a page nobody has
  scrolled or hovered. Reconstructed by eye they came out at an eighth of their throw, drifting the
  wrong way, missing the stagger that was the whole character of the reveal.

Read its output in order — DOM, then rules, then motion — and write the mapping down **once**,
before touching any CSS. Re-deriving it per rule is what left three dead generations of one section
in a client's stylesheet, each overriding the next.

## `parity:audit` — is it right yet

```sh
pnpm parity:audit <build-url> <ref-url> <build-selector> [ref-selector] [--shot DIR]

pnpm parity:audit http://localhost:4321/ https://example.com/ '.site-footer' '.footer' --shot .parity
```

Walks one section on the build and the same section on the reference — the root, every text leaf,
every `<img>` — and prints **both** tables, then a positional diff. Both sides are scrolled and
their fonts awaited first, because an unscrolled page reports `height: 0` for anything below the
fold; that is the same trap `../tests/shared/page-prep.js` handles for the harnesses.

- **`--shot` writes `build.png` and `reference.png` and is the first thing to look at.** Every
  measured property can agree while the thing looks wrong: one portrait had the right class and the
  right `border-radius` and still rendered at a third of its size, beside the text instead of above
  it.
- **Both tables are the product; the diff is a convenience.** Positional pairing assumes the two
  trees have the same shape, which a CMS block and a Webflow section do not — our `<label>` wraps
  its input where the export's is a sibling, our card IS the form where the export's card WRAPS
  one. Paired blindly it compares a button against a label, confidently, so a count mismatch is
  printed loudly instead of papered over.
- **Pick roots that are the same THING on both sides**, not the same-looking selector.

It exists because `tests/measure` compares a hand-named list of selectors, so anything nobody
thought to name is invisible to it — and one site kept shipping wrong type in exactly those gaps
(dashboard#1966).

## See also

- `../tests/measure/README.md` — the metric harness: named selectors, a committed baseline,
  `MEASURE_STRICT=1`.
- `../tests/vrt/README.md` — the visual-regression harness.
- The `measure-workflow` and `webflow-parity` skills in a repo's `.claude/skills/`, which carry the
  same map plus where a recovered value belongs once you have it.
