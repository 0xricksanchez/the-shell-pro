# Identity phase 1 — typography, palette, instrumented chrome

Date: 2026-07-31

Status: approved

## Context

The theme's engineering is in good shape after 2.0.13/2.0.14 (code workbench,
research map, reader controls, accessibility). Its visual identity has not kept
pace: near-black plus one accent plus monospace-everything is coherent, but it is
also the default look for the genre, and the Ghost in the Shell influence is
currently nominal.

The largest single weakness is that **prose and machine output are set in the
same face**. Articles run 39–53 minutes; monospace is optimised for column
alignment, not sustained reading, and because code looks like prose the design
cannot distinguish the author's voice from a register dump.

This phase changes that and tightens the surrounding palette and chrome. It does
not add features.

## Decisions (user-approved)

1. **Register: Stand Alone Complex** — procedural and instrumented, over the 1995
   film's atmospheric register or Shirow's marginalia. It fits the vocabulary
   already in the templates (research map, waypoints, artifacts, dispatches).
2. **Three type roles** — a display face, a text face, and monospace reserved for
   code and data.
3. **Display face: Space Grotesk.** Chosen over Chakra Petch (more character but
   loses definition in 9–11px chrome) and IBM Plex Sans Condensed (cleanest, too
   little character). Space Grotesk also handles the site's longest titles best.
4. **Text face: IBM Plex Sans.**
5. **Monospace: the existing system stack, unchanged.** No webfont for code. This
   keeps the added asset budget to two families.
6. **Accent hues: no work required.** `default.hbs:29-30` already maps
   `@site.accent_color` onto `--shell-accent`, so the accent is author-controlled
   from Ghost Admin today. The supporting hues stay hard-coded on purpose — one
   authored accent against a fixed palette is what makes the site look deliberate
   rather than themeable.
