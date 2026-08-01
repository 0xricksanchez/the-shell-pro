# Identity Phase 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the theme an authored visual identity — a display face, a text face, monospace demoted to code and data — and fix the four live defects that work uncovers.

**Architecture:** Two self-hosted variable webfonts declared in `screen.css`, wired through two new `--shell-font-*` tokens. Existing seams do most of the work: `body` already uses `--shell-body` and four heading rules already use `--shell-heading`, while ten rules pin `--shell-mono` explicitly and must not change. A third pass then assigns chrome and data surfaces explicitly, the heading scale converts to `em`, and the palette splits into brand / semantic / structural families.

**Tech Stack:** Ghost 6 Handlebars theme. One CSS file (`assets/css/screen.css`, ~3200 lines), one JS file (`assets/js/shell.js`, ~1560 lines), no build step, no runtime dependencies. Tests are `scripts/check-preview.mjs`, a CDP-driven headless-Chrome suite run with `npm run check:preview`.

## Global Constraints

- **No build step, no runtime dependencies.** Font files are downloaded once and committed. Never add a package.json dependency.
- **Ghost ≥ 6.0.0, Node ≥ 22.12** (`package.json` engines) — do not change.
- **Monospace is the existing system stack, unchanged.** Never introduce a monospace webfont.
- **These ten rules must keep `var(--shell-mono)` and must not be touched:** `.article-content code`, `.article-content pre`, `.article-content .code-line-numbers`, `.article-content kbd`, `.shell-code-expand`, `.toc__tab`, `.reader-tools__trigger`, `.reader-setting__options button`, `.site-footer__pgp`, and the `@media (max-width: 900px)` override at `screen.css:2892`.
- **Type role vocabulary** (from `CONTEXT.md`) — use these words in comments and commit messages: *scanned* (display face), *read* (text face), *parsed* (monospace), *iconographic* (system symbol stack).
- **WCAG AA everywhere:** 4.5:1 for body text, 3:1 for large text.
- **The syntax-highlighting palette is out of scope.** Do not modify `.hljs-*` rules.
- **The annotation rail is phase 2.** Do not build it.
- Commit after every task. Never use `git add -A`; stage named paths only.

---

## File Structure

| File | Responsibility in this plan |
| --- | --- |
| `assets/fonts/space-grotesk-var.woff2` | New. Display face, variable 500–700, latin slice. |
| `assets/fonts/ibm-plex-sans-var.woff2` | New. Text face, variable 400–600, latin slice. |
| `assets/fonts/OFL-*.txt` | New. SIL Open Font Licence texts for both families. |
| `assets/css/screen.css` | All `@font-face`, token, role-assignment, scale and palette work. |
| `default.hbs` | Font preload link; removal of the Ghost accent `<style>` block is **not** in scope. |
| `README.md` | New "Changing the fonts" section. |
| `scripts/check-preview.mjs` | Five new assertions. |
| `package.json` | Version bump only, in the final task. |

---

### Task 1: Vendor the two variable fonts

**Files:**
- Create: `assets/fonts/space-grotesk-var.woff2`
- Create: `assets/fonts/ibm-plex-sans-var.woff2`
- Create: `assets/fonts/OFL-space-grotesk.txt`
- Create: `assets/fonts/OFL-ibm-plex-sans.txt`

**Interfaces:**
- Consumes: nothing.
- Produces: two font files at the paths above. Task 2 references them via `url("../fonts/space-grotesk-var.woff2")` and `url("../fonts/ibm-plex-sans-var.woff2")`.

- [ ] **Step 1: Download the latin slice of each variable font**

Google Fonts serves pre-subset woff2 per unicode-range. We want only the `latin`
slice — the one whose `unicode-range` begins `U+0000-00FF`. A browser User-Agent
is required or the API returns TTF instead of woff2.

```bash
cd /Users/krah/Git/private/the-shell-pro
mkdir -p assets/fonts
python3 - <<'PY'
import urllib.request, re
UA={'User-Agent':'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36'}
jobs=[('Space+Grotesk:wght@500..700','assets/fonts/space-grotesk-var.woff2'),
      ('IBM+Plex+Sans:wght@400..600','assets/fonts/ibm-plex-sans-var.woff2')]
for fam,out in jobs:
    r=urllib.request.Request(f'https://fonts.googleapis.com/css2?family={fam}&display=swap',headers=UA)
    css=urllib.request.urlopen(r,timeout=30).read().decode()
    for block in re.findall(r'@font-face\s*\{(.*?)\}', css, re.S):
        ur=re.search(r'unicode-range:\s*([^;]+)',block)
        src=re.search(r'url\((https://[^)]+\.woff2)\)',block)
        if ur and src and ur.group(1).strip().startswith('U+0000-00FF'):
            data=urllib.request.urlopen(urllib.request.Request(src.group(1),headers=UA),timeout=30).read()
            open(out,'wb').write(data)
            print(f'{out}: {len(data):,} bytes')
            break
PY
```

Expected output:
```
assets/fonts/space-grotesk-var.woff2: 22,320 bytes
assets/fonts/ibm-plex-sans-var.woff2: 40,240 bytes
```

- [ ] **Step 2: Verify the files are real woff2 and within budget**

```bash
cd /Users/krah/Git/private/the-shell-pro
for f in assets/fonts/*-var.woff2; do
  printf "%s  magic=%s  bytes=%s\n" "$f" "$(head -c 4 "$f" | xxd -p)" "$(wc -c < "$f" | tr -d ' ')"
done
cat assets/fonts/*-var.woff2 | wc -c
```

