# Footer redesign — first-class site footer

**Date:** 2026-07-28
**Status:** Approved by user (layout + content), pending spec review

## Context

The current footer is a slim two-column bar (`$ site title © year` + RSS/Social/Member links) with an unused `{{navigation type="secondary"}}` slot. Two independent UI/UX reviews rated it the weakest structural element: nearly empty, and the newly created `/topics/` and `/archives/` pages are unreachable from it. The goal is a footer that carries real navigation and in-world Ghost-in-the-Shell flavor without cluttering the design — the user explicitly rejected a topics/tag index column as cluttered.

## Decisions made during brainstorming

- Content: site navigation + terminal colophon. No subscribe block, no social/contact block, no topics index, no build/version line.
- Colophon: keep `$` prompt line and © year; add "last transmission" status line; add PGP fingerprint; keep the RSS/Social/Member utility links.
- Layout: two-column grid (identity/colophon left, `// NAVIGATE` column right) with a utility rail under a divider.
- Link source: Ghost secondary navigation (admin-editable), not hardcoded.
- PGP data: Ghost custom theme settings, not hardcoded in the public theme repo.

## Structure (`default.hbs`)

```
<footer class="site-footer">
  <div class="site-footer__inner">            <!-- two-column grid -->
    <div class="site-footer__identity">
      $ {{@site.title}} © {{year}}            <!-- existing prompt line -->
      independent technical publishing        <!-- existing status line -->
      ● last transmission · <a><time>DD MMM YYYY</time></a>   <!-- latest post -->
      PGP <fingerprint, linked if URL set>    <!-- only if setting non-empty -->
    </div>
    <nav class="site-footer__navigate">       <!-- only if secondary nav set -->
      // navigate                             <!-- eyebrow -->
      {{navigation type="secondary"}}         <!-- vertical link list -->
    </nav>
  </div>
  <div class="site-footer__rail">             <!-- divider above -->
    RSS · Social · Member account             <!-- existing links, unchanged -->
  </div>
</footer>
```

Graceful degradation: with no secondary navigation and no fingerprint configured, the footer renders identity + transmission + rail and still looks intentional.

## Data sources

- **Navigate column:** `{{navigation type="secondary"}}`. The existing `partials/navigation.hbs` secondary branch (`ul.footer-nav__links`) is reused unchanged; only CSS restyles it vertically inside the footer.
- **Last transmission:** `{{#get "posts" limit="1" order="published_at desc"}}` in `default.hbs`; date links to the latest post, rendered in a `<time datetime>`. One cached Content API call per page render.
- **PGP:** new custom settings in `package.json` `config.custom`:
  - `pgp_fingerprint` (text, default "") — shown verbatim in monospace; user controls grouping/spacing.
  - `pgp_key_url` (text, default "") — if set, the fingerprint becomes a link (keyserver or `.asc`).

## Styling (`assets/css/screen.css`)

- Footer padding grows so it reads as a section, not a bar (roughly double current vertical padding); keep the existing top border.
- `.site-footer__inner`: two-column grid, identity column flexible, navigate column auto width; generous gap.
- Transmission line reuses the hero status idiom (`home-hero__status`-style dot, small caps/letterspacing) so hero and footer bookend the page with matching status displays. Decorative `●` and `$` are `aria-hidden`.
- Navigate column: `// navigate` eyebrow, vertical links with ≥32px effective touch targets (addresses reviewer's small-target finding for footer links).
- PGP line: `--shell-mono`, muted color, wraps safely on narrow screens (`overflow-wrap: anywhere`).
- Utility rail: muted, `border-top: 1px solid var(--shell-border)`, existing link styles.
- ≤700px: single column — identity, then navigate, then rail. No new breakpoints beyond the existing 700px block.

## Accessibility

- `<nav aria-label="Footer navigation">` landmark for the navigate column.
- Real `<time datetime="YYYY-MM-DD">` for the transmission date.
- No motion added; existing `prefers-reduced-motion` block already neutralizes animations if any pulse is reused.

## Scope

Files touched: `default.hbs`, `assets/css/screen.css`, `package.json` (custom settings + version bump to 2.0.7). No `shell.js` changes. Admin-side (user, post-deploy): populate secondary navigation (Topics, Archive, About, Publications, Buzzwords), paste PGP fingerprint + key URL in Design settings.

## Verification

- Extend `scripts/seed-preview.mjs` to set secondary navigation and the PGP custom settings so the preview exercises the full footer.
- Extend `scripts/check-preview.mjs` (the existing CDP regression suite) with footer assertions: navigate column renders with the seeded secondary nav, transmission line shows the latest post date as a link, PGP line present when the setting is seeded, utility rail intact, and footer stacks to one column at mobile width.
- Run the full suite via `npm run check:preview` against the Docker preview — all existing checks must stay green alongside the new footer checks.
- Manual pass in the preview at 1440 / 920 / 390 px including the empty-state fallback (no secondary nav, no fingerprint) and keyboard focus through footer links.
- Build `the-shell-pro-2.0.7.zip` with the same file set as 2.0.6.

## Concurrency note

The working tree is receiving parallel user edits (back-to-top relocated into the header actions, post-type fallback suppression, and the checks above). Footer implementation must re-read `default.hbs` and `screen.css` immediately before editing and preserve those changes.
