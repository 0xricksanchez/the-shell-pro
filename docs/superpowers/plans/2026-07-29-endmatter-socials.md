# End-matter Compaction + Social Icon Rail Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Compact the post end-matter (~⅓ shorter, no content loss) and replace the footer rail's "Social" link with a brand-icon row for GitHub/X/Bluesky/Mastodon/LinkedIn/Discord/HackTheBox + a generic custom slot, all admin-configurable.

**Architecture:** Theme-only: Handlebars (`post.hbs`, `default.hbs`, new `partials/social-links.hbs`), CSS (`assets/css/screen.css`), one shell.js selector extension, nine new custom settings (`package.json`). Icons are inline Simple Icons SVGs — no runtime CDN. Verification through the Docker preview + CDP suite.

**Tech Stack:** Ghost 6 Handlebars, vanilla CSS, Node 22 scripts, Chromium CDP checks.

**Spec:** `docs/superpowers/specs/2026-07-29-endmatter-socials-design.md`
**Visual contract (approved mockup):** `/private/tmp/claude-501/-Users-krah-Git-private-the-shell-pro/e7def73c-225a-414a-9d7f-9b08d7ab1649/scratchpad/endmatter-mockup.html` — the `.v-proposed` CSS rules and the `.socials` markup are the source of exact values and icon SVGs.

## Global Constraints

- Branch `endmatter-socials` (already created from master `50febfe`, clean tree). One commit per task, only that task's files.
- The 31 existing CDP checks must stay green throughout; `npm run check:preview` runs them.
- The preview BAKES the theme into the image (`Dockerfile.preview` COPY) — after editing theme files or `package.json`, refresh with:
  `docker compose -f docker-compose.preview.yml build ghost && docker compose -f docker-compose.preview.yml up -d --force-recreate --renew-anon-volumes ghost`, wait for HTTP 200 on http://localhost:2369, then `node scripts/seed-preview.mjs`.
- CSS idiom: 4-space indent, `var(--shell-*)` tokens, BEM-ish names, mobile overrides inside the existing `@media (max-width: 700px)` block.
- Version bumps to 2.0.9 only in the final task. Release zip gains `partials/social-links.hbs` (19 files).
- Re-read files immediately before editing (the repo owner sometimes edits in parallel).

---

### Task 1: Declare social settings and seed fixtures

**Files:**
- Modify: `package.json` (config.custom — currently `show_comments`, `pgp_fingerprint`, `pgp_key_url`)
- Modify: `scripts/seed-preview.mjs` (`configureCustomThemeSettings`)

**Interfaces:**
- Produces: `@custom.social_github`, `@custom.social_twitter`, `@custom.social_bluesky`, `@custom.social_mastodon`, `@custom.social_linkedin`, `@custom.social_discord`, `@custom.social_hackthebox`, `@custom.social_custom_url`, `@custom.social_custom_label` — all type text, default "". Preview seeded with the exact fixture URLs below; Task 2 checks and Task 3 markup depend on the keys and fixtures verbatim.

- [ ] **Step 1: Add the nine settings to package.json** after `pgp_key_url`:

```json
"social_github": {"type": "text", "default": "", "description": "Full GitHub profile URL (leave empty to hide the icon)"},
"social_twitter": {"type": "text", "default": "", "description": "Full X/Twitter profile URL (leave empty to hide the icon)"},
"social_bluesky": {"type": "text", "default": "", "description": "Full Bluesky profile URL (leave empty to hide the icon)"},
"social_mastodon": {"type": "text", "default": "", "description": "Full Mastodon profile URL (leave empty to hide the icon)"},
"social_linkedin": {"type": "text", "default": "", "description": "Full LinkedIn profile URL (leave empty to hide the icon)"},
"social_discord": {"type": "text", "default": "", "description": "Discord server invite URL (leave empty to hide the icon)"},
"social_hackthebox": {"type": "text", "default": "", "description": "Hack The Box profile URL (leave empty to hide the icon)"},
"social_custom_url": {"type": "text", "default": "", "description": "One extra platform URL rendered with a generic link icon"},
"social_custom_label": {"type": "text", "default": "", "description": "Accessible label for the extra platform icon (e.g. HackerOne)"}
```

- [ ] **Step 2: Seed fixtures** — in `scripts/seed-preview.mjs`, extend the `custom_theme_settings` array in `configureCustomThemeSettings` with:

