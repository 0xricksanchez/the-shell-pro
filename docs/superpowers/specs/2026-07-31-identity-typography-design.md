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

Self-host both families as `woff2` in `assets/fonts/`, subset to Latin plus the
punctuation the templates use. Both are SIL Open Font License, so redistribution
inside the theme zip is permitted; include the licence files.

- Space Grotesk — weights 500 and 700.
- IBM Plex Sans — weights 400 and 600.

Four files, target **≤ 80 KB total**. For reference, removing the site-wide
asciinema injection recovered 185 KB, so this stays comfortably net-negative.

Declare with `@font-face` and `font-display: swap`. Preload only the display face
(it renders in the article title, above the fold); the text face loads normally.

Subsetting happens once and the output is committed. No build step is introduced
— the theme keeps its "no build, no runtime dependencies" property.

Ghost's own font settings (`--gh-font-body`, `--gh-font-heading`) continue to win
where set, as they do today.

## 2. Token repointing (`assets/css/screen.css`)

```css
--shell-font-display: "Space Grotesk", system-ui, sans-serif;
--shell-font-text:    "IBM Plex Sans", system-ui, sans-serif;
--shell-body:    var(--gh-font-body, var(--shell-font-text));
--shell-heading: var(--gh-font-heading, var(--shell-font-display));
```

The new tokens are named `--shell-font-*` deliberately: `--shell-text` already
exists as a *colour* token (`#d5dce7`), and reusing that name would collide.

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
  existing `clamp()` shape so the reader controls keep working
  (`[data-reader-text="compact"|"large"]` scale `.article-content` font-size).
- Preserve the invariant the preview suite asserts: code font-size ≤ 80% of
  prose font-size, and line-number size exactly equal to code size.

## 5. Palette

Deepen the background so the instrumented chrome has something to sit against,
and reduce the supporting hue count. Today the palette carries accent-green,
cyan, magenta, yellow and danger; that is more hues than the design uses
meaningfully.

- Background: `#111822` → approximately `#080c13`.
- Rebuild the neutral ramp as 4–5 deliberate steps between background and text.
- Keep `--shell-accent` author-controlled and let it carry more of the emphasis.
- Retain one signal hue (amber) for wayfinding — eyebrows, active waypoint.
- Retire or demote whichever of cyan/magenta/yellow does not survive that.

The syntax-highlighting palette is a separate system and is **not** changed.

All text/background pairs must clear WCAG AA (4.5:1 body, 3:1 large). The print
stylesheet's ink-on-paper overrides stay as they are.

## 6. Instrumented chrome

- **Corner ticks** on the article hero and the research map only. Not on code
  blocks: a kernel post carries fifteen, and ticks on each would be noise.
- **Status rail** — folded into the existing breadcrumb row rather than added as
  a new one. That row currently holds breadcrumbs plus the Reader button; it
  gains a right-aligned waypoint counter (`WP 03 / 11`) driven by the scroll-spy
  state the ToC already maintains. This is a redesign of existing chrome, not an
  additional band.

No new navigational affordance is introduced. The site already has a reading
progress meter, breadcrumbs, the research map, back-to-top and reader controls;
the rail must reuse existing state, not duplicate it.

Motion stays as-is. `prefers-reduced-motion` handling is already global.

## 7. Preview-check updates (`scripts/check-preview.mjs`)

- `code typography scales with mobile prose and keeps line numbers aligned`
  asserts `mobile.code / mobile.article <= .8`. Re-verify after the scale
  retune; the ratio should improve, not regress.
- Add an assertion that prose and code resolve to *different* font families —
  this is the whole point of the phase and should not be able to silently
  regress.
- Add an assertion that both webfonts actually load (`document.fonts.check`).

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
