# Task 6, Step 1 — Scoring the four arms against the eight §3 criteria

**This document does not pick a winner.** Step 2 is the owner's judgement. What follows is the
evidence they judge from, plus an explicit account of what it does and does not establish.

Measured 2026-08-03 on branch `feat/research-map-depth`, against the harness at
`http://127.0.0.1:8791` (preflight: `/p/glibc`, `/p/kernel`, `/p/readme` all 200). Fixtures
reconcile with the brief: glibc 46 waypoints / 3 outline roots, kernel 11 / 8, readme 16 / 10.

All geometry read via CDP `Emulation.setDeviceMetricsOverride` at `deviceScaleFactor: 1`, after
navigation settle plus two `requestAnimationFrame` ticks, scrolled to 42% of document height so
some rules are traversed and some are not. Contrast read off **painted pixels** from
full-viewport screenshots, never from token values.

### Correction to a previously recorded limitation

Task 5's captures were logged as having a "~500px CDP width floor", leaving true 390px wrap
behaviour unestablished. **That floor is not real in this environment.**
`Emulation.setDeviceMetricsOverride` honours 390 exactly — measured `window.innerWidth === 390`,
`document.documentElement.clientWidth === 390`. The floor was a property of whatever resize path
Task 5 used, not of the platform. Every mobile figure below is at a **true 390×844 viewport**,
and criterion 7 is therefore established rather than deferred. The sixteen Task 5 `.jpg`
captures remain mislabelled (1440×757 and 500×701) and are superseded by the `.png` captures
listed at the end.

---

## 1. The verdict grid

`P` = pass · `F` = fail · `J` = judgement-required · `P°` = pass, but vacuously (nothing drawn)

| | C1 width/height | C2 no double-count | C3 largest visible | C4 traversal ≠ extent | C5 not texture | C6 contrast ≥3:1 | C7 mobile | C8 spine |
|---|---|---|---|---|---|---|---|---|
| **control** | P | P° | **J** | P° | P° | P° | P | P |
| **all** | P | **F** | **J** | P | **J** | P | P | **J** |
| **all-soft** | P | **F** | **J** | **F** | **J** | **F — DISQUALIFIED** | P | **J** |
| **major-only** | P | P | **J** | P | **J** | P | P | **J** |

**JUDGEMENT-REQUIRED cells: 10** (C3 ×4, C5 ×3, C8 ×3).

Note on the grid's shape: the §3 criteria are written for "the variant chosen", i.e. for the
experimental arms. The control is the baseline the phrase "clearly improves comprehension of
scale" is measured *against*, not a fifth candidate that must independently clear eight bars.
Its `P°` cells are recorded as vacuous rather than as merit, and its C3 cell is left to the
owner rather than scored as a failure, because scoring it `F` would make the plan's own stop
condition unreachable — and the stop condition is explicitly a valid outcome.

---

## 2. Criterion-by-criterion evidence

### C1 — No rail width increase beyond 216px, no row height increase — **PASS, all four arms**

Measured on 3 fixtures × 2 viewports × 4 arms = 24 combinations.

| | value | all combinations |
|---|---|---|
| `.toc` width, desktop 1440×900 | **216.000px** | identical in all 12 desktop combinations |
| `.toc` width, mobile 390×844 | 358.000px | identical in all 12 mobile combinations |
| Row heights vs control | **ordered arrays identical**, max delta **0.000px** | all 24 |
| `scrollWidth − clientWidth` | **0** | all 24 |

Row heights were compared as full **ordered arrays** against the same page/viewport under
`?map=control`, not as sets — a set cannot detect two rows swapping (the deferred Task 3 note).
Zero delta on every row of every combination.

No arm costs anything in geometry. This criterion does not discriminate between arms.

### C2 — Nesting does not imply double-counting — **all/all-soft FAIL, major-only PASS**