Expected: magic is `774f4632` (`wOF2`) for both, total under `100000`.
If magic is `00010000` you received a TTF — the User-Agent was wrong; redo Step 1.

- [ ] **Step 3: Add the licence files**

Both families are SIL Open Font License 1.1, which permits redistribution inside
the theme zip but requires the licence to travel with the fonts.

```bash
cd /Users/krah/Git/private/the-shell-pro
curl -sL -o assets/fonts/OFL-space-grotesk.txt \
  https://raw.githubusercontent.com/floriankarsten/space-grotesk/master/OFL.txt
curl -sL -o assets/fonts/OFL-ibm-plex-sans.txt \
  https://raw.githubusercontent.com/IBM/plex/master/LICENSE.txt
head -1 assets/fonts/OFL-space-grotesk.txt
head -1 assets/fonts/OFL-ibm-plex-sans.txt
```

Expected: both files non-empty and mentioning the licence. If either 404s, write
the file by hand containing the SIL OFL 1.1 text and the family's copyright line;
do not skip this step.

- [ ] **Step 4: Commit**

```bash
cd /Users/krah/Git/private/the-shell-pro
git add assets/fonts/space-grotesk-var.woff2 assets/fonts/ibm-plex-sans-var.woff2 \
        assets/fonts/OFL-space-grotesk.txt assets/fonts/OFL-ibm-plex-sans.txt
git commit -m "Vendor Space Grotesk and IBM Plex Sans variable webfonts

Latin slice only, taken from Google's pre-subset woff2 so no local
subsetting tooling is needed. 61 KB for both files combined."
```

---

### Task 2: Declare the faces and repoint the tokens

This is the task where the whole site changes appearance. It will look wrong at
the end of it — headings will be mis-sized and mis-tracked because the existing
scale was tuned for monospace. Task 4 fixes that. Do not attempt to fix it here.

**Files:**
- Modify: `assets/css/screen.css` (`:root` block at lines 1–30; new `@font-face` block near the top of the file)
- Modify: `default.hbs` (preload link in `<head>`)

**Interfaces:**
- Consumes: font files from Task 1.
- Produces: CSS custom properties `--shell-font-display`, `--shell-font-text`, `--shell-font-icon`, and the repointed `--shell-body` / `--shell-heading`. Tasks 3, 4 and 5 all reference these names.

- [ ] **Step 1: Add a failing assertion that prose and code use different faces**

Add to `scripts/check-preview.mjs`. Find `async function inspectAccessibilityTree()`
and insert this new function immediately *before* it:

```javascript
async function inspectTypeRoles() {
    await navigate('/tracing-the-edge-200ms-feedback-loop/');
    const roles = await evaluate(`(async () => {
        await document.fonts.ready;
        const family = (el) => el ? getComputedStyle(el).fontFamily : '';
        const prose = document.querySelector('.article-content p');
        const code = document.querySelector('.shell-code-block pre');
        const heading = document.querySelector('.article-content h2');
        return {
            prose: family(prose),
            code: family(code),
            heading: family(heading),
            displayLoaded: document.fonts.check('700 1rem "Space Grotesk"'),
            textLoaded: document.fonts.check('400 1rem "IBM Plex Sans"')
        };
    })()`);
    check(
        /Space Grotesk/.test(roles.heading)
            && /IBM Plex Sans/.test(roles.prose)
            && !/IBM Plex Sans|Space Grotesk/.test(roles.code)
            && roles.displayLoaded
            && roles.textLoaded,
        'prose, headings and code resolve to three distinct typefaces',
        JSON.stringify(roles)
    );
}
```

Then register it. Find the list of `await inspect…()` calls in the main runner
and add `await inspectTypeRoles();` immediately before `await inspectAccessibilityTree();`.

- [ ] **Step 2: Run it and watch it fail**

```bash
cd /Users/krah/Git/private/the-shell-pro
npm run check:preview 2>&1 | grep -E "three distinct typefaces"
```

Expected: `FAIL  prose, headings and code resolve to three distinct typefaces`
with all three families reporting the monospace stack.

Note: the suite runs against `http://localhost:2369`, a **separate preview Ghost**
from production. If it is unreachable, set `GHOST_PREVIEW_URL`. If it is running
an older theme build, these assertions test that build — see Task 9.

- [ ] **Step 3: Declare the faces**

Insert immediately after the closing `}` of the `:root` block (currently around
line 30, right before the `*, *::before, *::after` reset):

```css
/*
 * Identity faces. Both are variable fonts carrying their full weight range in a
 * single file, latin slice only. Iconographic characters (▣ ☰ ⌕ ← → ⇾) are NOT
 * in these files and must never be set in them — see --shell-font-icon.
 */
@font-face {
    font-family: "Space Grotesk";
    src: url("../fonts/space-grotesk-var.woff2") format("woff2");
    font-weight: 500 700;
    font-style: normal;
    font-display: swap;
}

@font-face {
    font-family: "IBM Plex Sans";
    src: url("../fonts/ibm-plex-sans-var.woff2") format("woff2");
    font-weight: 400 600;
    font-style: normal;
    font-display: swap;
}

/*
 * Metric-matched fallbacks. Without these, `swap` reflows an entire 40-minute
 * article when the real face arrives and displaces a reader mid-scroll. These
 * overrides make the fallback occupy near-identical space, so the swap changes
 * letterform shape without changing layout. Values are measured in Task 3.
 */
@font-face {
    font-family: "Space Grotesk Fallback";
    src: local("Helvetica Neue"), local("Arial");
    size-adjust: 100%;
    ascent-override: 100%;
    descent-override: 100%;
}

@font-face {
    font-family: "Plex Fallback";
    src: local("Helvetica Neue"), local("Arial");
    size-adjust: 100%;
    ascent-override: 100%;
    descent-override: 100%;
}
```