7. **No switchable visual register.** A theme that ships two identities has none.
8. **The annotation rail is phase 2** and out of scope here. It depends on an
   authoring convention that does not exist yet, and on content that does not
   exist yet: the published posts contain no author-written asides (the single
   `<aside>` per page is the theme's own `article-toc`).

## 1. Font assets and loading (`assets/fonts/`, `default.hbs`)

Self-host both families as `woff2` in `assets/fonts/`. Both are SIL Open Font
License, so redistribution inside the theme zip is permitted; include the licence
files.

**Measured, superseding earlier estimates in this section.** Both families are
distributed as *variable* fonts, so the whole thing is **two files** rather than
four:

| File | Weight range | Size |
| --- | --- | --- |
| `space-grotesk-var.woff2` | 500–700 | 22,320 B |
| `ibm-plex-sans-var.woff2` | 400–700 | 40,240 B |
| **Total** | | **62,560 B (61 KB)** |

**Correction (2026-08-01):** the weight range above is the `@font-face`
descriptor, not a property of the file. Google serves a byte-identical woff2
for `wght@400..600` and `wght@400..700` — only the CSS descriptor differs. An
earlier review wrongly concluded the vendored file "has no 700 axis end" and
prescribed a re-fetch; widening the descriptor was the whole fix.

Comfortably inside budget, and it gives the retune the full weight range to tune
against instead of two fixed stops.

**Subsetting needs no local tooling.** Google Fonts already serves per-range
woff2 slices; the `latin` slice (`U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC,
U+02C6, U+02DA, U+02DC, U+0304, U+0308, U+0329, U+2000-206F, U+20AC, U+2122,
U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD`) is downloaded once and
committed. No `fonttools`, no build step.

**An audit of all 21 posts replaces this section's earlier speculation.** Prose
outside code blocks contains **no Greek** and **no Latin Extended** whatsoever,
so both ranges are dropped. Mathematical operators amount to five characters
site-wide (`≤`×2, `≈`×2, `∈`×1); they are outside the latin slice and will fall
back to a system face. Five characters across 21 posts does not justify a second
slice per family.

**Iconographic characters are excluded from both webfonts.** Audit of prose
outside code blocks found `▣ ☰ ⌕ ↑ ← → ⇾ ⇿` in use, several of which Space
Grotesk does not contain at any subset. They are pinned to `--shell-font-icon`,
a system stack chosen for symbol coverage. Any operator a face genuinely lacks
(`∈` is doubtful even in IBM Plex Sans) falls back — an accepted case, verified
during implementation rather than discovered in production.

Declare with `@font-face` and `font-display: swap`. Preload only the display face
(it renders in the article title, above the fold); the text face loads normally.

**Metric-matched fallbacks.** `swap` alone would reflow an entire 40-minute
article when the text face arrives, displacing a reader who has already started
scrolling — monospace and IBM Plex Sans have very different widths. Each webfont
therefore gets a paired fallback `@font-face` wrapping a `local()` face with
`size-adjust`, `ascent-override` and `descent-override` tuned so it occupies
almost exactly the same space:

```css
@font-face {
  font-family: "Plex Fallback";
  src: local("Arial");
  size-adjust: 107%;      /* measured, not guessed */
  ascent-override: 95%;
  descent-override: 25%;
}
```

The stack becomes `"IBM Plex Sans", "Plex Fallback", system-ui`. The swap then
changes letterform shape without changing layout. Pure CSS, no build step. The
override percentages must be measured against the actual fallback during
implementation rather than copied from this example.

`font-display: optional` was rejected: it avoids reflow by not using the webfont
at all on first visit, which would mean the identity does not render for a large
share of readers.

Subsetting happens once and the output is committed. No build step is introduced
— the theme keeps its "no build, no runtime dependencies" property.

Ghost's own font settings (`--gh-font-body`, `--gh-font-heading`) are **no longer
consulted** — see §2 and `docs/adr/0001-theme-owns-typography.md`.

## 2. Token repointing (`assets/css/screen.css`)

```css
--shell-font-display: "Space Grotesk", system-ui, sans-serif;
--shell-font-text:    "IBM Plex Sans", system-ui, sans-serif;
--shell-body:    var(--shell-font-text);
--shell-heading: var(--shell-font-display);
```

The new tokens are named `--shell-font-*` deliberately: `--shell-text` already
exists as a *colour* token (`#d5dce7`), and reusing that name would collide.

**The `--gh-font-*` indirection is removed.** Both faces stop being defaults the
theme politely yields on and become identity the theme owns. See
`docs/adr/0001-theme-owns-typography.md`.

Because that removes the only no-code way to change the faces, the README gains
a short **"Changing the fonts"** section: which two tokens to edit, where the
`@font-face` blocks live, that the display face is preloaded in `default.hbs`,
and the warning that the type scale in §4 is tuned to Space Grotesk's metrics so
a substituted face will need the scale retuned with it.

This is the whole of the mechanical change. An audit of all 14 `font-family`
declarations confirms the seams already exist:

- `body` uses `--shell-body` → becomes IBM Plex Sans.
- Four rules use `--shell-heading` (`.article-header h1`, `.error-page h1`,
  `.post-card h2`, `.article-content h2–h6`) → become Space Grotesk.
- Ten rules pin `--shell-mono` explicitly (`.article-content code`, `pre`,
  `.code-line-numbers`, `kbd`, `.shell-code-expand`, `.toc__tab`,
  `.reader-tools__trigger`, `.reader-setting__options button`,
  `.site-footer__pgp`, and one mobile override) → unchanged.

No code surface is touched by the repointing.

## 3. Role assignment pass

Repointing alone leaves chrome that currently *inherits* body mono in the wrong
role. A third pass assigns each surface explicitly:

**To the display face** — eyebrows (`// exploitation`), breadcrumbs, post-type
badges, section labels, code-block headers, research-map title and tab labels,
figure numbers, button labels.

**To monospace** — data that should stay machine-set: article meta and
timestamps, reading-time, waypoint and artifact counters, the PGP fingerprint,
`FIG. NN` numbering.

**To the text face** — prose, decks, figure captions, post-card excerpts,
footer copy, navigation links.

Expect roughly 10–15 new `font-family` declarations. The rule of thumb: if a
reader reads it as language, it is the text face; if it labels or frames, it is
the display face; if it is a value, it is monospace.

## 4. Type scale retune

Every current heading size, `letter-spacing` and `line-height` was tuned against
a monospace face. Space Grotesk is substantially narrower per character, so
existing values will read too small and far too tightly tracked — notably the
`-.045em` on `.article-content h2–h6`.

Retune across the scale:

- Article title, section headings, card titles: re-derive sizes; expect to size
  up relative to today.
- Reset negative tracking to roughly `-.01em` on large display sizes and `0` at
  section-heading sizes.
- Body prose: target ~17px at default with `line-height` ~1.65, preserving the
  existing `clamp()` shape so the reader controls keep working.
- **Article headings become `em`-based**, proportional to `.article-content`, so
  the reader's text-size control scales the whole reading surface rather than
  only its paragraphs. Set the ratios first and let the maximum fall out.
- Preserve the invariant the preview suite asserts: code font-size ≤ 80% of
  prose font-size, and line-number size exactly equal to code size.

**Defect this fixes.** Headings currently use root-relative clamps, so they do
not scale with the reader control and the hierarchy inverts at the Large setting:
at 1440px, body prose renders 18.56px while `h4` is a fixed `1.14rem` = 18.24px —
a heading smaller than the paragraph it introduces. `h3`'s floor (19.5px) is
barely above body. Proportional `em` sizing makes the inversion structurally
impossible rather than something to re-check after every change.

`h3` also carries a hard-coded `#b8f6db` mint green while `h2` inherits cyan from
the group rule; headings should be consistently tokenised.

## 5. Palette

**Correction to an earlier draft:** this section previously called for retiring a
hue. That was wrong. `screen.css:1345-1367` shows the supporting hues are a
semantic encoding on research blocks — cyan for hypothesis/environment/
reproduction, accent for method, magenta for finding, yellow for
limitation/safety. They encode what kind of claim a block makes. The problem is
not hue *count*, it is hue *overloading*.

- Background: `#111822` → approximately `#080c13`. This also lifts link contrast
  from **4.38:1 to 4.77:1**, clearing WCAG AA (see below).
- Rebuild the neutral ramp as 4–5 deliberate steps between background and text.
- Headings keep their colour. Going neutral would leave the page over-white and
  strip the warmth that currently carries the reading surface.
- Remove the ten hard-coded greens (`rgba(53, 224, 161, …)` at lines 149, 255,
  547, 686, 802, 1493, 2290, 2463 and `#63f0ba` at 1126). They assume the theme's
  default accent while the site actually ships `#dc4474`, so the live palette is
  already internally inconsistent — green hover washes and a green progress glow
  against pink links. Every accent-derived value must be computed from
  `--shell-accent` with `color-mix()`.

**Known defect this fixes:** `#dc4474` on `#111822` is 4.38:1, below the 4.5:1
AA threshold, and it is the colour of every link in running prose.

### Three colour families, hard boundaries

The palette is reorganised so that changing one family cannot corrupt another.

**Brand** — `--shell-accent`, author-settable through Ghost as today. Drives
links, buttons, active and selected states, interactive glow. Every derived value
computed with `color-mix()` from the token; no hard-coded accent literals.

**Semantic** — the four research tones plus danger. Fixed by the theme, never
author-settable and **never derived from the accent**. "Method" stops being
`var(--shell-accent)` and gets its own designed hue. See
`docs/adr/0002-brand-colour-and-semantic-colour-are-separate.md`.

**Structural** — background ramp, surfaces, borders, text, muted. Fixed.

The problem this solves is live today: the accent is `#dc4474` (red-pink) while
"finding" is `#e697ff` (light purple), so method and finding blocks are already
harder to distinguish than intended. A purple accent would collapse them
entirely — an author changing their branding would silently break an information
encoding they did not know was attached to it.

### Supported accents

The theme is tuned and verified against a small curated set rather than an
arbitrary colour space. Ghost's picker stays free — so Portal keeps matching the
site — but only these are designed and tested:

| Name | Value | Contrast on `#080c13` |
| --- | --- | --- |
| Signal green | `#35e0a1` | passes (theme default) |
| Alert red | `#dc4474` | 4.77:1 — passes, currently 4.38:1 and failing |
| Ice blue | `#57b6ff` | ≈ 9:1 |
| Amber | `#ff9448` | ≈ 8.9:1 |

Values for ice blue and amber are proposals carried over from the approved
mockup; all four must be re-measured against the final background during
implementation, since the background value itself is still approximate.

The raw token is used directly for text: the four are designed so that
unmodified they clear AA for prose links. There is deliberately **no**
contrast-floor transformation between the picker and the rendered link colour —
what the author picks is what renders.

This does not conflict with the "no hard-coded accent literals" rule above. That
rule concerns *derived* surfaces — hover washes, tints, glows — which must be
computed from the token with `color-mix()` so they follow the accent instead of
drifting green. What is ruled out here is a transformation applied to the accent
*as text colour*.

Off-list accents are unsupported and may look bad; that is an accepted trade-off,
not a bug.

Enforcement lives in the test suite, not the admin UI: the preview checks assert
that every supported accent clears AA.

The syntax-highlighting palette is a separate system and is **not** changed.

All text/background pairs must clear WCAG AA (4.5:1 body, 3:1 large). The print
stylesheet's ink-on-paper overrides stay as they are.

### Light mode is out of scope

Not deferred — declined. The register is darkness: corner ticks, deep surfaces,
interactive glow and syntax colours tuned for a near-black ground. A light
variant would be a second design sharing a layout, not a recolour, and would cost
roughly what the rest of this phase costs while doubling the QA surface.

### High-contrast mode becomes real

`[data-reader-contrast="high"]` is currently three rules (`screen.css:1117-1128`):
body colour, `strong` colour, link colour. That is a stub. It absorbs the
eye-comfort need that light mode would otherwise serve, and gains: stronger
border colours, brighter muted text, higher code-surface contrast, and a link
treatment derived from the accent rather than the hard-coded `#63f0ba`.

## 6. Instrumented chrome

- **Corner ticks** on the **feature image** and the research map panel only.
  "Hero" was ambiguous in an earlier draft: ticks bracket a rectangular panel and
  read as a framing device, so they belong on the image (every post has one) and
  on the map, not around the article header's text block. Not on code blocks
  either — a kernel post carries fifteen, and ticks on each would be noise.
- **No status rail, and no position indicator in the breadcrumb row.** Both were
  considered and cut. The word `rail` is already taken by `site-footer__rail`,
  and a third "where am I" indicator alongside the research map and the progress
  meter fails its own test. Corner ticks carry the instrumented feel alone.

### Reading progress moves into the research map

The fixed 2px viewport bar (`.reading-progress`, `default.hbs:36`) is **deleted**.
It is already `aria-hidden="true"` and `pointer-events: none` — the theme
classifies it as decoration — and it has no preview-suite coverage, so nothing
holds it in place.

Progress becomes a property of the research map, which is already the component
that answers "where am I":

- **Progress spine.** The map's existing `border-left` fills with the accent in
  proportion to reading position. No new element.
- **Time remaining.** The map header's `11 waypoints` line switches to remaining
  reading time once scrolling begins — `18 min left`. Computed as total read
  time × (1 − scroll ratio) and rounded to the minute, so it changes about twice
  a minute rather than on every scroll event. This reuses vocabulary the site
  already speaks ("39 min read") and answers a question a percentage bar cannot.

On mobile the map is collapsed, so the spine is omitted there; the header line
still shows time remaining when the map is open.

Net effect: one viewport-level element removed, no new components, and one piece
of genuinely new information for readers of 40-minute articles.

Motion stays as-is. `prefers-reduced-motion` handling is already global.

## 7. Preview-check updates (`scripts/check-preview.mjs`)

- `code typography scales with mobile prose and keeps line numbers aligned`
  asserts `mobile.code / mobile.article <= .8`. Re-verify after the scale
  retune; the ratio should improve, not regress.
- Add an assertion that prose and code resolve to *different* font families —
  this is the whole point of the phase and should not be able to silently
  regress.
- Add an assertion that both webfonts actually load (`document.fonts.check`).
- **Heading hierarchy never inverts.** Assert `h4 > body` font-size at every
  reader text-size setting, which is the defect §4 fixes.
- **Every supported accent clears AA.** Drive `--shell-accent` through each of
  the four values and assert the computed link colour against the article
  background. This is where accent curation is enforced.
- **No accent literals survive.** Assert the stylesheet contains no
  `rgba(53, 224, 161` or `#63f0ba`, so the greens cannot creep back.
- **Iconographic characters render.** Assert the brand mark, menu and search
  glyphs have non-zero width and are not falling back to tofu.

## Out of scope

- The annotation rail (phase 2).
- Any switchable visual register or second skin.
- The syntax-highlighting palette.
- A monospace webfont.
- The SEO/indexing work tracked in `.scratch/seo-indexing/`.
- The stray page-level code injection and the Ghost search overlay's light theme
  — both are Ghost-side, not theme code.

## Verification

1. `npm run check:preview` against a preview instance running this build.
2. Live pass at 500 / 900 / 1280 / 1440 px on: home, a long post with code
   (`dabbling-with-linux-kernel-exploitation…`), a post with tables and figures
   (`overview-of-glibc-heap-exploitation-techniques`), a tag archive, About, 404.
3. Confirm no horizontal overflow at any width and no heading/chrome collisions.
4. Confirm the reader controls still scale prose, and that focus rings, skip
   link and lightbox behaviour are unaffected.
5. Confirm print output still renders ink-on-paper with readable syntax.
6. Measure transferred font bytes against the ≤ 80 KB budget.

## Risks

- **Scale retune is the bulk of the work**, not the token swap. Mono-tuned sizes
  and tracking will look wrong immediately; budget iteration time.
- **FOUT** on the display face if preload is missed — the title is above the
  fold and will visibly reflow.
- **Palette contrast regressions** are easy to introduce while deepening the
  background. Check every pair, including muted text on raised surfaces.