```js
{key: 'social_github', value: 'https://github.com/example'},
{key: 'social_twitter', value: 'https://x.com/example'},
{key: 'social_bluesky', value: 'https://bsky.app/profile/example.test'},
{key: 'social_mastodon', value: 'https://infosec.exchange/@example'},
{key: 'social_linkedin', value: 'https://www.linkedin.com/in/example/'},
{key: 'social_discord', value: 'https://discord.gg/example'},
{key: 'social_hackthebox', value: 'https://app.hackthebox.com/profile/1337'},
{key: 'social_custom_url', value: 'https://hackerone.com/example'},
{key: 'social_custom_label', value: 'HackerOne'}
```

- [ ] **Step 3: Rebuild preview + seed + verify** (build/force-recreate/renew-anon-volumes per Global Constraints, then `node scripts/seed-preview.mjs`). Expected: completes without a validation error from the settings PUT.

- [ ] **Step 4: Commit** `package.json scripts/seed-preview.mjs` — `Declare social link settings and seed preview fixtures`

---

### Task 2: Add failing end-matter + social checks

**Files:**
- Modify: `scripts/check-preview.mjs`

**Interfaces:**
- Consumes: Task 1 fixtures. Selectors later tasks must implement: `.article-actions .article-actions__tags a` (tag chip inside transmit), no `section.article-tags`, `.article-neighbours__strip` (slim strip), `.site-footer__rail .social-links a` (icon anchors).
- Produces: the RED profile Tasks 3–5 turn green.

- [ ] **Step 1: Add `inspectEndmatter()`** after `inspectLongArticle` and register `await inspectEndmatter();` in `main()` after `await inspectFooter();`:

```js
async function inspectEndmatter() {
    await navigate('/breaking-preview-post/'); // use the same long-article slug inspectLongArticle navigates to — read its navigate() call and reuse that exact path
    const desktop = await evaluate(`(() => {
        const actions = document.querySelector('.article-actions');
        const strip = document.querySelector('.article-neighbours__strip');
        const stripBox = strip?.getBoundingClientRect();
        return {
            tagInsideTransmit: Boolean(actions?.querySelector('.article-actions__tags a')),
            standaloneTagsGone: !document.querySelector('section.article-tags'),
            stripHeight: stripBox ? Math.round(stripBox.height) : 0
        };
    })()`);
    check(desktop.tagInsideTransmit, 'transmit panel carries the post tags');
    check(desktop.standaloneTagsGone, 'standalone tags section is gone');
    check(desktop.stripHeight > 0 && desktop.stripHeight <= 88, 'continue-reading strip is a slim single row', String(desktop.stripHeight));

    await navigate(/* same slug */, 390, 844);
    const mobile = await evaluate(`(() => {
        const links = Array.from(document.querySelectorAll('.article-neighbours__strip a'));
        if (links.length < 2) { return {stacked: links.length === 1}; }
        const [a, b] = links.map((link) => link.getBoundingClientRect());
        return {stacked: b.top >= a.bottom};
    })()`);
    check(mobile.stacked, 'continue-reading strip stacks on mobile');
}
```

(The implementer reads `inspectLongArticle` for the actual post path used by the suite and reuses it in both `navigate` calls — the comment above is instruction, not code to keep.)

- [ ] **Step 2: Extend `inspectFooter()`** desktop evaluate with rail-social capture and checks:

Add to the returned object:

```js
socialAnchors: Array.from(footer?.querySelectorAll('.site-footer__rail .social-links a') || []).map((link) => ({
    label: link.getAttribute('aria-label') || '',
    me: (link.getAttribute('rel') || '').split(' ').includes('me')
})),
socialTextLinkGone: !Array.from(footer?.querySelectorAll('.site-footer__rail a') || []).some((link) => link.textContent.trim() === 'Social'),
memberLink: Array.from(footer?.querySelectorAll('.site-footer__rail a') || []).some((link) => link.textContent.trim() === 'Member account')
```

And after the existing footer checks:

```js
    check(desktop.socialAnchors.length >= 9, 'footer rail renders the social icon row', String(desktop.socialAnchors.length));
    check(desktop.socialAnchors.every((anchor) => anchor.label.length > 0), 'every social icon has an accessible label');
    check(desktop.socialAnchors.filter((anchor) => anchor.me).length >= 8, 'profile icons carry rel=me for identity verification', JSON.stringify(desktop.socialAnchors));
    check(desktop.socialTextLinkGone, 'the vague Social text link is gone');
    check(desktop.memberLink, 'member account link survives in the rail');
```

(≥9 anchors = RSS + 7 platforms + custom; ≥8 rel=me = the 7 platforms + custom; RSS is exempt.)

