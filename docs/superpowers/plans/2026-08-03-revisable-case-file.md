# Revisable Case File — Roadmap

> **Status:** Phase 1 ran and was rejected — see §2.2. Its task list has been removed rather
> than left behind, because following it would rebuild a feature this project measured and
> declined. What remains is the roadmap: what is settled, what is open, and what blocks what.
> Nothing here is ready to implement without a new plan.

**Goal:** Evolve the shipped theme from a research instrument into a revisable case file —
where observations are captured, claims are scoped, artifacts retain provenance, results are
reproduced, and corrections stay attached to the record.

**Architecture:** Keep the production theme as the chassis. Add structure in two independent
tracks: derived features that need no authoring input (Phase 1, the research map), and
authored features that need a data contract first (Phase 2+). Nothing in the second track is
built before that contract exists.

**Tech Stack:** Ghost 6 Handlebars, one CSS file, one JS file, no build step, no runtime
dependencies. Verification by CDP against the local harness on port 8791.

## Global Constraints

- No new runtime dependencies, no build step, no new files in the shipped theme.
- No new corner ticks, neon treatments, labels or HUD frames. The chrome budget is full;
  additions must be paid for by subtraction.
- WCAG AA: 4.5:1 for text, 3:1 for UI and borders, measured with `getComputedStyle` off the
  element that actually paints — never reasoned from token values.
- The rail must not grow wider than its current 216px.
- `.hbs` edits are invisible on the local harness: it mirrors production HTML and serves only
  the working tree's CSS and JS. Template changes are verified by patching a fixture, never by
  loading a page.
- Three states must be named distinctly in all reporting: **live release**, **current master**,
  **experimental branch**. As of 2026-08-03 the live release matches master on everything
  checked — `screen.css` byte-identical at 109,832 B, six CSS markers spanning `61c22f5`
  through `9e64c27`, `kg-bookmark-card` present in the served JS, and the removed article tag
  eyebrow absent from the served HTML. That is strong evidence of parity, not proof of
  byte-identity across every asset; state what was checked rather than "identical".
- Never ship a field, badge or score with no real data behind it. See §2.1.

---

## 1. What three independent assessments agreed on

Reached by this session's review passes, an independent identity critique, and a competing
design studio working from the same brief. Recorded so it is not relitigated.

1. **Keep the production chassis.** Neither mockup is a replacement theme. The release is the
   only one of the three that is hardened, accessible, responsive and deployed. Evidence: the
   live GLIBC article renders 53,128px desktop and 82,560px mobile with no horizontal overflow.
2. **The mocks are sources of structural inventions, not art direction to adopt wholesale.**
   `.cache/mock-substrate.html` and `mockups/observatory/` remain reference specimens.
3. **Surface style is not the identity; the editorial contract is.** All three visual
   treatments sit in a recognisable contemporary register — navy/neon/mono, warm
   cream/serif/terracotta, and near-black/serif/amber are each a design-generator default.
   Devices become distinctive only when backed by real behaviour.
4. **Material separation is the governing rule.** What the machine produced must look
   materially different from what the author concluded. This is achievable in a dark theme and
   does not require going light.
5. **Continue subtracting genre signals** rather than adding new ones.
6. **The architectural spine** is: corpus → investigation → reasoning path → evidence →
   provenance → revision.
7. **Serif prose is a later experiment, not an assumed upgrade** — and if tested, the type must
   be self-hosted, and tested on complete GLIBC and Kernel articles under real dark-room
   reading, not on a mockup.
8. **Numerical confidence is rejected.** `CONFIDENCE: 0.91` is fake precision without a
   published calibration method. Categorical claim states plus a recheck boundary replace it.

---

## 2. What is missing, and what is genuinely unsettled

### 2.1 The authoring and data contract (blocking for Phase 2+)

**This is the highest-priority unresolved item, and it already has a cautionary precedent in
the repo.**

