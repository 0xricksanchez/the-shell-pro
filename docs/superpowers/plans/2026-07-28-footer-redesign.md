# Footer Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild the site footer as a first-class two-column section: identity + terminal colophon (prompt line, last-transmission status, PGP fingerprint) on the left, a `// NAVIGATE` secondary-navigation column on the right, and the existing RSS/Social/Member utility links in a divider rail below.

**Architecture:** Pure theme change: Handlebars markup in `default.hbs`, CSS in `assets/css/screen.css`, two new Ghost custom theme settings declared in `package.json`. Data is all dynamic — secondary navigation from Ghost Admin, latest-post date via `{{#get}}`, PGP via `@custom` settings. Verification runs through the existing Docker preview + `scripts/check-preview.mjs` CDP suite.

**Tech Stack:** Ghost 6 Handlebars themes, vanilla CSS, Node 22 scripts (no deps), Chromium CDP checks.

**Spec:** `docs/superpowers/specs/2026-07-28-footer-redesign-design.md`

## Global Constraints

- The working tree carries the user's own uncommitted work in `default.hbs`, `screen.css`, `package.json`, and both scripts. **Re-read each file immediately before editing. Do NOT run `git commit`** unless `git status` shows a clean tree apart from this plan's changes — otherwise leave everything uncommitted and tell the user which files changed, so their pending batch is never swept into a commit they didn't design.
- Preserve the user's recent changes: back-to-top button lives in the header `.site-actions`, `nav-external` markers, `scroll-padding-top: 5.5rem` on `html`, print stylesheet block hiding `.site-footer`.
- Existing check suite must stay green: `npm run check:preview` currently passes 21/21 — all of those checks must still pass at the end.
- CSS follows the file's idiom: 4-space indent, BEM-ish `block__element` class names, `var(--shell-*)` tokens, media-query overrides appended inside the existing `@media (max-width: 700px)` block.
- Theme version bumps 2.0.6 → 2.0.7 only in the final task.
- Preview stack: `docker compose -f docker-compose.preview.yml up -d`, seed with `node scripts/seed-preview.mjs`, checks with `npm run check:preview` (needs the Docker preview running and seeded).

---

### Task 1: Declare PGP custom settings and seed them in the preview

**Files:**
- Modify: `package.json` (config.custom block, currently only `show_comments`)
- Modify: `scripts/seed-preview.mjs` (add custom-settings configuration next to `configurePreviewNavigation`, which already seeds `secondary_navigation` with "Research notes" + "Source")

**Interfaces:**
- Produces: theme settings `@custom.pgp_fingerprint` and `@custom.pgp_key_url` (strings, empty default) available to all templates; preview seeded with fingerprint `3F2A 91C4 D06B 5A7E 22C1 09AB 44E0 7F10 8C55 21DA` and key URL `https://example.test/pgp.asc`. Task 2's checks and Task 3's markup rely on these exact values/keys.

- [ ] **Step 1: Declare the settings in package.json**

In `package.json` `config.custom`, after the `show_comments` entry, add:

```json
"pgp_fingerprint": {
    "type": "text",
    "default": "",
    "description": "Public PGP key fingerprint shown in the footer colophon (leave empty to hide)"
},
"pgp_key_url": {
    "type": "text",
    "default": "",
    "description": "Optional link target for the footer PGP fingerprint (keyserver or .asc file)"
}
```

- [ ] **Step 2: Seed the values in scripts/seed-preview.mjs**