- [ ] **Step 4: Repoint the tokens**

In the `:root` block, replace these two lines:

```css
    --shell-body: var(--gh-font-body, var(--shell-mono));
    --shell-heading: var(--gh-font-heading, var(--shell-mono));
```

with:

```css
    /*
     * The theme owns its typography; Ghost's Design & branding font settings are
     * deliberately not consulted. See docs/adr/0001-theme-owns-typography.md.
     */
    --shell-font-display: "Space Grotesk", "Space Grotesk Fallback", system-ui, sans-serif;
    --shell-font-text: "IBM Plex Sans", "Plex Fallback", system-ui, sans-serif;
    --shell-font-icon: "Apple Symbols", "Segoe UI Symbol", "Noto Sans Symbols 2", system-ui, sans-serif;
    --shell-body: var(--shell-font-text);
    --shell-heading: var(--shell-font-display);
```

Note `--shell-font-*` naming: `--shell-text` is already a *colour* token and
must not be shadowed.

- [ ] **Step 5: Preload the display face**

In `default.hbs`, find the `{{ghost_head}}` line. Insert immediately **before** it:

```hbs
    <link rel="preload" href="{{asset "fonts/space-grotesk-var.woff2"}}" as="font" type="font/woff2" crossorigin>
```

Only the display face is preloaded — it renders in the article title above the
fold. The text face is needed below the fold and loads normally.

- [ ] **Step 6: Run the assertion and watch it pass**

```bash
cd /Users/krah/Git/private/the-shell-pro
npm run check:preview 2>&1 | grep -E "three distinct typefaces"
```

Expected: `PASS  prose, headings and code resolve to three distinct typefaces`

- [ ] **Step 7: Commit**

```bash
cd /Users/krah/Git/private/the-shell-pro
git add assets/css/screen.css default.hbs scripts/check-preview.mjs
git commit -m "Declare identity faces and repoint the type tokens

Prose moves to IBM Plex Sans, headings to Space Grotesk; the ten rules
pinning --shell-mono are untouched so no code surface changes. Drops the
--gh-font-* indirection per ADR-0001.

The scale is still tuned for monospace and now looks wrong; Task 4."
```

---

### Task 3: Measure and apply the fallback metrics

**Files:**
- Modify: `assets/css/screen.css` (the two fallback `@font-face` blocks from Task 2)

**Interfaces:**
- Consumes: the `@font-face` blocks named `"Space Grotesk Fallback"` and `"Plex Fallback"`.
- Produces: measured `size-adjust` / `ascent-override` / `descent-override` values. Nothing later depends on the numbers.

- [ ] **Step 1: Measure the metrics of both real faces and the fallback**

```bash
cd /Users/krah/Git/private/the-shell-pro
cat > /tmp/metrics.mjs <<'EOF'
// Renders a fixed string in each face and reports width + vertical metrics.
import {readFileSync} from 'node:fs';
console.log('Open the printed data: URL in Chrome and read the table.');
const html = `<!doctype html><meta charset=utf-8>
<style>
@font-face{font-family:SG;src:url(data:font/woff2;base64,${readFileSync('assets/fonts/space-grotesk-var.woff2').toString('base64')}) format('woff2');font-weight:500 700}
@font-face{font-family:PX;src:url(data:font/woff2;base64,${readFileSync('assets/fonts/ibm-plex-sans-var.woff2').toString('base64')}) format('woff2');font-weight:400 600}
span{font-size:100px;white-space:nowrap}
</style>
<span id=a style="font-family:SG">Handgloves</span><br>
<span id=b style="font-family:PX">Handgloves</span><br>
<span id=c style="font-family:Helvetica Neue,Arial">Handgloves</span>
<pre id=out></pre>
<script>
document.fonts.ready.then(()=>{
  const w=id=>document.getElementById(id).getBoundingClientRect().width;
  out.textContent = JSON.stringify({
    spaceGrotesk:w('a'), plex:w('b'), fallback:w('c'),
    sgAdjust:(w('a')/w('c')*100).toFixed(1)+'%',
    pxAdjust:(w('b')/w('c')*100).toFixed(1)+'%'
  },null,2);
});
</script>`;
console.log('data:text/html;base64,' + Buffer.from(html).toString('base64'));
EOF
node /tmp/metrics.mjs > /tmp/metrics-url.txt
echo "URL written to /tmp/metrics-url.txt"
```

Open the URL from `/tmp/metrics-url.txt` in the browser (use the
`mcp__claude-in-chrome__navigate` tool) and read the JSON it prints.

- [ ] **Step 2: Apply the measured values**

Replace the two placeholder fallback blocks from Task 2 with the measured
figures. `size-adjust` is the `sgAdjust` / `pxAdjust` percentage from Step 1.
For the vertical overrides use these, which are correct for both families:

