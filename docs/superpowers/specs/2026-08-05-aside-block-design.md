# Aside blocks — a callout for `> **Note**`

**Date:** 2026-08-05
**Status:** Approved. Tone and box treatment chosen from a rendered three-way
comparison in the visual brainstorm companion (session
`.superpowers/brainstorm/31420-1785937020/content/note-tone.html`, option B).

## Context

`researchBlockKind()` (`assets/js/shell.js:644`) maps a blockquote's leading
`<strong>` to one of seven evidence kinds. Anything it doesn't recognise —
including `Note`, which the author reaches for often — falls through to the
plain blockquote at `assets/css/screen.css:1642`: a magenta left bar, no box, no
tone, and the bold "Note:" left sitting inline in the prose. Every other
recognised keyword gets a titled, tinted panel, so a Note reads as the one
callout the theme forgot.

The obvious fix — an eighth entry in `researchBlockKind()` — was rejected. A
research block's colour encodes *what kind of claim a passage makes*, and
ADR-0002 exists to keep that encoding intact. `CONTEXT.md` reinforces it from the
vocabulary side: **Evidence trail** is defined as the blocks recording *how a
result was reached*, and its `_Avoid_` line names "notes" explicitly. A remark in
passing is not evidence, and giving it a research tone would make the coloured
box stop meaning anything in particular.

So asides become their own small family that borrows the research block's
machinery without joining its encoding.

## Decisions (user-approved)

- A `.aside-block` family beside `.research-block`, not an eighth research kind
  and not a generalised `.callout` refactor of both.
- One aside kind covering `note`, `aside`, `info`, `tip`, `remark` — matching how
  the existing kinds already group synonyms.
- Tone `#9fb3c8`, a desaturated slate: distinguished from the four evidence hues
  along the *chroma* axis rather than by claiming a fifth hue.
- Full research-block geometry (`.22rem` left bar, 7% fill), not a lighter
  hairline variant.
- No corner ticks — see §4.

## 1. Vocabulary (`CONTEXT.md`)

`docs/agents/domain.md` requires that a missing concept be surfaced rather than
introduced silently, and `CONTEXT.md` has no term for a non-evidence callout. Add
to the **Reading surface** section, after **Evidence trail**:

> **Aside**:
> A short authorial remark set off from the prose — context, a caveat in passing,
> a pointer to something adjacent. Distinct from the evidence trail: an aside
> records nothing about how a result was reached, and carries no colour encoding
> beyond "this is not the argument".
> _Avoid_: note block, callout, admonition

## 2. Token (`assets/css/screen.css`)

One entry in the semantic family (currently `screen.css:83-87`):

```css
--shell-tone-aside: #9fb3c8;
```

It belongs with the semantic tones, not the palette, for the ADR-0002 reason: a
tone derived from `--shell-accent` could slide onto one of the four evidence hues
when the author changes branding. The accompanying comment should record that
this is deliberately *not* a fifth encoding colour — it is the low-chroma absence
of one, which is what lets a reader tell an aside from a claim at a glance.

Measured against the block's own fill (`color-mix(#9fb3c8 7%, #18222f)` =
`#212c3a`): the label at `#9fb3c8` is 6.36:1, body text at `#c7d4e3` is 9.09:1.
Both clear WCAG AA for small text.

## 3. CSS (`assets/css/screen.css`, after the research-block rules ~1730)

`.aside-block` shares the research block's geometry through a selector list
rather than a copied rule — same padding, same `1px` border at 45% tone, same
`.22rem` left bar, same 7% fill, same uppercase `::before` label, same
`p:last-child` margin reset, same suppression of the source `<strong>`.

Two constraints on how that sharing is written:

- The `--research-tone` default at `screen.css:1674` sits at one class of
  specificity for the reason its comment documents. Any shared rule must not
  reintroduce the specificity inversion that comment describes — an
  `.aside-block` tone declared at higher specificity than the research modifiers
  would recreate exactly the bug that was fixed there.
- The label attribute stays separate: `data-aside-label` alongside the existing
  `data-research-label`, with one `::before` `content` declaration each.
  Collapsing both onto a single generic attribute would re-couple two families we
  just deliberately split, and would imply the unified callout system that was
  considered and turned down.

One aside kind means the tone sits directly on `.aside-block`; there is no
`--note` modifier class.

## 4. Corner ticks: research blocks only

The comment at `screen.css:2509` defines corner ticks as a framing device for
*panels a reader might navigate to*, lists exactly which elements qualify, and
ends by asking that anything new be justified against that test first.

An aside fails it. It carries no artifact number, and `createArticleModel()`
(`shell.js:724-742`) does not index it — a reader can't navigate to one, because
it never appears in the research map. So `.research-block::after`
(`screen.css:2578`) stays research-only, and the tick comment's element list
needs no amendment.

This is the single intentional deviation from "identical to a research block",
and it matches what was approved: the rendered comparison showed the box without
ticks.

## 5. JS (`assets/js/shell.js`)

- `researchBlockKind()` (`:644`) is untouched — its seven kinds keep their exact
  current behaviour.
- A sibling predicate `isAsideLabel(label)` matches the aside synonyms
  (`/(note|aside|info|tip|remark)/`), normalised the same way
  `researchBlockKind()` normalises its input.
- Evidence classification runs **first**; the aside test is the fallback. None of
  the five aside words matches any of the seven research regexes today, so the
  ordering changes nothing now — it is there so that a future research keyword
  can never be shadowed by an aside synonym.
- `enhanceResearchBlocks()` (`:656`) is renamed `enhanceBlockquotes()`. It now
  sorts blockquotes into two families, and the current name would misdescribe
  that. Its call site is updated with it.
- Unrecognised labels still fall through to the plain blockquote, unchanged.

## 6. Print (`assets/css/screen.css`)

`.aside-block` joins `.research-block` in the `break-inside: avoid` list at
`screen.css:4161`. It needs no entry in the tick-suppression list at
`screen.css:4060`, having no `::after`.

## 7. Verification

`check-preview.mjs` currently asserts nothing about blockquotes — there is no
existing coverage of the research-block machinery to extend, so this adds it.

- `seed-preview.mjs`: add a `<blockquote><strong>Note:</strong>…</blockquote>` to
  a seeded post. A `Finding` block already exists at `seed-preview.mjs:408`.
- `check-preview.mjs`, new checks:
  - the Note blockquote carries `.aside-block`, has `data-aside-label="Note"`,
    and its source `<strong>` is not visible in the rendered prose;
  - it does **not** carry `.research-block`, and does not appear among the
    research map's artifacts;
  - the existing `Finding` blockquote still resolves to
    `.research-block--finding` — this guards the geometry now shared between the
    two families;
  - computed left-border colour on the aside resolves to the aside tone, not to
    a research tone (catches the specificity inversion §3 warns about).
- Full `npm run check:preview` green.
- Manual pass: a post with an aside and a research block in the same viewport, at
  1440 and 390, plus one print preview.

## Out of scope

No `Warning`/`Caution`/`Danger` kind — `--shell-danger` stays unused by blocks.
No changes to the seven research kinds or their tones. No reader-contrast or
focus-mode override for asides; they inherit whatever `.article-content` does.