Add this function directly below `configurePreviewNavigation` (keep the file's style — `request` helper, cookie param):

```js
async function configureCustomThemeSettings(cookie) {
    await request('/custom_theme_settings/', {
        method: 'PUT',
        headers: {
            'Content-Type': 'application/json',
            Cookie: cookie
        },
        body: JSON.stringify({
            custom_theme_settings: [
                {key: 'pgp_fingerprint', value: '3F2A 91C4 D06B 5A7E 22C1 09AB 44E0 7F10 8C55 21DA'},
                {key: 'pgp_key_url', value: 'https://example.test/pgp.asc'}
            ]
        })
    });
}
```

In `main()`, call `await configureCustomThemeSettings(cookie);` immediately after the existing `configurePreviewNavigation(cookie)` call (custom settings are validated against the *active* theme, and theme activation happens earlier in `main()`, so this ordering is required).

- [ ] **Step 3: Run the seed against the preview and verify**

```bash
docker compose -f docker-compose.preview.yml restart ghost   # forces Ghost to re-read package.json from the ro mount
node scripts/seed-preview.mjs
```

Expected: script completes with the usual `Preview updated:` line and no thrown error from the new PUT. If the PUT fails with a validation error about unknown settings, Ghost cached the old theme metadata — run `docker compose -f docker-compose.preview.yml restart ghost` again and re-seed.

---

### Task 2: Add failing footer checks to the CDP suite

**Files:**
- Modify: `scripts/check-preview.mjs` (new `inspectFooter()` function; register it in the run sequence in `main()` alongside the existing `inspectHome()`-style calls)

**Interfaces:**
- Consumes: seeded secondary navigation ("Research notes", "Source") and PGP values from Task 1.
- Produces: checks that Task 3+4 must turn green. Selectors the implementation must therefore use: `.site-footer__identity`, `.site-footer__transmission` (containing `<a>` wrapping a `<time datetime="YYYY-MM-DD">`), `.site-footer__pgp`, `.site-footer__navigate` (containing `.footer-nav__links a`), `.site-footer__rail .site-footer__links a`.

- [ ] **Step 1: Write the failing checks**

Add to `scripts/check-preview.mjs`, following the file's existing `inspect*` pattern:

```js
async function inspectFooter() {
    await navigate('/');
    const desktop = await evaluate(`(() => {
        const footer = document.querySelector('.site-footer');
        const identity = footer?.querySelector('.site-footer__identity')?.getBoundingClientRect();
        const navigateColumn = footer?.querySelector('.site-footer__navigate');
        const navigateBox = navigateColumn?.getBoundingClientRect();
        const navLinks = navigateColumn ? Array.from(navigateColumn.querySelectorAll('.footer-nav__links a')) : [];
        const transmission = footer?.querySelector('.site-footer__transmission');
        const transmissionTime = transmission?.querySelector('a[href] time[datetime]');
        const pgp = footer?.querySelector('.site-footer__pgp');
        return {
            navLabels: navLinks.map((link) => link.textContent.trim()),
            minTarget: navLinks.length ? Math.min(...navLinks.map((link) => link.getBoundingClientRect().height)) : 0,
            sideBySide: Boolean(identity && navigateBox && navigateBox.left >= identity.right),
            transmissionDate: transmissionTime?.getAttribute('datetime') || '',
            pgpText: pgp?.textContent.replace(/\\s+/g, ' ').trim() || '',
            railLinks: footer ? footer.querySelectorAll('.site-footer__rail .site-footer__links a').length : 0
        };
    })()`);
    check(desktop.navLabels.length >= 2, 'footer navigate column renders the secondary navigation', JSON.stringify(desktop.navLabels));
    check(desktop.sideBySide, 'desktop footer places the navigate column beside the identity block');
    check(/^\d{4}-\d{2}-\d{2}$/.test(desktop.transmissionDate), 'footer last-transmission links the latest post with a dated time element', desktop.transmissionDate);
    check(desktop.pgpText.includes('3F2A 91C4'), 'footer renders the PGP fingerprint from custom settings', desktop.pgpText);
    check(desktop.minTarget >= 32, 'footer navigate links are touch-sized', String(desktop.minTarget));
    check(desktop.railLinks >= 1, 'footer utility rail keeps the publication links', String(desktop.railLinks));

    await navigate('/', 390, 844);
    const mobile = await evaluate(`(() => {
        const footer = document.querySelector('.site-footer');
        const identity = footer?.querySelector('.site-footer__identity')?.getBoundingClientRect();
        const navigateBox = footer?.querySelector('.site-footer__navigate')?.getBoundingClientRect();
        return {stacked: Boolean(identity && navigateBox && navigateBox.top >= identity.bottom)};
    })()`);
    check(mobile.stacked, 'mobile footer stacks the navigate column below the identity block');
}
```

Register it in `main()`'s inspection sequence after the last existing `inspect*` call (match the surrounding call style, e.g. `await inspectFooter();`).

- [ ] **Step 2: Run the suite to verify the new checks fail and old ones pass**

```bash
npm run check:preview
```

Expected: the pre-existing 21 checks PASS; the 7 new footer checks FAIL (no `.site-footer__navigate` / `.site-footer__transmission` / `.site-footer__pgp` / `.site-footer__rail` elements exist yet). Exit non-zero with exactly the 7 new failures listed.

---

### Task 3: Footer markup in default.hbs

**Files:**
- Modify: `default.hbs` — replace the current `<footer class="site-footer">…</footer>` block (currently: `__inner` grid holding `__identity` + `__navigation`, with `footer-nav` and `__links` nested in `__navigation`)

**Interfaces:**
- Consumes: `@custom.pgp_fingerprint` / `@custom.pgp_key_url` (Task 1), existing `partials/navigation.hbs` secondary branch (emits `ul.footer-nav__links` — reused unchanged).
- Produces: the exact DOM structure Task 2's selectors assert and Task 4 styles: `.site-footer > .site-footer__inner > (.site-footer__identity + nav.site-footer__navigate)` and `.site-footer > .site-footer__rail > .site-footer__links`.

- [ ] **Step 1: Replace the footer block**

Replace the whole `<footer class="site-footer">…</footer>` element in `default.hbs` with:

```hbs
    <footer class="site-footer">
        <div class="site-footer__inner">
            <div class="site-footer__identity">
                <p><span class="prompt" aria-hidden="true">$</span> {{@site.title}} <span class="muted">© {{date format="YYYY"}}</span></p>
                <p class="site-footer__status">independent technical publishing</p>
                {{#get "posts" limit="1" order="published_at desc" fields="url,published_at" as |latest|}}
                    {{#foreach latest}}
                        <p class="site-footer__transmission">
                            <span class="site-footer__transmission-dot" aria-hidden="true"></span>
                            <span>last transmission</span>
                            <a href="{{url}}"><time datetime="{{date format="YYYY-MM-DD"}}">{{date format="DD MMM YYYY"}}</time></a>
                        </p>
                    {{/foreach}}
                {{/get}}
                {{#if @custom.pgp_fingerprint}}
                    <p class="site-footer__pgp">
                        <span class="site-footer__pgp-label" aria-hidden="true">PGP</span>
                        <span class="visually-hidden">PGP fingerprint</span>
                        {{#if @custom.pgp_key_url}}
                            <a href="{{@custom.pgp_key_url}}">{{@custom.pgp_fingerprint}}</a>
                        {{else}}
                            <span>{{@custom.pgp_fingerprint}}</span>
                        {{/if}}
                    </p>
                {{/if}}
            </div>
            {{#if @site.secondary_navigation}}
                <nav class="site-footer__navigate" aria-label="Footer navigation">
                    <p class="eyebrow">// navigate</p>
                    {{navigation type="secondary"}}
                </nav>
            {{/if}}
        </div>
        <div class="site-footer__rail">
            <div class="site-footer__links" aria-label="Publication links">
                <a href="{{@site.url}}/rss/">RSS</a>
                {{#if @site.twitter}}<a href="{{social_url type="twitter"}}" rel="me">Social</a>{{/if}}
                {{#if @site.members_enabled}}<a href="#/portal/account">Member account</a>{{/if}}
            </div>
        </div>
    </footer>
```

Graceful degradation is carried by the two `{{#if}}` guards: no secondary nav → single-column identity; no fingerprint → no PGP line.

- [ ] **Step 2: Verify the template renders**

```bash
curl -s http://localhost:2369/ | grep -c "site-footer__transmission"
curl -s http://localhost:2369/ | grep -c "site-footer__navigate"
curl -s http://localhost:2369/ | grep -o 'site-footer__pgp.*3F2A[^<]*' | head -1
```

Expected: first two commands print `1`; third prints a line containing the seeded fingerprint. If all print `0`/nothing, Ghost cached the template — `docker compose -f docker-compose.preview.yml restart ghost` and retry.

---

### Task 4: Footer CSS

**Files:**
- Modify: `assets/css/screen.css` — the `.site-footer*` base block (~lines 1782–1848: `.site-footer`, `__inner`, `p`, `__status`, `__navigation`, `.footer-nav__links`, `__links`, link colors) and the footer rules inside `@media (max-width: 700px)` (~lines 2136–2150). Line numbers are approximate — locate by selector, the user edits this file in parallel.

**Interfaces:**
- Consumes: DOM from Task 3. Must keep: `.footer-nav__links` base list reset (the nav partial emits it), `.muted` helper, print-block hiding of `.site-footer`.
- Produces: green checks from Task 2 (side-by-side ≥ desktop, ≥30px nav targets, stacking at 390px).

- [ ] **Step 1: Replace the footer base rules**

Replace the block from `.site-footer {` through `.site-footer a:hover { … }` (keep the `.muted` rule that follows) with:

```css
.site-footer {
    border-top: 1px solid var(--shell-border);
    background: #0d131c;
}

.site-footer__inner {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    align-items: start;
    width: min(1240px, calc(100% - 3rem));
    margin: 0 auto;
    padding: 2.6rem 0 2.3rem;
    gap: 1.75rem clamp(2.5rem, 8vw, 6.5rem);
    color: var(--shell-muted);
    font-size: .75rem;
}

.site-footer p {
    margin: 0;
}

.site-footer__identity {
    display: grid;
    justify-items: start;
    gap: .3rem;
}

.site-footer__status {
    color: color-mix(in srgb, var(--shell-muted) 80%, transparent);
    font-size: .65rem;
    letter-spacing: .04em;
}

.site-footer__transmission {
    display: inline-flex;
    align-items: center;
    margin-top: 1rem !important;
    gap: .5rem;
    font-size: .67rem;
    letter-spacing: .09em;
    text-transform: uppercase;
}

.site-footer__transmission-dot {
    width: .45rem;
    height: .45rem;
    border-radius: 50%;
    background: var(--shell-accent);
    box-shadow: 0 0 .6rem rgba(53, 224, 161, .75);
}

.site-footer__transmission a {
    color: var(--shell-text);
}

.site-footer__pgp {
    font-family: var(--shell-mono);
    font-size: .7rem;
    letter-spacing: .05em;
    overflow-wrap: anywhere;
}

.site-footer__pgp-label {
    margin-right: .35rem;
    color: color-mix(in srgb, var(--shell-muted) 80%, transparent);
}

.site-footer__pgp a {
    color: var(--shell-text);
}

.site-footer__navigate {
    display: grid;
    justify-items: start;
    min-width: 10.5rem;
    gap: .4rem;
}

.site-footer__navigate .eyebrow {
    margin: 0;
}

.site-footer__navigate .footer-nav__links {
    flex-direction: column;
    align-items: flex-start;
    gap: 0;
}

.footer-nav__links,
.site-footer__links {
    display: flex;
    flex-wrap: wrap;
    margin: 0;
    padding: 0;
    gap: .45rem 1.4rem;
    list-style: none;
}

.site-footer__navigate .footer-nav__links a {
    display: block;
    padding: .5rem 0;
    color: var(--shell-text);
    font-size: .78rem;
}

.footer-nav__links .nav-current a,
.footer-nav__links a:hover {
    color: var(--shell-accent);
}

.site-footer__rail {
    border-top: 1px solid color-mix(in srgb, var(--shell-border) 62%, transparent);
}

.site-footer__rail .site-footer__links {
    width: min(1240px, calc(100% - 3rem));
    margin: 0 auto;
    padding: 1.05rem 0;
    font-size: .72rem;
}

.site-footer a {
    color: var(--shell-muted);
}

.site-footer a:hover {
    color: var(--shell-accent);
}
```

Note the ordering above is deliberate: the generic `.site-footer a { color: var(--shell-muted) }` comes *after* the specific link colors in the source, but the specific selectors (`.site-footer__transmission a`, `.site-footer__pgp a`, `.site-footer__navigate .footer-nav__links a`) win on specificity, so text-colored links stay text-colored while rail links stay muted. The old `.site-footer__navigation` block is deleted (element no longer exists).

- [ ] **Step 2: Replace the footer rules in the 700px media block**

Inside `@media (max-width: 700px)`, replace the three existing footer rules (`.site-footer__inner` grid override, `.site-footer__navigation`, and the `.footer-nav__links, .site-footer__links` flex-start override) with:

```css
    .site-footer__inner {
        grid-template-columns: 1fr;
        padding: 2.1rem 0 1.9rem;
        gap: 1.6rem;
    }

    .site-footer__navigate {
        width: 100%;
    }

    .site-footer__navigate .footer-nav__links {
        width: 100%;
    }
```

(The old `justify-content: flex-end` desktop default is gone from the base rules, so no flex-start override is needed anymore.)

- [ ] **Step 3: Run the full check suite**

```bash
npm run check:preview
```

Expected: ALL checks pass — the original 21 plus the 7 footer checks from Task 2. If `sideBySide` fails at desktop, the navigate column has wrapped: check that `.site-footer__inner` kept `grid-template-columns: minmax(0, 1fr) auto`.

---

### Task 5: Visual pass, empty-state sanity, version bump, release zip

**Files:**
- Modify: `package.json` (version only)
- Create: `the-shell-pro-2.0.7.zip`

**Interfaces:**
- Consumes: everything above, all checks green.

- [ ] **Step 1: Manual visual pass in the preview**

Open `http://localhost:2369/` at 1440, 920, and 390 px widths (browser tooling or devtools). Confirm: footer reads as a section (not a bar), navigate column right on desktop / stacked below identity on mobile, transmission dot + linked date present, PGP line wraps without overflowing at 390px, rail divider spans full width with links inside the content column, keyboard Tab reaches every footer link with a visible focus ring.

- [ ] **Step 2: Empty-state sanity via template logic**

The preview is always seeded, so verify the guards by rendering once with the conditions off: in Ghost Admin (`http://localhost:2369/ghost/`, preview credentials in `scripts/seed-preview.mjs`) → Settings → Design → theme settings, clear `pgp_fingerprint`, save, reload the homepage — the PGP line must be absent and the identity block must not leave a gap. Restore by re-running `node scripts/seed-preview.mjs`. (Secondary-nav-empty degradation uses the identical `{{#if}}` pattern already proven on the live site, which currently has no secondary navigation.)

- [ ] **Step 3: Bump version and build the zip**

In `package.json` set `"version": "2.0.7"`. Then:

```bash
zip -q the-shell-pro-2.0.7.zip package.json README.md LICENSE default.hbs index.hbs home.hbs post.hbs page.hbs page-archives.hbs page-topics.hbs tag.hbs author.hbs error.hbs partials/post-card.hbs partials/navigation.hbs partials/post-type.hbs assets/css/screen.css assets/js/shell.js
unzip -l the-shell-pro-2.0.7.zip | tail -3
shasum -a 256 the-shell-pro-2.0.7.zip
```

Expected: 18 files, SHA-256 printed for the release notes.

- [ ] **Step 4: Report**

Summarize changed files for the user. Do not commit (see Global Constraints) unless the tree is otherwise clean. Remind the user of the two post-deploy Admin steps: populate secondary navigation (Topics, Archive, About, Publications, Buzzwords) and paste the real PGP fingerprint + key URL in Design → theme settings.
