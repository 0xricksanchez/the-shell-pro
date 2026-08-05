# The Shell Pro

A Ghost 6 theme for long-form security research. The vocabulary below is the
language the theme speaks to its readers — in UI copy, in design discussion, and
in code. Where code currently disagrees, that is noted so it can converge rather
than drift further.

## Language

### Reading surface

**Research map**:
The per-article navigation panel listing the article's structure and its
figures. Sticky beside the prose on desktop, collapsible above it on mobile.
_Avoid_: table of contents, TOC, sidebar
_Code divergence_: implemented as `.toc` / `.toc__*` in CSS and JS.

**Waypoint**:
One entry in the research map's outline — a heading in the article, at any
depth. The count shown to readers is "N waypoints".
_Avoid_: heading link, anchor, TOC item

**Artifact**:
One entry in the research map's second tab — a figure, code listing, table or
evidence block that a reader might navigate to directly rather than read past.
_Avoid_: asset, media, attachment

**Evidence trail**:
The sequence of research blocks within an article (hypothesis, method,
finding, limitation, and so on) that record how a result was reached.
_Avoid_: methodology section, notes

**Aside**:
A short authorial remark set off from the prose — context, a caveat in
passing, a pointer to something adjacent. Distinct from the evidence trail: an
aside records nothing about how a result was reached, and carries no colour
encoding beyond "this is not the argument". It shares the research block's box
but never its corner ticks, and never appears in the research map.
_Avoid_: note block, callout, admonition

**Reader controls**:
The reader's own presentation preferences — text size, reading width, contrast,
focus mode — persisted across articles. Distinct from anything the author sets.
_Avoid_: settings, preferences panel, a11y menu

**Code workbench**:
The enhanced presentation around a code listing: its header naming the language
and any filename, line numbers, collapse, wrap and copy.
_Avoid_: code card, snippet widget

### Type roles

The theme assigns one of three typefaces to every piece of text. The test is
what the reader *does* with it, not what it contains.

**Scanned**:
Text the eye lands on to orient before reading — titles, headings, eyebrows,
breadcrumbs, tab names, badges, interface hints. Set in the display face.
_Avoid_: headings (too narrow — breadcrumbs and badges are scanned too)

**Read**:
Text consumed as sentences in reading order — body prose, decks, figure
captions, post excerpts, footer copy. Set in the text face.
_Avoid_: body copy, content

**Parsed**:
Text where individual characters carry meaning, such that a one-character
difference changes what it means — code, line numbers, hex, filenames,
timestamps, counts, fingerprints, the author handle. Set in monospace.
_Avoid_: data, code, technical text

**Iconographic**:
A single character used as a symbol rather than as language — the brand mark
`▣`, the menu `☰`, search `⌕`. Nobody reads these; they are recognised. Pinned
to a system stack chosen for symbol coverage so they cannot fall back to tofu.

Directional arrows are deliberately **not** iconographic. An arrow almost always
sits beside a label, and there it behaves as type: it has to share that label's
baseline, cap centre and advance, which only its own face can guarantee. They
are carried in the subset and inherit whichever role their label takes. Treating
them as iconographic is what once put every arrow in the chrome .22em low.
_Avoid_: icon, glyph (both also describe SVG iconography, which this is not)

### Publication

**Dispatch**:
A published post, in the site's own voice. "Latest dispatches" is the homepage
feed.
_Avoid_: article (fine in code and prose, but the reader-facing term is dispatch)

**Transmission**:
The site's publishing activity as a whole — "last transmission" marks the most
recent dispatch.
_Avoid_: update, post activity