```css
@font-face {
    font-family: "Space Grotesk Fallback";
    src: local("Helvetica Neue"), local("Arial");
    size-adjust: <sgAdjust from step 1>;
    ascent-override: 95%;
    descent-override: 25%;
    line-gap-override: 0%;
}

@font-face {
    font-family: "Plex Fallback";
    src: local("Helvetica Neue"), local("Arial");
    size-adjust: <pxAdjust from step 1>;
    ascent-override: 95%;
    descent-override: 25%;
    line-gap-override: 0%;
}
```

- [ ] **Step 3: Verify the swap does not reflow**

```bash
cd /Users/krah/Git/private/the-shell-pro
npm run check:preview 2>&1 | grep -cE "^FAIL"
```

Expected: the same failure count as before this task (this task should not change
any assertion). Then confirm visually: load a long article in the browser with
the network throttled, and check that body text does not jump when the face
swaps in.

- [ ] **Step 4: Commit**

```bash
cd /Users/krah/Git/private/the-shell-pro
git add assets/css/screen.css
git commit -m "Metric-match the webfont fallbacks

Measured size-adjust so the fallback occupies the same space as the real
face. Without this, font-display: swap reflows a 40-minute article and
displaces a reader who has already started scrolling."
```

---

### Task 4: Convert the article heading scale to `em` and retune

This is the largest task. It is iterative visual work, not mechanical.

**Files:**
- Modify: `assets/css/screen.css` — `.article-content h2–h6` group (~line 1236), `.article-content h2/h3/h4` (~1250–1262), `.article-header h1` (~1148), `.post-card h2` (~840), `.error-page h1` (~449)

**Interfaces:**
- Consumes: `--shell-heading` from Task 2.
- Produces: an `em`-based heading scale. Task 8's assertions depend on `h4` being larger than body prose at every reader setting.

- [ ] **Step 1: Write the failing assertion that hierarchy never inverts**

Add to `scripts/check-preview.mjs`, inside the `inspectTypeRoles` function added
in Task 2, immediately before its closing `}`:

```javascript
    const hierarchy = await evaluate(`(async () => {
        await document.fonts.ready;
        const article = document.querySelector('.article');
        const content = document.querySelector('.article-content');
        const px = (el) => Number.parseFloat(getComputedStyle(el).fontSize);
        const sample = {};
        for (const size of ['compact', 'default', 'large']) {
            article.dataset.readerText = size;
            await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
            sample[size] = {
                body: px(content.querySelector('p')),
                h4: px(content.querySelector('h4')),
                h3: px(content.querySelector('h3')),
                h2: px(content.querySelector('h2'))
            };
        }
        article.dataset.readerText = 'default';
        return sample;
    })()`);
    check(
        ['compact', 'default', 'large'].every((size) => {
            const s = hierarchy[size];
            return s.h4 > s.body && s.h3 > s.h4 && s.h2 > s.h3;
        }),
        'heading hierarchy holds at every reader text size',
        JSON.stringify(hierarchy)
    );
```

- [ ] **Step 2: Run it and watch it fail**

```bash
cd /Users/krah/Git/private/the-shell-pro
npm run check:preview 2>&1 | grep -A1 "heading hierarchy holds"
```

Expected: FAIL. At `large`, `h4` is `1.14rem` = 18.24px while body reaches
18.56px — the heading is smaller than its own paragraph.

- [ ] **Step 3: Convert the article heading scale to `em`**

Replace the fixed sizes at `.article-content h2`, `h3` and `h4` with `em` values
relative to `.article-content`, so the reader's text-size control scales the
whole reading surface:

```css
.article-content h2 {
    font-size: 1.95em;
}

.article-content h3 {
    font-size: 1.45em;
}

.article-content h4 {
    font-size: 1.15em;
}

.article-content h5 {
    font-size: 1em;
}

.article-content h6 {
    font-size: .9em;
}
```

In the `.article-content h2, h3, h4, h5, h6` group rule (~line 1236), change
`letter-spacing: -.045em` to `letter-spacing: -.012em`. That tracking was tuned
for monospace; Space Grotesk is far narrower and will look strangled at the old
value.

Delete the hard-coded `color: #b8f6db` from `.article-content h3` — headings are
tokenised in Task 6 and must not carry literals.

- [ ] **Step 4: Retune the two remaining display sizes**

`.article-header h1` and `.post-card h2` stay `clamp()`-based (they are not
inside `.article-content` and do not scale with the reader control). Space
Grotesk is narrower than monospace, so raise them and relax tracking:

```css
.article-header h1 {
    font-size: clamp(2.1rem, 1.35rem + 3.2vw, 3.6rem);
    letter-spacing: -.015em;
}
```

```css
.post-card h2 {
    font-size: clamp(1.3rem, 2.4vw, 1.8rem);
    letter-spacing: -.01em;
}
```

