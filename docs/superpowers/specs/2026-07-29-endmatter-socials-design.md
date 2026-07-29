# End-matter compaction + social icon rail

**Date:** 2026-07-29
**Status:** Approved via interactive mockup (https://claude.ai/code/artifact/7013fada-a632-4e00-aac7-884d9a88ded6)

## Context

Post-2.0.8 review of the live bottom-of-page: the end-matter stack (transmit → tags → author → continue → related) is tall and unevenly spaced (~200px dead zone above transmit, cramped landing on the footer), the tag chip floats orphaned, the rail's "Social" link is vague, and the PGP fingerprint renders unlinked. The user approved a compact restructure plus a social-icon rail via a pixel-faithful before/after mockup (~⅓ height reduction, no content loss).

## Decisions (user-approved)

- Compact restructure — not light tightening, no section cuts (author card stays).
- Social icons live in the footer rail, replacing the "Social" text link.
- Platforms: GitHub, X/Twitter, Bluesky, Mastodon, LinkedIn, Discord, Hack The Box, plus one generic custom URL+label slot. All admin-editable custom settings; empty = hidden.
- Icons are official brand marks from Simple Icons (CC0), inlined as SVG — no runtime CDN requests.

## 1. End-matter compaction (`post.hbs` + `assets/css/screen.css`)

- **Transmit panel absorbs tags:** inside the panel's text column, below the description, a `filed under` label + tag chip row (`{{tags}}` chips unchanged in style). The standalone `article-tags` section is removed from `post.hbs`.
- **Prev/next → single strip:** one bordered row, grid `1fr auto 1fr` with a vertical divider; each side is `← PREV` / `NEXT →` small-caps label + one-line ellipsized title link (`white-space: nowrap; overflow: hidden; text-overflow: ellipsis`). At ≤700px the strip stacks into two rows and the vertical divider is dropped (the rows separate with the strip's internal gap).
- **Author card compact:** avatar ~42px, padding ~1rem 1.2rem, bio at .76rem/1.65.
- **Related cards tighter:** padding ~1rem 1.1rem 1.2rem, grid gap ~.9rem, title margin-top ~.55rem.
- **Rhythm:** the gap between article content end and the transmit divider drops to the standard section spacing (mockup: 3.5rem + 2.4rem, from 9.5rem + 3rem); inter-section gaps ~2.4rem; ~3rem breathing room between related grid and the site footer.
- Exact values are in the approved mockup (`.v-proposed` rules): scratchpad file `endmatter-mockup.html` (this session) — treat the mockup as the visual contract, adapted to the theme's existing class names and clamp() idioms.

## 2. Social icon rail (`partials/social-links.hbs` + `default.hbs` + `package.json` + CSS)

- New settings in `package.json` `config.custom` (9 new, 12/20 total):
  `social_github`, `social_twitter`, `social_bluesky`, `social_mastodon`, `social_linkedin`, `social_discord`, `social_hackthebox` (type text, default "", description "Full URL … leave empty to hide"), plus `social_custom_url` and `social_custom_label` (generic slot; icon renders only when URL set, label feeds the aria-label).
- New `partials/social-links.hbs`: an icon row —
  - RSS icon first, always rendered, linking `{{@site.url}}/rss/` (replaces the "RSS" text link);
  - thin separator;
  - one `<a>` per configured platform, `{{#if @custom.social_*}}` guarded, `rel="me noopener"` (`rel="me"` gives Mastodon profile verification), `aria-label="<Platform> profile"`;
  - inline `<svg viewBox="0 0 24 24">` with `fill: currentColor`, Simple Icons paths (github, x, bluesky, mastodon, linkedin, discord, hackthebox, rss from `simple-icons@13` via jsdelivr; already vendored in the approved mockup — lift the exact markup); generic slot uses the mockup's hand-drawn chain-link glyph (stroke-based, not a brand).
- Rail layout (`default.hbs`): `social-links` partial left, `Member account` link right (members-guarded, unchanged). The `{{#if @site.twitter}}Social{{/if}}` link is removed.
- CSS: icon anchors 2.1rem square hit targets (≥32px), muted `currentColor`, accent + faint accent border on hover, `:focus-visible` ring as elsewhere; icons 17px; row wraps on mobile.

## 3. Footer nav external marker (CSS ± partial)

Extend the header's ↗ convention to the footer: `.footer-nav__links .nav-external a::after` matching the existing `.site-nav__menu .nav-external a::after` rule. If the navigation partial's secondary branch does not currently emit the `nav-external` class, extend it to match the primary branch's detection.

## 4. Out of scope / admin-side (user)

Populating the social URLs, setting `pgp_key_url` (upload `.asc` via an editor file card → `/content/files/...`), reordering secondary navigation site-pages-first, and renaming "Github" → "GitHub" all happen in Ghost Admin. Theme renders whatever is configured.

## Verification

- Seed script: seed all seven platform URLs + the custom pair with `https://example.test/...` fixtures.
- Check suite additions (extend `inspectFooter` / article inspections):
  - transmit panel contains a tag chip; the standalone tags section is absent;
  - prev/next strip renders both links on one row line-height (desktop) and stacks at 390px;
  - rail renders ≥ 9 icon anchors (RSS + 7 platforms + custom), each with `rel~="me"` (RSS exempt) and an aria-label;
  - "Social" text link gone; Member account intact.
- Full `npm run check:preview` green (existing 31 + new checks).
- Manual visual pass at 1440/920/390 against the mockup.
- Release as **2.0.9** (zip + SHA-256), same 18-file list plus `partials/social-links.hbs` (19 files).

## Concurrency note

Same as last cycle: the user edits the tree in parallel; re-read files immediately before editing. Work on a feature branch from current master with per-task commits (user-approved workflow from the footer cycle).