The theme ships a complete semantic-block system: `researchBlockKind()` at
`assets/js/shell.js:644` classifies seven kinds from authored labels, `enhanceResearchBlocks()`
applies them at runtime, four semantic tones exist as tokens, and ADR-0002 defends the
encoding. Measured adoption:

| Corpus | Blockquotes | Carrying a recognised label | Classifier fires |
| --- | --- | --- | --- |
| `scripts/seed-preview.mjs` (synthetic, written to test the theme) | 5 | Method ×2, Finding ×2, Limitation ×1 | yes |
| Published posts (21 total, 11 containing blockquotes) | 61 | **0** | no |

Corpus-wide counts measured by the reviewing studio; independently confirmed on the subset
this repo mirrors — six of seven fixtures carry no blockquote, `readme.html` carries seven
with no leading `<strong>` label, and two live articles checked at runtime produced zero
research blocks.

**The convention is documented.** `README.md:97` specifies ``Blockquote starting
`> **Method:** …` `` and names all seven recognised labels; `CONTEXT.md:28` defines the result
as the *evidence trail*. An earlier draft of this plan claimed no convention was ever
established — that was wrong.

The accurate diagnosis is therefore narrower and more useful:

> The convention is documented and technically exercised, but has never been adopted or
> retrofitted in production content.

That makes Phase 2's problem **editorial adoption and migration**, not the absence of an input
path. Sixty-one existing blockquotes are the retrofit surface. The contract below still has to
be written, but it inherits a working mechanism and a documented convention rather than
starting from nothing.

**Before any field record, provenance block, revision history or claim state is built, write a
contract answering:**

- Which fields are article-level and which are artifact-level.
- Which are generated automatically, which are authored, which are optional.
- How Ghost stores them (post metadata, custom card, code-injection, or authored convention).
- How the ~21 existing posts behave when the fields are absent — the default must be silence,
  never an empty labelled field.
- How a revision stays attached to the original record.
- Whether claim states live in ordinary blockquotes, custom cards, or structured content.
- **Whether the documented research-block convention gets adopted and the 61 existing
  blockquotes retrofitted, or the taxonomy is retired.** Carrying a documented, working system
  that no published article uses is the same defect as inventing empty fields — it is just a
  defect of adoption rather than of design.

### 2.2 Research-map density — TESTED AND REJECTED

**Resolved 2026-08-03: retain the control and the existing progress spine.** No
extent-and-traversal rule ships. Phase 1's DOM, measurement, styling, density switch and
preview assertions were removed after scoring. The scoring report is preserved as tracked
documentation at `docs/superpowers/evidence/2026-08-03-research-map-density-scoring.md`; the
50 screen captures behind it live in the git-ignored SDD workspace and are NOT durable — decide
whether any are worth committing before that directory is cleaned.

No experimental arm clearly improved comprehension across the two article shapes:

- `all-soft` was disqualified. Against the painted panel backdrop `srgb(17,24,34)`, the
  shipped accent `#dc4474` composites its traversed child rule to `srgb(108,43,71)`, **1.75:1**
  against the 3:1 UI floor; its untraversed child rule is **1.90:1** under every supported
  accent.
- `all` is a clean chart on Kernel, but not on GLIBC. Painting parent spans together with
  their children sums to **2.06 article lengths** on GLIBC and 1.38 on Kernel. On GLIBC, 38
  of 46 marks are at most 8px, 23 are at most 4px, and the 46 rules resolve to 14 whole-pixel
  widths. Even though the scrolling rail shows at most 22 rows, the small marks read as
  punctuation rather than useful scale.
- `major-only` changes meaning with outline shape: it paints 3 of 46 GLIBC rows but 8 of 11
  Kernel rows. On GLIBC it is too close to the control to justify the added mechanism; on
  Kernel it hides a child spanning 25.9% of the article. Density selected by waypoint count
  would be a new, untested arm, not a result established here.