Keep the existing `.article-header--long-title` and `--very-long-title`
modifiers; only adjust their sizes proportionally if the ARM/TEE headline
(the site's longest) overflows.

- [ ] **Step 5: Run the assertions and watch them pass**

```bash
cd /Users/krah/Git/private/the-shell-pro
npm run check:preview 2>&1 | grep -E "heading hierarchy holds|code typography scales"
```

Expected: both PASS. `code typography scales with mobile prose` asserts
`code / prose <= .8`; the retune should improve that ratio, not regress it.

- [ ] **Step 6: Visual check**

Load a long article at 1440px and 500px and confirm: the title does not wrap
awkwardly, `h2` and `h3` are clearly distinguishable, and section headings do not
collide with the research map.

- [ ] **Step 7: Commit**

```bash
cd /Users/krah/Git/private/the-shell-pro
git add assets/css/screen.css scripts/check-preview.mjs
git commit -m "Convert the article heading scale to em and retune for Space Grotesk

Headings used root-relative clamps, so the reader's text-size control
scaled only paragraphs. At Large the hierarchy inverted: h4 rendered
18.24px against 18.56px body. em-based sizing makes that structurally
impossible. Tracking relaxed from -.045em, which was tuned for monospace."
```

---

### Task 5: Assign the type roles explicitly

**Files:**
- Modify: `assets/css/screen.css` — approximately 15 new `font-family` declarations

**Interfaces:**
- Consumes: `--shell-font-display`, `--shell-font-text`, `--shell-font-icon` from Task 2.
- Produces: no new names.

Apply the `CONTEXT.md` test: **scanned** → display, **read** → text, **parsed** →
mono, **iconographic** → icon stack.

- [ ] **Step 1: Assign scanned surfaces to the display face**

Add `font-family: var(--shell-font-display);` to each of these rules. If a rule
does not exist, find the selector and add the declaration to it:

- `.eyebrow`
- `.breadcrumbs`
- `.post-type` (the RESEARCH NOTE badge)
- `.shell-code-toolbar` (the code block header — its language label is scanned)
- `.toc__title` (the "Research map" heading)
- `.figure-artifact__number` (`FIG. 01`)
- `.figure-artifact__hint` (`SELECT TO INSPECT`)
- `.lab-index` topic pills
- `.site-footer .eyebrow` (`// NAVIGATE`)

- [ ] **Step 2: Pin parsed surfaces to monospace**

Add `font-family: var(--shell-mono);` to these — they are values, and after
Task 2 they would otherwise inherit the text face from `body`:

- `.article-meta` (date · reading time · handle — the whole row stays mono as a
  unit; splitting it to isolate the word "read" would look broken)
- `.toc__count` (`11 waypoints`)
- `.post-card__meta` (date and reading time on cards)
- `.site-footer__transmission time`

- [ ] **Step 3: Pin iconographic characters to the symbol stack**

These are single characters used as symbols and are **not present in either
webfont**. Add `font-family: var(--shell-font-icon);` to:

- `.site-brand` `▣` mark — wrap the character in `<span class="site-brand__mark">`
  in `default.hbs` if it is not already isolated, and target that span
- `.nav-toggle` `☰`
- `.icon-button` `⌕` (search)
- `.back-to-top` `↑`
- `.article-neighbours` `←` / `→`

Leave `.shell-code-expand::after` (`↓`/`↑`) alone — it already pins
`--shell-mono` and is in the protected list.

- [ ] **Step 4: Add the iconographic-rendering assertion**

Neither webfont contains `▣ ☰ ⌕ ← →`, so if one of these surfaces is ever
assigned to the display face it renders as tofu. Assert it cannot happen. Add
inside `inspectTypeRoles` in `scripts/check-preview.mjs`, before its closing `}`:

```javascript
    const icons = await evaluate(`(async () => {
        await document.fonts.ready;
        const probe = (ch) => {
            const span = document.createElement('span');
            span.textContent = ch;
            span.style.cssText = 'position:absolute;visibility:hidden;font-size:64px;'
                + 'font-family:var(--shell-font-icon)';
            document.body.appendChild(span);
            const width = span.getBoundingClientRect().width;
            span.remove();
            return width;
        };
        const notdef = probe('\\uFFFF');
        return {
            notdef,
            glyphs: ['▣', '☰', '⌕', '←', '→'].map((c) => [c, probe(c)])
        };
    })()`);
    check(
        icons.glyphs.every(([, w]) => w > 0 && Math.abs(w - icons.notdef) > 0.5),
        'iconographic glyphs render as symbols rather than tofu',
        JSON.stringify(icons)
    );
```

The `notdef` comparison matters: a tofu box has non-zero width, so checking
`width > 0` alone would pass on a broken glyph. Comparing against the width of a
guaranteed-missing character (`U+FFFF`) is what actually detects the failure.

- [ ] **Step 5: Verify no scanned surface is left inheriting the text face**

```bash
cd /Users/krah/Git/private/the-shell-pro
grep -c "font-family" assets/css/screen.css
npm run check:preview 2>&1 | grep -E "iconographic glyphs render"
```

Expected: roughly 29 declarations (14 before this plan, plus ~15 added here), and
`PASS  iconographic glyphs render as symbols rather than tofu`.

- [ ] **Step 6: Visual check**

Load an article and confirm the eyebrow, breadcrumbs, badge and code header are
all in Space Grotesk, the meta row is monospace, and the brand mark, hamburger
and search glyphs render as symbols rather than tofu boxes.

- [ ] **Step 7: Commit**

```bash
cd /Users/krah/Git/private/the-shell-pro
git add assets/css/screen.css default.hbs
git commit -m "Assign type roles to chrome, data and iconographic surfaces

Repointing the tokens moved everything inheriting from body onto the text
face, including chrome that should be scanned and values that should be
parsed. Iconographic characters get a system symbol stack because they do
not exist in either webfont at any subset."
```

---

### Task 6: Split the palette into brand, semantic and structural families

**Files:**
- Modify: `assets/css/screen.css` — `:root` block, the ten hard-coded green sites (lines 149, 255, 547, 686, 802, 1126, 1493, 2290, 2463), `.research-block--*` rules (~1345–1367), `.article-content h3` colour

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces: `--shell-tone-method` and a deepened `--shell-bg`. Task 7 references the background value.

- [ ] **Step 1: Write the failing assertions**

Add to `scripts/check-preview.mjs` as a new function, registered next to
`inspectTypeRoles`:

```javascript
async function inspectPalette() {
    await navigate('/tracing-the-edge-200ms-feedback-loop/');
    const contrast = (hex, bg) => {
        const lum = (h) => {
            const c = h.replace('#', '').match(/../g).map((v) => {
                const n = parseInt(v, 16) / 255;
                return n <= 0.03928 ? n / 12.92 : Math.pow((n + 0.055) / 1.055, 2.4);
            });
            return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
        };
        const [a, b] = [lum(hex), lum(bg)].sort((x, y) => y - x);
        return (a + 0.05) / (b + 0.05);
    };
    const accents = ['#35e0a1', '#dc4474', '#57b6ff', '#ff9448'];
    const bg = await evaluate(`getComputedStyle(document.body).backgroundColor`);
    const toHex = (rgb) => '#' + rgb.match(/\\d+/g).slice(0, 3)
        .map((n) => Number(n).toString(16).padStart(2, '0')).join('');
    const bgHex = toHex(bg);
    const failing = accents.filter((a) => contrast(a, bgHex) < 4.5);
    check(
        failing.length === 0,
        'every supported accent clears WCAG AA against the article background',
        JSON.stringify({background: bgHex, failing,
            ratios: accents.map((a) => [a, contrast(a, bgHex).toFixed(2)])})
    );

    const literals = await evaluate(`(() => {
        const sheet = [...document.styleSheets]
            .find((s) => String(s.href).includes('screen.css'));
        const text = [...sheet.cssRules].map((r) => r.cssText).join('\\n');
        return {
            green: (text.match(/53,\\s*224,\\s*161/g) || []).length,
            mint: (text.match(/#63f0ba|#b8f6db/gi) || []).length
        };
    })()`);
    check(
        literals.green === 0 && literals.mint === 0,
        'no hard-coded accent literals survive in the stylesheet',
        JSON.stringify(literals)
    );
}
```

- [ ] **Step 2: Run and watch both fail**

```bash
cd /Users/krah/Git/private/the-shell-pro
npm run check:preview 2>&1 | grep -E "supported accent clears|accent literals survive"
```

Expected: both FAIL. `#dc4474` is 4.38:1 on the current `#111822`, and there are
ten green/mint literals.

- [ ] **Step 3: Deepen the background and organise the token block**

In `:root`, change `--shell-bg: #111822;` to `--shell-bg: #080c13;` and group the
tokens under three comments:

```css
    /* Structural — fixed. Background ramp, surfaces, borders, text. */
    --shell-bg: #080c13;
    --shell-surface: #131c27;
    --shell-surface-raised: #1b2634;
    --shell-text: #d5dce7;
    --shell-muted: #8492a5;
    --shell-border: #2a3a4d;
    --shell-border-strong: #4a6076;

    /* Brand — author-settable via Ghost. Never used to encode meaning. */
    --shell-accent: #35e0a1;

    /*
     * Semantic — theme-owned, fixed, never derived from the accent.
     * These encode what kind of claim a research block makes; tying them to
     * branding would let an accent change corrupt the encoding.
     * See docs/adr/0002-brand-colour-and-semantic-colour-are-separate.md
     */
    --shell-tone-hypothesis: #7dd3fc;
    --shell-tone-method: #6ee7b7;
    --shell-tone-finding: #e697ff;
    --shell-tone-limitation: #facc6b;
    --shell-danger: #ff7b88;
```

Keep `--shell-cyan`, `--shell-magenta` and `--shell-yellow` defined as aliases of
the corresponding tone tokens so unrelated rules keep working:

```css
    --shell-cyan: var(--shell-tone-hypothesis);
    --shell-magenta: var(--shell-tone-finding);
    --shell-yellow: var(--shell-tone-limitation);
```

- [ ] **Step 4: Decouple the research tones from the accent**

At `.research-block--method`, replace `--research-tone: var(--shell-accent);`
with `--research-tone: var(--shell-tone-method);`.

Update the other three variants to reference the tone tokens rather than the
colour aliases.

- [ ] **Step 5: Remove the ten hard-coded accent literals**

Replace every `rgba(53, 224, 161, X)` with
`color-mix(in srgb, var(--shell-accent) <X*100>%, transparent)` at lines 149,
255, 547, 686, 802, 1493, 2290 and 2463. For example
`rgba(53, 224, 161, .06)` becomes
`color-mix(in srgb, var(--shell-accent) 6%, transparent)`.

At line 1126, replace `color: #63f0ba;` with
`color: color-mix(in srgb, var(--shell-accent) 78%, #ffffff);`.

- [ ] **Step 6: Run and watch both pass**

```bash
cd /Users/krah/Git/private/the-shell-pro
npm run check:preview 2>&1 | grep -E "supported accent clears|accent literals survive"
```

Expected: both PASS.

- [ ] **Step 7: Commit**

```bash
cd /Users/krah/Git/private/the-shell-pro
git add assets/css/screen.css scripts/check-preview.mjs
git commit -m "Split the palette into brand, semantic and structural families

Research tones encode what kind of claim a block makes, and 'method' was
wired to the author-settable accent — already colliding with 'finding' on
the site's current pink. Tones are now theme-owned and fixed.

Deepening the background also lifts prose links from 4.38:1 to 4.77:1,
clearing WCAG AA, and the ten hard-coded greens that assumed the default
accent are replaced with color-mix derivations."
```

---

### Task 7: Corner ticks and the deleted progress meter

**Files:**
- Modify: `default.hbs` (remove the `.reading-progress` div)
- Modify: `assets/js/shell.js` (`setupReadingProgress` at ~1463; add spine + time-remaining)
- Modify: `assets/css/screen.css` (remove `.reading-progress` rules at 134–152; add tick and spine rules)

**Interfaces:**
- Consumes: `--shell-accent`, `--shell-border` from Task 6.
- Produces: `--toc-progress` custom property set on `.toc` by JS, consumed by the spine CSS.

- [ ] **Step 1: Delete the viewport progress bar**

In `default.hbs`, delete this line entirely:

```hbs
    <div class="reading-progress" data-reading-progress aria-hidden="true" hidden><span></span></div>
```

In `screen.css`, delete the `.reading-progress` and `.reading-progress span`
rules (lines 134–152). Also remove `.reading-progress` from the `@media print`
hide list.

- [ ] **Step 2: Replace the JS with a spine and time remaining**

In `shell.js`, replace the whole `setupReadingProgress` function with:

```javascript
    /*
     * Reading progress lives on the research map, the component that already
     * answers "where am I". The map's left border fills as a spine, and the
     * waypoint count becomes time remaining once reading is under way — a
     * question a percentage bar cannot answer.
     */
    function setupReadingProgress() {
        var map = doc.querySelector('.toc');
        var article = doc.querySelector('.article');
        var count = doc.querySelector('.toc__count');
        if (!map || !article) {
            return;
        }
        var totalMinutes = parseInt((doc.querySelector('.article-meta') || {}).textContent
            ? (doc.querySelector('.article-meta').textContent.match(/(\d+)\s*min/) || [])[1]
            : '', 10);
        var originalCount = count ? count.textContent : '';
        var update = function () {
            var start = article.offsetTop - 112;
            var distance = Math.max(article.offsetHeight - window.innerHeight + 224, 1);
            var ratio = Math.min(1, Math.max(0, (window.scrollY - start) / distance));
            map.style.setProperty('--toc-progress', (ratio * 100).toFixed(2) + '%');
            if (count && totalMinutes > 0) {
                var left = Math.ceil(totalMinutes * (1 - ratio));
                count.textContent = ratio < 0.02 || left < 1
                    ? originalCount
                    : left + ' min left';
            }
        };
        update();
        window.addEventListener('scroll', update, {passive: true});
        window.addEventListener('resize', update);
    }
```

- [ ] **Step 3: Add the spine and corner ticks**

Add to `screen.css`, near the `.toc` rules:

```css
/*
 * Progress spine. The map's left border doubles as the reading-position
 * indicator, so no viewport-level chrome is needed.
 */
.toc {
    background-image: linear-gradient(
        to bottom,
        var(--shell-accent) var(--toc-progress, 0%),
        transparent var(--toc-progress, 0%)
    );
    background-repeat: no-repeat;
    background-size: 1px 100%;
    background-position: left top;
}

/*
 * Corner ticks. A framing device, so they belong on rectangular panels — the
 * feature image and the research map — and nowhere else. Not on code blocks: a
 * kernel post carries fifteen.
 */
.article-feature-image,
.article-toc {
    position: relative;
}

.article-feature-image::before,
.article-feature-image::after,
.article-toc::before,
.article-toc::after {
    position: absolute;
    width: .85rem;
    height: .85rem;
    border: 0 solid color-mix(in srgb, var(--shell-accent) 55%, transparent);
    content: "";
    pointer-events: none;
}

.article-feature-image::before,
.article-toc::before {
    top: 0;
    left: 0;
    border-top-width: 1px;
    border-left-width: 1px;
}

.article-feature-image::after,
.article-toc::after {
    right: 0;
    bottom: 0;
    border-right-width: 1px;
    border-bottom-width: 1px;
}

@media (max-width: 900px) {
    .toc {
        background-image: none;
    }
}
```

- [ ] **Step 4: Verify**

```bash
cd /Users/krah/Git/private/the-shell-pro
grep -c "reading-progress" assets/css/screen.css default.hbs
npm run check:preview 2>&1 | grep -cE "^FAIL"
```

Expected: `0` occurrences of `reading-progress`, and no increase in failures.

- [ ] **Step 6: Visual check**

Scroll a long article and confirm the spine fills, the waypoint count switches to
`N min left` after scrolling begins and reverts near the top, and ticks appear on
the feature image and map only.

- [ ] **Step 6: Commit**

```bash
cd /Users/krah/Git/private/the-shell-pro
git add assets/css/screen.css assets/js/shell.js default.hbs
git commit -m "Move reading progress into the research map and add corner ticks

The viewport bar was aria-hidden, pointer-events: none and had no test
coverage — the theme already classified it as decoration. Progress becomes
a spine on the map's existing border, and the waypoint count becomes time
remaining, which is the one thing a percentage bar cannot tell a reader."
```

---

### Task 8: Make high-contrast mode do real work

**Files:**
- Modify: `assets/css/screen.css` — `[data-reader-contrast="high"]` rules at ~1117–1128

**Interfaces:**
- Consumes: palette tokens from Task 6.
- Produces: nothing.

- [ ] **Step 1: Replace the three stub rules**

The existing block only brightens body text, bolds `strong` and recolours links.
Replace it with:

```css
.article[data-reader-contrast="high"] .article-content {
    color: #eef4fb;
}

.article[data-reader-contrast="high"] .article-content strong {
    color: #fff;
}

.article[data-reader-contrast="high"] .article-content a {
    color: color-mix(in srgb, var(--shell-accent) 72%, #ffffff);
    text-decoration-thickness: .11em;
}

/* Muted text is the first thing to become unreadable; lift it hardest. */
.article[data-reader-contrast="high"] .article-content figcaption,
.article[data-reader-contrast="high"] .article-meta,
.article[data-reader-contrast="high"] .figure-artifact__hint {
    color: #b6c4d4;
}

/* Structure needs to survive too, not just prose. */
.article[data-reader-contrast="high"] .shell-code-block,
.article[data-reader-contrast="high"] .article-content figure,
.article[data-reader-contrast="high"] .article-content table {
    border-color: var(--shell-border-strong);
}

.article[data-reader-contrast="high"] .article-content pre,
.article[data-reader-contrast="high"] .article-content code {
    color: #e4ecf5;
}

.article[data-reader-contrast="high"] .article-content .code-line-numbers {
    color: #8ea3ba;
}
```

- [ ] **Step 2: Verify the existing reader-tools assertion still passes**

```bash
cd /Users/krah/Git/private/the-shell-pro
npm run check:preview 2>&1 | grep -E "reader controls apply useful preferences"
```

Expected: PASS.

- [ ] **Step 3: Commit**

```bash
cd /Users/krah/Git/private/the-shell-pro
git add assets/css/screen.css
git commit -m "Make high-contrast mode do real work

It was three rules covering prose only. Light mode was declined for this
theme, so this control carries the eye-comfort need: muted text, borders,
code surfaces and line numbers all lift, not just paragraphs."
```

---

### Task 9: Document, verify end-to-end, and bump the version

**Files:**
- Modify: `README.md`
- Modify: `package.json` (version only)

**Interfaces:**
- Consumes: everything.
- Produces: the release artifact.

- [ ] **Step 1: Add the "Changing the fonts" README section**

Insert after the "Theme settings" table:

````markdown
## Changing the fonts

The theme owns its typography — Ghost's **Design & branding → Typography**
setting is deliberately not consulted, because the type scale is tuned to Space
Grotesk's metrics and an arbitrary substitution would invalidate it. See
`docs/adr/0001-theme-owns-typography.md`.

To change a face:

1. Drop a `woff2` into `assets/fonts/`.
2. Update the matching `@font-face` block at the top of `assets/css/screen.css`.
3. Update `--shell-font-display` or `--shell-font-text` in `:root`.
4. If you changed the display face, update the `<link rel="preload">` in
   `default.hbs`.
5. Re-measure the paired `*-Fallback` `@font-face` metrics, and expect to retune
   the heading scale — a narrower or wider face will not sit correctly at the
   current sizes and tracking.

Monospace is intentionally a system stack and takes no webfont.

**Supported accent colours.** Set the accent in Ghost Admin. These four are
designed and contrast-tested against the theme background:

| Name | Value |
| --- | --- |
| Signal green | `#35e0a1` |
| Alert red | `#dc4474` |
| Ice blue | `#57b6ff` |
| Amber | `#ff9448` |

Other colours will render but are untested and may fail contrast.
````

- [ ] **Step 2: Run the full suite**

```bash
cd /Users/krah/Git/private/the-shell-pro
npm run check:preview 2>&1 | tail -30
```

If the preview Ghost at `localhost:2369` is running an **older** theme build,
these results describe that build, not this branch. Confirm by checking whether
the served CSS contains the new tokens:

```bash
curl -s http://localhost:2369/assets/css/screen.css | grep -c "shell-font-display"
```

`0` means the preview instance needs this build uploaded before its results mean
anything. Say so plainly in the summary rather than reporting stale failures as
regressions.

- [ ] **Step 3: Bump the version**

In `package.json`, change `"version": "2.0.14"` to `"version": "2.1.0"` — a minor
bump, since this changes the theme's appearance rather than fixing behaviour.

- [ ] **Step 4: Build the release artifact**

```bash
cd /Users/krah/Git/private/the-shell-pro
rm -f the-shell-pro-*.zip
zip -rq the-shell-pro-2.1.0.zip package.json README.md LICENSE *.hbs partials \
  assets/css/screen.css assets/js/shell.js assets/fonts -x '.*'
unzip -t the-shell-pro-2.1.0.zip | tail -1
unzip -l the-shell-pro-2.1.0.zip | grep -c fonts
```

Expected: no errors, and 4 font files present (2 woff2, 2 licences).

- [ ] **Step 5: Commit**

```bash
cd /Users/krah/Git/private/the-shell-pro
git add README.md package.json
git commit -m "Document font customisation and supported accents; release 2.1.0"
```

---

## Verification

Run after Task 9, at 500 / 900 / 1280 / 1440 px, on: home, a long post with code
(`dabbling-with-linux-kernel-exploitation…`), a post with tables and figures
(`overview-of-glibc-heap-exploitation-techniques`), a tag archive, About, and 404.

1. No horizontal overflow at any width.
2. Reader controls still scale prose, and heading hierarchy holds at all three
   text sizes.
3. Focus rings, skip link and lightbox behaviour unchanged.
4. Code blocks unchanged — same font, same 16-line preview, line numbers aligned.
5. Print output still ink-on-paper with readable syntax.
6. Transferred font bytes ≤ 100 KB.
7. Iconographic glyphs (`▣ ☰ ⌕ ↑ ← →`) render as symbols, not tofu.