- [ ] **Step 3: Run `npm run check:preview`** — expected: the 31 pre-existing checks PASS; new failures are exactly: tags-in-transmit, standalone-tags-gone, slim-strip (RED), social-row, labels, rel=me, Social-gone (RED). `member account survives` and `strip stacks on mobile` may PASS already or fail on missing strip — record the actual profile in the report. Exit non-zero.

- [ ] **Step 4: Commit** `scripts/check-preview.mjs` — `Add failing checks for compact end-matter and social rail`

---

### Task 3: Social icon rail markup

**Files:**
- Create: `partials/social-links.hbs`
- Modify: `default.hbs` (footer rail block)

**Interfaces:**
- Consumes: Task 1 settings; icon SVGs from the approved mockup.
- Produces: `.site-footer__rail .social-links` DOM that Task 2's checks assert; classes Task 5 styles: `.social-links`, `.social-links__sep`.

- [ ] **Step 1: Extract the icon markup from the mockup.** The mockup's `.socials` block contains the exact inline SVGs (Simple Icons v13 paths for rss, github, x, bluesky, mastodon, linkedin, discord, hackthebox + a hand-drawn generic link glyph). Extract with:

```bash
python3 - <<'EOF'
import re
html = open('/private/tmp/claude-501/-Users-krah-Git-private-the-shell-pro/e7def73c-225a-414a-9d7f-9b08d7ab1649/scratchpad/endmatter-mockup.html').read()
block = re.search(r'<div class="socials">(.*?)</div>\s*<a href="#">Member account</a>', html, re.S).group(1)
open('/tmp/social-icons-fragment.html', 'w').write(block)
print(block[:400])
EOF
```

Fallback if the scratchpad file is missing: `curl -sf https://cdn.jsdelivr.net/npm/simple-icons@13/icons/<name>.svg` for each of rss github x bluesky mastodon linkedin discord hackthebox, and use each file's single `<path d="…">` inside `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="…"/></svg>`.