`measureSectionExtents()` ends a region at the next heading of the same or higher level, so a
parent's extent **spans its children's**. The invariant holds exactly:

| fixture | Σ extent over outline roots | Σ extent over *painted* rules |
|---|---|---|
| glibc | **1.0000** | `all`/`all-soft` **2.06** · `major-only` **1.00** |
| kernel | **1.0000** | `all`/`all-soft` **1.38** · `major-only` **1.00** |
| readme | **1.0000** | `all`/`all-soft` **1.36–1.38** · `major-only` **1.00** |

On glibc, `all` paints **206% of the article** as rule length. That is the mechanical form of
double-counting, and it is exactly what the plan predicted when it wrote that a parent's extent
spanning its children "is exactly why drawing a rule on parents AND children reads as
double-counting — which is what the arms exist to test."

**The counter-case, stated so the owner can overrule this cell:** the rail never presents a
total. Indentation and the `ol ol` left border already separate parent rows from child rows, and
a reader may simply read each rule as "how big is *this* row", never summing across levels. If
the owner reads criterion 2's "imply" that loosely, `all` passes. The measurement (2.06) is
what is established; the reading of "imply" is not.

### C3 — Largest regions identifiable immediately, without reading labels — **JUDGEMENT-REQUIRED ×4**

This is perceptual. It is not scored here. What follows is objective proxy data and the
side-by-side crops; **the proxies are not a substitute for looking.**

*Proxy A — does the widest rule correspond to the genuinely largest region?*

| fixture | true largest region | `all` widest rule | `major-only` widest rule | `control` |
|---|---|---|---|---|
| glibc | "Patched techniques", extent 0.4891 | same — **correct** | same — **correct** | no rule on any row |
| kernel | "KPTI", extent 0.4227 | same — **correct** | same — **correct** | no rule on any row |

Where a rule *is* drawn, the ranking is truthful on both articles for both surviving arms.

*Proxy B — which sizeable regions get no mark at all?* (rows ≥5% of the article, unmarked)

| fixture | `all` | `major-only` |
|---|---|---|
| glibc | 0 | **4** — Bins 7.9%, House of Mind (Original) 6.7%, House of Orange 6.2%, House of Husk 6.0% |
| kernel | 0 | **3** — Version 3: Probing the mods **25.9%**, Version 1 7.3%, Version 2 5.2% |

On kernel, `major-only` leaves a region worth **a quarter of the article** with no mark. It does
draw KPTI's 42% — but hides that most of that 42% is one child.

*Proxy C — how many rules are discriminable in width from their rail-order neighbours?*

| fixture / arm / viewport | painted | distinct widths (raw) | distinct at 1px quantisation | differ from **both** neighbours ≥2px | max ÷ median |
|---|---|---|---|---|---|
| glibc `all` desktop | 46 | 44 | **14** | **11** | **22.67** |
| glibc `all` mobile | 46 | 44 | 20 | 19 | 21.18 |
| glibc `major-only` desktop | 3 | 3 | 3 | 3 | 1.44 |
| kernel `all` desktop | 11 | 11 | **11** | **9** | 4.12 |
| kernel `major-only` desktop | 8 | 8 | 8 | 6 | 4.05 |
| readme `all` desktop | 16 | 16 | 13 | 9 | 4.16 |

The "44 distinct widths" figure recorded earlier is real but flatters the arm: a 1px-tall rule
antialiases sub-pixel widths, so at whole-device-pixel quantisation glibc's 46 rules deliver
only **14 distinguishable lengths**, and only 11 rules differ from both neighbours by ≥2px.
On kernel every rule is distinct and 9 of 11 clear 2px.

**Evidence for the owner:** `glibc_ARMS-side-by-side_1440x900.png`,
`kernel_ARMS-side-by-side_1440x900.png` (four arms, same scroll position, 2× nearest-neighbour),
and the per-arm 3× crops `{page}_{arm}_rail_1440x900_x3.png`.