The progress spine stays. With the per-section rules rejected it remains the map's only direct
spatial whole-article progress signal, and unlike row-local rules it remains meaningful while
the GLIBC rail is internally scrolled. The existing "N min left" reading also stays.

**Minutes are cut from Phase 1.** An earlier draft derived per-section minutes as
`totalMinutes × extent`, where extent is a share of *rendered pixel height*. That is not
reading time: a tall screenshot or a long code listing would be credited with minutes it does
not cost to read, and the share itself moves with the reader's text-size control. The draft's
stability test passed only because changing `data-reader-text` never triggered a remeasure, so
it compared stale values against themselves — a vacuous test of a wrong mechanism.

Honest minutes need a reading-weight model: word count, plus an explicit policy for what a
code block, figure or table costs. That is its own piece of work. Until it exists, do not
label vertical screen share as time. Phase 1 tests extent and traversal alone.

### 2.3 Semantic colour exclusivity

Commit `9e64c27` decoupled `--shell-cyan`/`--shell-magenta`/`--shell-yellow` from the
`--shell-tone-*` tokens with deliberately zero visual change. The architectural coupling is
fixed; the visual over-distribution is not. Cyan cannot mean "hypothesis" while it is also the
colour of every `h2`–`h6`.

The fix is subtraction from ambient chrome until a research block's colour becomes
informative — **not** removal of the taxonomy. Blocked behind §2.1: there is no point tuning
exclusivity for a system with no inputs.

The owner has decided heading colours stay as they are. Any change here is a proposal, not a
defect fix.

### 2.4 Mobile hexdumps

Deferred with the artifact work. A hexdump that scrolls horizontally on a phone has lost the
byte-to-ASCII adjacency that is its entire reason for existing. Candidate solutions: eight-byte
rows at narrow widths, a synchronised byte/ASCII toggle, or a scroll surface with an explicit
affordance. Eight-byte rows is favoured because it preserves adjacency rather than trading it
for a control.

### 2.5 Serif prose

A genuine rebrand, not a tweak. Prototype on complete GLIBC and Kernel articles under real
reading conditions before touching production. Type must be self-hosted; the Substrate mock's
reliance on Google Fonts is disqualifying for production.

---

## 3. What comes next — not yet plannable

Ordered, but none of these is written up as tasks because §2.1 blocks all of them.

1. **Authoring contract** (§2.1). Not code. A written contract plus a decision on the existing
   research-block taxonomy.
2. **Field record** — state, environment, scope, revision, waypoints, artifacts, optional
   hazard. Establishes the investigation's operating envelope, at the top of the article. Uses
   the title-block idea to *remove* the breadcrumb/post-type stack redundancy, not to add a
   fourth classification.
3. **Artifact provenance and revision history** — source, hash, hardware, tooling, capture
   method, retrieval date; plus a visible revision log. Chain of custody, at the end.
4. **Claim state and recheck** — `OBSERVED / REPRODUCED / INFERRED / UNVERIFIED / DISPUTED`
   plus `RECHECK: <boundary>`. No numerical confidence.
5. **Homepage as corpus** — a publication-extent strip and a chronological register replacing
   the card feed. Needs keyboard and touch interaction, not hover alone.
6. **Material separation** — widen the gap between prose ground and evidence panels so the
   surface itself says whose voice is speaking. Stays dark.
7. **Mobile hexdumps** (§2.4), with the artifact work.
8. **Serif experiment** (§2.5), last, self-hosted, on full articles.

## 4. Deliberately not doing

- Adopting either mockup wholesale.
- Observatory's third marginalia column — the rail budget is already spent.
- A single amber signal replacing the semantic tones.
- Numerical confidence scores.
- Any decorative byte grid, stamp or classification field without real data behind it.
- Anything that sacrifices reader controls, artifact navigation, accessibility, print
  behaviour or long-article resilience.