- [ ] **Step 2: Write `partials/social-links.hbs`** with this structure (SVG contents from Step 1; every icon `<svg viewBox="0 0 24 24" aria-hidden="true">` with the path's `fill` inherited via CSS `currentColor`):

```hbs
<div class="social-links" aria-label="Profiles elsewhere">
    <a href="{{@site.url}}/rss/" aria-label="RSS feed">SVG_RSS</a>
    <span class="social-links__sep" aria-hidden="true"></span>
    {{#if @custom.social_github}}<a href="{{@custom.social_github}}" rel="me noopener" aria-label="GitHub profile">SVG_GITHUB</a>{{/if}}
    {{#if @custom.social_twitter}}<a href="{{@custom.social_twitter}}" rel="me noopener" aria-label="X (Twitter) profile">SVG_X</a>{{/if}}
    {{#if @custom.social_bluesky}}<a href="{{@custom.social_bluesky}}" rel="me noopener" aria-label="Bluesky profile">SVG_BLUESKY</a>{{/if}}
    {{#if @custom.social_mastodon}}<a href="{{@custom.social_mastodon}}" rel="me noopener" aria-label="Mastodon profile">SVG_MASTODON</a>{{/if}}
    {{#if @custom.social_linkedin}}<a href="{{@custom.social_linkedin}}" rel="me noopener" aria-label="LinkedIn profile">SVG_LINKEDIN</a>{{/if}}
    {{#if @custom.social_discord}}<a href="{{@custom.social_discord}}" rel="me noopener" aria-label="Discord server">SVG_DISCORD</a>{{/if}}
    {{#if @custom.social_hackthebox}}<a href="{{@custom.social_hackthebox}}" rel="me noopener" aria-label="Hack The Box profile">SVG_HACKTHEBOX</a>{{/if}}
    {{#if @custom.social_custom_url}}<a href="{{@custom.social_custom_url}}" rel="me noopener" aria-label="{{#if @custom.social_custom_label}}{{@custom.social_custom_label}}{{else}}More{{/if}} profile">SVG_GENERIC</a>{{/if}}
</div>
```

`SVG_*` are the literal inline SVG elements from Step 1 — no placeholders may remain in the committed file.

- [ ] **Step 3: Swap the rail in `default.hbs`** — replace the current rail links block:

```hbs
        <div class="site-footer__rail">
            <div class="site-footer__links" aria-label="Publication links">
                <a href="{{@site.url}}/rss/">RSS</a>
                {{#if @site.twitter}}<a href="{{social_url type="twitter"}}" rel="me">Social</a>{{/if}}
                {{#if @site.members_enabled}}<a href="#/portal/account">Member account</a>{{/if}}
            </div>
        </div>
```

with:

```hbs
        <div class="site-footer__rail">
            <div class="site-footer__rail-inner">
                {{> "social-links"}}
                {{#if @site.members_enabled}}<a class="site-footer__member" href="#/portal/account">Member account</a>{{/if}}
            </div>
        </div>
```

- [ ] **Step 4: Rebuild preview, verify render:** `curl -s http://localhost:2369/ | grep -c 'social-links'` → ≥1; `curl -s http://localhost:2369/ | grep -o 'rel="me noopener"' | wc -l` → 8.

- [ ] **Step 5: Commit** `partials/social-links.hbs default.hbs` — `Replace rail links with social icon row`

---

### Task 4: End-matter markup

**Files:**
- Modify: `post.hbs` (the `article-actions`, `article-tags`, `article-neighbours` sections)

**Interfaces:**
- Consumes: nothing new. Produces: `.article-actions__tags` inside the transmit panel; `section.article-tags` removed; `.article-neighbours__strip` replacing `.article-neighbours__grid`, keeping `article-neighbour--previous/--next` classes for Task 5.

- [ ] **Step 1: Tags into the transmit panel.** In the `article-actions` section's first `<div>` (eyebrow + description), append after the description `<p>`:

```hbs
                    {{#if tags}}
                        <div class="article-actions__tags">
                            <span>filed under</span>
                            {{tags separator=""}}
                        </div>
                    {{/if}}
```

Then delete the whole standalone `{{#if tags}}<section class="article-tags" …>…</section>{{/if}}` block.

- [ ] **Step 2: Slim neighbours strip.** Replace the `article-neighbours__grid` div contents:

```hbs
                <div class="article-neighbours__strip">
                    {{#prev_post}}
                        <a class="article-neighbour article-neighbour--previous" href="{{url}}">
                            <span>← Prev</span>
                            <strong>{{title}}</strong>
                        </a>
                    {{/prev_post}}
                    <span class="article-neighbours__sep" aria-hidden="true"></span>
                    {{#next_post}}
                        <a class="article-neighbour article-neighbour--next" href="{{url}}">
                            <strong>{{title}}</strong>
                            <span>Next →</span>
                        </a>
                    {{/next_post}}
                </div>
```

(Outer `<section class="article-neighbours">` + eyebrow stay; the old `__grid` wrapper and its two boxed children are replaced.)

- [ ] **Step 3: Rebuild preview, verify:** `curl -s http://localhost:2369/<long-post-slug>/ | grep -c 'article-actions__tags'` → 1; `grep -c 'article-neighbours__strip'` → 1; `grep -c 'section class="article-tags"'` → 0.

- [ ] **Step 4: Commit** `post.hbs` — `Fold tags into transmit panel; slim continue-reading strip`

---

### Task 5: CSS + footer ↗ marker

**Files:**
- Modify: `assets/css/screen.css` (`.article-footer` region ~1521–1740, `.site-footer__rail` region, `@media (max-width: 700px)` block)
- Modify: `assets/js/shell.js` (`markCurrentNavigation`, one selector)

**Interfaces:**
- Consumes: DOM from Tasks 3–4; mockup `.v-proposed` values. Produces: all Task 2 checks green; 31 pre-existing checks still green.

- [ ] **Step 1: End-matter compaction rules.** Adapting the mockup's `.v-proposed` values into the existing rules (locate by selector):
  - `.article-footer`: reduce its top margin/padding chain so the gap between article content and the transmit divider ≈ 3.5rem (currently ≈ 9.5rem-equivalent); set inter-section gap ≈ 2.4rem (if `.article-footer` isn't already a grid/flex with gap, convert margin-tops of its child sections to 2.4rem); add ≈ 3rem bottom margin after the related-posts section (before the site footer).
  - New `.article-actions__tags`: `display: flex; align-items: center; gap: .6rem; margin-top: .8rem;` with `> span` at `font-size: .64rem; letter-spacing: .08em; text-transform: uppercase; color: color-mix(in srgb, var(--shell-muted) 80%, transparent);` — tag anchors reuse the existing `.article-tags a` chip styles: move/rename those declarations to cover `.article-actions__tags a`, then delete the now-unused `.article-tags` rules (`.article-tags`, `.article-tags > span`, `.article-tags a`, `.article-tags a:hover`).
  - `.author-card`: padding `1rem 1.2rem`, align-items center; `.author-card > img` 42px; `.author-card p` `.76rem/1.65`.
  - `.article-neighbours__strip`: `display: grid; grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr); align-items: center; gap: 1.2rem; border: 1px solid var(--shell-border); background: rgba(32, 45, 61, .32); padding: .85rem 1.2rem; margin-top: 1rem;` — `.article-neighbour` becomes `display: flex; align-items: baseline; gap: .7rem; min-width: 0; font-size: .85rem; border: 0; background: transparent; padding: 0;` (override or replace the old boxed rules); `> span` label `.64rem` small-caps muted nowrap; `> strong` `white-space: nowrap; overflow: hidden; text-overflow: ellipsis; font-weight: 400; color: var(--shell-text);` with hover accent; `--next` right-aligned (`justify-content: flex-end; text-align: right;`); `.article-neighbours__sep`: `width: 1px; height: 1.4rem; background: var(--shell-border);`. Delete leftover old `.article-neighbour` box styles that no longer apply (keep `.related-post` styles — split any shared selectors first).
  - `.related-post`: padding `1rem 1.1rem 1.2rem`; `.related-posts__grid` gap `.9rem`; `.related-post > strong` margin-top `.55rem`.
- [ ] **Step 2: Social icon CSS** (new block near the footer rules):

```css
.social-links {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: .35rem;
}

.social-links a {
    display: inline-grid;
    width: 2.1rem;
    height: 2.1rem;
    place-items: center;
    border: 1px solid transparent;
    color: var(--shell-muted);
}

.social-links a:hover {
    border-color: color-mix(in srgb, var(--shell-accent) 40%, transparent);
    color: var(--shell-accent);
}

.social-links svg {
    display: block;
    width: 17px;
    height: 17px;
    fill: currentColor;
}

.social-links__sep {
    width: 1px;
    height: 1.2rem;
    margin: 0 .35rem;
    background: var(--shell-border);
}

.site-footer__rail-inner {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    width: min(1240px, calc(100% - 3rem));
    margin: 0 auto;
    padding: .7rem 0;
    gap: .6rem 1.4rem;
    font-size: .72rem;
}

.site-footer__member {
    color: var(--shell-muted);
}
```

Remove the old `.site-footer__rail .site-footer__links` rules (element gone since Task 3); note the generic-link icon in the partial is stroke-based (`fill="none" stroke="currentColor"` on its svg) — it must keep those inline attributes so the fill rule doesn't blank it.

- [ ] **Step 3: Mobile block additions** (inside the existing `@media (max-width: 700px)`): `.article-neighbours__strip { grid-template-columns: 1fr; gap: .65rem; } .article-neighbours__sep { display: none; } .article-neighbour--next { justify-content: flex-start; text-align: left; }`.

- [ ] **Step 4: Footer ↗ marker.** CSS: duplicate the `.site-nav__menu .nav-external a::after` rule (screen.css ~line 247) as `.footer-nav__links .nav-external a::after` next to the footer-nav rules. JS: in `markCurrentNavigation` (shell.js ~line 511) change `doc.querySelectorAll('.site-nav__menu a')` to `doc.querySelectorAll('.site-nav__menu a, .footer-nav__links a')` (external marking and case-insensitive current-marking then cover the footer column too — intended).

- [ ] **Step 5: Rebuild preview + full suite** — `npm run check:preview`: ALL checks green (31 existing + Task 2's new ones), exit 0.

- [ ] **Step 6: Commit** `assets/css/screen.css assets/js/shell.js` — `Compact end-matter, style social rail, extend external markers to footer`

---

### Task 6: Visual pass + release 2.0.9

**Files:**
- Modify: `package.json` (version only)
- Create: `the-shell-pro-2.0.9.zip`

- [ ] **Step 1 (controller): visual pass** at 1440/920/390 against the mockup; empty-state sanity (blank one social setting → icon disappears, no gap).
- [ ] **Step 2: bump version** to `2.0.9`.
- [ ] **Step 3: build zip (19 files)**:

```bash
zip -q the-shell-pro-2.0.9.zip package.json README.md LICENSE default.hbs index.hbs home.hbs post.hbs page.hbs page-archives.hbs page-topics.hbs tag.hbs author.hbs error.hbs partials/post-card.hbs partials/navigation.hbs partials/post-type.hbs partials/social-links.hbs assets/css/screen.css assets/js/shell.js
unzip -l the-shell-pro-2.0.9.zip | tail -3
shasum -a 256 the-shell-pro-2.0.9.zip
```

- [ ] **Step 4: Commit** `package.json the-shell-pro-2.0.9.zip` — `Release 2.0.9: compact end-matter and social icon rail`