### C4 — Traversal remains visually distinguishable from extent — **all/major-only PASS, all-soft FAIL, control P°**

Painted pixels, `--traversed` forced to 0.5 so both states occupy one rule:

| | filled | unfilled | luminance ratio | sRGB distance |
|---|---|---|---|---|
| full-opacity rule (`all`, `major-only`, and `all-soft`'s root rows) | `rgb(220,68,116)` | `rgb(107,130,153)` | **1.03:1** | 134.1 |
| `all-soft` child rows @ .45 | `rgb(108,43,71)`–`rgb(110,47,75)` | `rgb(57,71,88)`–`rgb(59,75,92)` | 1.076–1.081:1 | ~28 |

For normal vision the boundary is unmistakable at an sRGB distance of 134 — `all` and
`major-only` pass. `all-soft` fails: on its dimmed rows neither state clears the UI floor
(see C6), so the question of telling them apart is moot.

**A risk the owner should see, which belongs to the shared rule and not to any one arm.** The
1.03:1 figure means the fill/remainder boundary is carried **almost entirely by hue**, with
essentially no luminance step. Under a Viénot–Brettel–Mollon dichromat approximation (a model,
not a user test):

| | filled | unfilled | sRGB distance | luminance ratio |
|---|---|---|---|---|
| normal | `rgb(220,68,116)` | `rgb(107,130,153)` | 134.1 | 1.03 |
| protanopia | `rgb(115,115,115)` | `rgb(126,126,153)` | **41.1** | 1.20 |
| deuteranopia | `rgb(144,143,110)` | `rgb(125,122,154)` | **52.3** | 1.24 |
| tritanopia | `rgb(218,76,76)` | `rgb(103,133,133)` | 140.4 | 1.03 |

Red–green deficiency cuts the separation to roughly a third. This is not a C6 failure — each
state independently clears 3:1 against its backdrop — and it applies identically to whichever
arm ships. It would be cheap to fix by giving the traversed fill a luminance step as well as a
hue step. Recording it here so the choice is made with it in view.

### C5 — Forty-six rules do not collapse into background texture — **JUDGEMENT-REQUIRED ×3**

Perceptual, not scored. Proxies:

*Width distribution, glibc `all`, desktop 1440×900* (rendered rule widths, 46 rules):

| bucket | ≤1px | 1–2px | 2–4px | 4–8px | 8–16px | 16–32px | >32px |
|---|---|---|---|---|---|---|---|
| count | **3** | 3 | **17** | **15** | 5 | **0** | **3** |

min 1.00 / median 4.01 / max 92.09px. The distribution is **bimodal with an empty middle**:
three bars (92.1, 63.9, 32.3px — the three outline roots), then a 16–32px gap containing
nothing, then 43 marks of which 38 are ≤8px and 23 are ≤4px. Widest non-root rule: "Bins" at
14.2px. Narrowest: Remaindering / Exhausting / Consolidation, all clamped at the **1px floor**.

*Ink budget:*

| fixture / arm | rules | total rule length | mean rule | ink coverage of rail area |
|---|---|---|---|---|
| glibc `all` | 46 | 378px | 8.2px | 0.22% |
| glibc `major-only` | 3 | 188px | 62.8px | 0.11% |
| kernel `all` | 11 | 257px | 23.4px | 0.26% |
| kernel `major-only` | 8 | 188px | 23.5px | 0.19% |

*How much of the rail is even on screen at once* — measured, because it changes the question:

| fixture | viewport | rows visible in `.toc__body` at once | of total |
|---|---|---|---|
| glibc | desktop 1440×900 | **22** | 46 (rail body scrolls internally, `overflow-y: auto`) |
| glibc | mobile 390×844 | **13** | 46 |
| kernel | desktop / mobile | 11 | 11 (fits) |
| readme | desktop | 16 | 16 (fits) |

**A reader never sees 46 rules at once on glibc.** The criterion's literal framing — "forty-six
rules" — does not describe any state the reader occupies. The real question is whether ~22 marks,
of which ~18 are dashes under 8px and 2 are bars, read as information or as speckle. The
side-by-side crops are the evidence; the counts above are not a verdict.

`major-only` on glibc draws 3 rules, so texture is not a risk — but that cell is close to
vacuous, and it is bought at the cost measured in C3 Proxy B.

### C6 — Both rule states ≥3:1 against the colour that actually paints behind them — **all/major-only PASS, all-soft FAIL (disqualifying)**

Read from painted pixels in full-viewport screenshots, not from tokens. Floor is 3:1 (non-text UI).

**Full-opacity rules — PASS everywhere sampled:**

| backdrop (sampled pixel) | context | filled | unfilled |
|---|---|---|---|
| `rgb(17,24,34)` `#111822` | desktop rail | **4.350** | **4.482** |
| `rgb(20,30,42)` `#141e2a` | mobile drawer (`--shell-surface-overlay`) | **4.101** | **4.226** |
| `rgb(34,32,47)` | darkest backdrop sampled (kernel, mobile, highlighted row) | **3.893** | **4.012** |

Desktop figures reproduce Task 4's independently-measured 4.35 / 4.48 exactly.

**`all-soft` — FAILS, disqualified:**

| combination | filled | unfilled |
|---|---|---|
| glibc, desktop, child row @ .45 | **1.761** | **1.761** |
| glibc, mobile, child row @ .45 | **1.726** | **1.858** |
| kernel, desktop, child row @ .45 | **1.882** | **1.882** |
| kernel, mobile, child row @ .45 | **1.739** | **1.879** |

Both states, on both articles, at both viewports, against the colour that actually paints. The
`unfilledSoft ≤ 1.90` ceiling recorded earlier is confirmed (max observed 1.882).

**Clarifying the earlier note "filledSoft clears 3:1 only for the default accent".** That is
correct and now has a mechanism. `screen.css:40` declares `--shell-accent: #35e0a1`, but the
served page overrides it from Ghost's configured accent:

```
--shell-accent: #dc4474;   /* served HTML, /p/glibc */
ghost-accent-color: #dc4474;
```

Under the theme's CSS default `#35e0a1`, `filledSoft` composites to ≈3.08:1 — a bare pass.
Under `#dc4474`, the accent that the live site and the harness actually paint, it is 1.73–1.76:1
— a clear fail. And `unfilledSoft` derives from `--shell-border-contrast: #6b8299`, which does
not depend on the accent at all, so it fails at ~1.88:1 under **either** accent.

**`all-soft` is disqualified on criterion 6 and cannot be selected**, under the accent that
ships and under the theme's own default. Recorded with its evidence rather than dropped.

### C7 — Mobile retains useful information — **PASS, all four arms; the criterion does not discriminate**

At a **true 390×844** viewport, map collapsed by default, expanded via `.toc__toggle` before
every measurement (`expandState: "clicked"`, `expanded: true` confirmed in all 8 combinations):

| fixture / arm | rail width | rows | rules painted | overflow-X | widest rule | spine |
|---|---|---|---|---|---|---|
| glibc control | 358 | 46 | 0 | 0 | — | OFF |
| glibc `all` / `all-soft` | 358 | 46 | 46 | 0 | 152.9px | OFF |
| glibc `major-only` | 358 | 46 | 3 | 0 | 152.9px | OFF |
| kernel control | 358 | 11 | 0 | 0 | — | OFF |
| kernel `all` / `all-soft` | 358 | 11 | 11 | 0 | 135.8px | OFF |
| kernel `major-only` | 358 | 11 | 8 | 0 | 135.8px | OFF |

The wider rail helps the arms: glibc `all` goes from 14 to 20 distinguishable whole-pixel widths
and **zero** rules land on the 1px floor (desktop: 3). The list is single-column at ≤700px
(`screen.css:3972` resets the ≤900px `columns: 2` back to 1), so nothing is squeezed. No arm
introduces horizontal overflow or changes a row height.

**But the criterion's second clause — "without reproducing the whole rail" — is not met by any
arm, including the control.** The shipped mobile drawer already lists all 46 waypoints; that is
pre-existing behaviour no arm touches. So C7 cannot separate the candidates. It is recorded as a
pass in the sense that no arm *regresses* mobile, and flagged as non-discriminating.

`glibc_ARMS-side-by-side_390x844.png`, `kernel_ARMS-side-by-side_390x844.png`.

### C8 — Does the progress spine still earn its place? — **open, JUDGEMENT-REQUIRED ×3**

Treated as an open hypothesis. Both cases below.

Facts established:

- The spine is `background-image` on `.toc`, 1px wide, full rail height, filled top-down to
  `--toc-progress`, written by `setupReadingProgress()` (`shell.js:1707`).
- **It is already off at ≤900px** (`screen.css:3721`, `background-image: none`). Confirmed in all
  12 mobile measurements. So this is a desktop-only question.
- At the sampled position the spine read 36.13% (glibc) / 36.08% (kernel).
- Whole-article progress *is* mathematically recoverable from the rules: Σ(extent × traversed)
  over the outline roots gives 33.79% (glibc) and 34.42% (kernel) against the spine's ~36%. The
  residual is the pre-first-heading run the extent model does not map.
- On glibc only **22 of 46** rows are on screen at once, so the visible rules describe roughly
  half the article at any moment; the spine describes all of it regardless of rail scroll.
- At the sampled position glibc showed 17 rules full / 2 partial / 27 empty.

**The case for removing it.** With `all`, the leading edge of the fill already tells the reader
where they are; the spine restates it one pixel to the left, at lower resolution, in the same
accent colour. That is the over-instrumentation the owner warned against. Removing it would also
**book the chrome-budget payment that no task currently books** — the Task 3 note that Phase 1
"adds a painted element with nothing subtracted, against 'the chrome budget is full; additions
must be paid for by subtraction'". C8 is the only candidate payment in the plan.

**The case for keeping it.** Recovering whole-article progress from the rules means summing
three (glibc) or eight (kernel) weighted bars by eye — the spine states it directly. It also
survives rail scrolling: with 24 of 46 glibc rows off-screen, the rules visible at any moment
cannot express whole-article position, and the spine can. And with `major-only` on glibc there
are only **3** rules on the whole rail, two of them typically off-screen — the spine is then
carrying nearly all of the position signal. Note the "N min left" reading stays either way; it
is whole-article and nothing here duplicates it.

**Evidence:** `glibc_SPINE-on-vs-off_1440x900.png`, `kernel_SPINE-on-vs-off_1440x900.png`. Each
ON/OFF pair is the **same page at the same scroll position** — the spine was switched off in
place between the two shots, `--toc-progress` identical within each pair (glibc 39.86 / 39.78 /
39.74%; kernel 39.71 / 39.81 / 39.59%). Nothing else changed between the two frames of a pair.

---

## 3. Anything unshippable regardless of taste

1. **`all-soft`, criterion 6.** Hard fail on painted pixels — 1.73–1.88:1 on child rows against
   a 3:1 floor, on both articles, at both viewports, under both the served accent `#dc4474` and
   (for the unfilled state) the theme's default `#35e0a1`. Not tuneable without changing the
   .45 opacity, which would make it a different arm. **Cannot be selected.**

2. **Nothing else is unshippable.** No arm widens the rail past 216px, grows any row by any
   amount, or introduces horizontal overflow, in any of 24 measured combinations.

Two items that are *not* disqualifying but should be decided consciously:

3. **The fill/remainder boundary is hue-only** — 1.03:1 luminance, dropping to sRGB distance
   41–52 under a red–green-deficiency model (C4). Belongs to the shared rule, so it follows
   whichever arm ships. A luminance step alongside the hue step would close it cheaply.

4. **The chrome-budget debt is still unbooked.** Phase 1 adds a painted element and subtracts
   nothing. C8 is the only place the plan can pay it. If the spine stays and an arm ships, the
   debt ships with it.

---

## 4. Is the control a defensible outcome on this evidence?

**Yes — and on glibc specifically it is a strong candidate, not a fallback.**

- The control passes or is vacuous on every mechanically checkable criterion. The only thing it
  cannot do is encode extent, which is the thing under test, not an independent defect.
- On glibc, `major-only` differs from the control by **exactly 3 marks on a 46-row rail** — 7%
  of what `all` draws. If the owner judges 3 marks not worth a new painted element plus the
  unbooked chrome-budget debt, the control wins on glibc without any contortion.
- On glibc, `all` delivers 46 marks that resolve to **14 distinguishable whole-pixel lengths**,
  with 38 of 46 rules at ≤8px, 23 at ≤4px, 3 clamped at the 1px floor, and an empty 16–32px
  band separating three bars from 43 dashes. If that scatter reads as speckle rather than scale,
  the control wins there too.
- The stop condition is reachable on this evidence and should not be treated as a consolation.

The honest opposite case: on **kernel**, `all` produces 11 rules with 11 distinct widths, 9 of
them separated from both neighbours by ≥2px, mean length 23.4px, ranking truthful. That is a
clean, legible bar chart, and the control offers nothing comparable. Judged on kernel alone the
control looks weak.

---

## 5. Do the arms disagree between articles?

**Yes, sharply. Averaging them into one winner would be a false result.**

| fixture | rows | `all` paints | `major-only` paints | `major-only` keeps | behaves like |
|---|---|---|---|---|---|
| **glibc** | 46 | 46 | **3** | **7%** of `all`'s marks | ≈ the **control** |
| **kernel** | 11 | 11 | **8** | **73%** | ≈ **`all`** |
| readme | 16 | 16 | 10 | 63% | ≈ `all` |

`major-only` is not one treatment. On the flagship 46-waypoint article it is within 3 marks of
changing nothing; on the 11-waypoint article it is within 3 marks of `all`. Same CSS, opposite
feature, decided entirely by how many outline roots an author happened to write.

`all` disagrees with itself across the two articles just as sharply:

| | glibc | kernel |
|---|---|---|
| rules | 46 | 11 |
| distinct widths at 1px quantisation | **14** | **11** (all of them) |
| separated from both neighbours ≥2px | 11 of 46 | 9 of 11 |
| max ÷ median | **22.67** | **4.12** |
| mean rule length | 8.2px | 23.4px |
| rules ≤8px | **38 of 46** | 2 of 11 |
| rows on screen at once | **22 of 46** | 11 of 11 |

On kernel, `all` is a readable chart. On glibc it is three bars and forty-three dashes, half of
them off-screen at any moment. **The 46-waypoint case and the 11-waypoint case are different
problems, and the evidence does not support a single arm being right for both.**

Consequences the owner may want to weigh, none of which this document decides:

- Ship the control everywhere; record the negative result in §2.2 (stop condition).
- Ship `all` everywhere, accepting the glibc scatter as the price of kernel's clarity.
- Ship `major-only` everywhere, accepting that on the flagship article it is ≈ the control and
  leaves four regions of 6–8% unmarked.
- Anything that varies density by waypoint count is a **new arm**, not one of these four, and is
  not covered by this evidence.

---

## 6. The accessibility question §3 asked Task 6 to answer

§3 requires a statement of which the evidence supports: the rule is **supplementary**, or
relative scale is **load-bearing** and needs a static extent in each link's accessible name.

**The evidence supports the supplementary claim.** On glibc the rule resolves to 14
distinguishable lengths across 46 rows, 38 of which are under 8px, and only 22 rows are visible
at once. A signal that coarse cannot be sole-source for anything; it is an accelerant for a
sighted reader scanning the rail, exactly as §3 argued. On kernel the signal is cleaner (11 of
11 distinct) but still conveys only relative scale that the labels and outline already imply.

Recommendation: keep `aria-hidden`, add nothing to accessible names. If the owner disagrees, the
sentence to argue with is the one §3 named — that the rule is supplementary, not sole-source.

---

## 7. Discrepancies and limits of this evidence

- **Extent values are settle-sensitive**, as flagged for Task 3. This run measured glibc `all`
  desktop at min 1.00 / median 4.01 / max 92.09px; the earlier recorded run gave
  1.00 / 3.67 / 84.75px. Same shape, same 3 rules at the 1px floor, same 44 raw distinct widths;
  median and max differ ~9% with scroll position and lazy-image settle. **No verdict in this
  document depends on that difference.** Treat single-pixel figures as ±10%.
- The CVD figures in C4 are a **model** (Viénot–Brettel–Mollon 1999 dichromat approximation),
  not a user test. They establish that the separation shrinks substantially, not by how much a
  particular reader is affected.
- C3 and C5 are **not scored here and no proxy in this document should be read as scoring them.**
  The proxies bound the problem; the crops are what the judgement is made on.
- Contrast was sampled at one scroll position per combination. The rule is 1px tall and can land
  on a fractional device row, where antialiasing would lower the measured ratio below the
  best-case figures reported. Reported values are the best case the reader ever sees.
- One page-level contrast item is out of scope and pre-existing: the accent `#dc4474` sits at
  4.35:1 against the article background, already carried on master.

---

## 8. Capture inventory (all dimensions verified from PNG headers)

In `captures/`. Dimensions are actual, not nominal.

**Comparison sheets — the primary artefacts for the owner's judgement:**

| file | px | what it shows |
|---|---|---|
| `glibc_ARMS-side-by-side_1440x900.png` | 1932×1736 | 4 arms, glibc desktop, same scroll, rails at 2× |
| `kernel_ARMS-side-by-side_1440x900.png` | 1932×1090 | 4 arms, kernel desktop |
| `glibc_ARMS-side-by-side_390x844.png` | 3068×1732 | 4 arms, glibc, **true 390px**, map expanded |
| `kernel_ARMS-side-by-side_390x844.png` | 3068×1504 | 4 arms, kernel, true 390px, expanded |
| `glibc_SPINE-on-vs-off_1440x900.png` | 2952×1782 | C8. 3 arms × spine ON/OFF, each pair the same page at the same scroll |
| `kernel_SPINE-on-vs-off_1440x900.png` | 2952×1136 | C8, kernel |

**Per-arm crops at 3× (desktop) and 2× (mobile), nearest-neighbour so 1px rules survive scaling:**

- `{glibc,kernel}_{control,all,all-soft,major-only}_rail_1440x900_x3.png` — 672×2364 (glibc),
  672×1395 (kernel). Source region 224×788 / 224×465 CSS px.
- `{glibc,kernel}_{control,all,all-soft,major-only}_map-expanded_390x844_x2.png` — 732×1572
  (glibc), 732×1344 (kernel). **True 390px viewport**, drawer expanded.
- `{glibc,kernel}_{control,all,major-only}_{spine-on,spine-off}_1440x900_x3.png` — 696×2388 /
  696×1419. Superseded for A/B purposes by the two `SPINE-on-vs-off` sheets, which hold scroll
  position constant within each pair; these singles re-navigated per shot.

**Pre-existing, from Task 5 — superseded, do not measure from these:** the sixteen
`{page}_{arm}_{1440x900,390x844}.jpg`. Their filenames overstate; actual images are 1440×757 and
500×701.
