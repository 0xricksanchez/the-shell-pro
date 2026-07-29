# The Shell Pro

The Shell Pro is a Ghost in the Shell-inspired theme rebuilt for **Ghost 6** and technical writing. Its theme manifest requires Ghost 6.0.0 or newer (including Ghost 6.54.1) and Node 22.12.0 or newer.

![The original theme preview](assets/imgs/preview.jpg)

## What it supports

- Ghost 6 templates and data: `@site`, multiple authors, tag and author archives, responsive feature images, native search, Portal membership links, and optional native Ghost comments
- Current Ghost editor cards through `card_assets: true`: galleries, bookmarks, embeds, audio/video, files, callouts, toggles, products, signup cards, and more
- Technical articles: reading progress; nested, scroll-aware table of contents; numbered figure artifacts; syntax highlighting; filenames, line numbers, and copy buttons for code; horizontally scrollable code and tables; keyboard-friendly image zoom
- Research workflow: semantic post-type badges, labelled research blocks, evidence/reference sections, citation-friendly sharing, and a compact homepage lab index generated from your public topic tags
- Search foundations: Ghost-owned canonical/social/Article metadata, visible BreadcrumbList microdata, crawlable pagination and series links, large image previews, and rendered-route SEO regression checks
- Accessible foundations: skip link, semantic navigation, visible focus states, reduced-motion support, responsive navigation, and an accessible image dialog
- Image performance: HTML-discoverable responsive hero media, Ghost-generated `srcset`s, WebP sources, explicit LCP priority, and lazy listing images

## Installation

1. Create a production upload ZIP containing the active theme files only (not the Docker preview or seed tooling):

   ```sh
   zip -r the-shell-pro-2.0.9.zip package.json README.md LICENSE \
     default.hbs index.hbs home.hbs post.hbs page.hbs page-archives.hbs \
     page-topics.hbs tag.hbs author.hbs error.hbs partials \
     assets/css/screen.css assets/js/shell.js
   ```

2. In Ghost Admin, go to **Settings → Design & branding → Change theme → Upload theme** and upload `the-shell-pro-2.0.9.zip`.
3. Set your publication title, icon/logo, accent color, navigation, cover image, and social links in Ghost Admin. The theme uses Ghost’s own Design settings—there is no separate build step. Enable **Show Ghost comments below technical posts** there only if you want the native discussion widget; it is off by default to preserve the minimal reading surface.

## Navigation and discovery

No destination links are hard-coded into the theme. Configure both the header’s **Primary navigation** and the footer’s **Secondary navigation** in **Ghost Admin → Settings → Site → Navigation**. Each can link to a Ghost page, an automatic tag archive such as `/tag/fuzzing/`, a project subdomain, or any external URL.

Ghost generates a tag archive for every public tag. To add a compact tag directory, publish a normal Ghost Page with the slug **topics**; `page-topics.hbs` is selected automatically and lists all public subject tags with their entry counts. Its title, excerpt, and introductory body remain fully editable in Ghost Admin. Post-type tags (**Field Note**, **Deep Dive**, **Lab Log**, **Tool Release**, **Advisory**) and the local **Preview** tag are deliberately omitted.

For the best discovery paths, make the public subject tag the first (primary) tag on each post—for example **Fuzzing**, **Reverse Engineering**, **Hardware**, **Kernel**, **Exploitation**, or **AI**—then add its post-type tag afterwards. The footer provides chronological previous/next entries and up to three newer entries sharing that primary subject tag.

Use an internal tag beginning with **#series:** to connect a deliberate multi-part sequence, for example **#series: D-Link DIR-3060**. Every post carrying the same internal tag renders a server-side series box ordered by publication date. Internal tags stay out of public topic archives and sitemaps while the linked articles remain directly crawlable.

## SEO and indexing

Keep `{{ghost_head}}` in `default.hbs`: Ghost owns canonical URLs, standard descriptions, Open Graph/X metadata, RSS discovery, and its native WebSite, Article, Series, and Person JSON-LD. The theme deliberately does not duplicate those entities. It adds visible breadcrumb microdata, `max-image-preview:large` on public sites, and an HTML `<picture>` for the homepage cover so the likely LCP resource is discoverable without waiting for CSS.

Complete publication, post, page, tag, and author metadata in Ghost Admin. In particular, write a useful custom excerpt, keep public topic tags coherent, add contextual feature-image alt text, and use the internal **#updated** tag only after a substantive revision. Ghost automatically serves `/robots.txt`, `/sitemap.xml`, and canonical URLs; submit the existing sitemap to Google Search Console and Bing Webmaster Tools instead of creating a competing theme sitemap.

## Technical writing notes

Write code with Ghost’s code card or Markdown fenced code blocks. When an article actually contains code, the theme loads pinned Highlight.js 11.11.1 from cdnjs (plus its x86 assembly module), then adds highlighting, line numbers, and a copy button. Code-free pages make no Highlight.js request. `nasm` code fences are supported. To show a filename in the code toolbar, start a block with `// file: path/to/file.ext` (or `# file: path/to/file.ext`); the marker is removed before highlighting and copying. If your deployment cannot access cdnjs, download that same Highlight.js build and the x86 assembly module into `assets/js/`, then update `highlightBase` and the loader paths in `assets/js/shell.js`.

The table of contents is created from `h2` and `h3` headings in posts and pages, nesting subheadings beneath their nearest major section. It becomes a compact sticky waypoint control on small screens and stays beside the article on larger screens; articles with fewer than two headings automatically collapse to a centred single-column layout. Generated headings also resolve when opened through a copied `#section` link. A slim reading-progress meter appears on article pages. Image and embed figures receive numbered artifact headers, while Ghost code cards remain code artifacts; their images are focusable and open in an enlarged dialog with an **Open original** link, and linked images remain links rather than being intercepted.

To assign a semantic post type, add one public tag named **Field Note**, **Deep Dive**, **Lab Log**, **Tool Release**, or **Advisory**. The first matching tag controls the badge. Posts without one retain the **Research note** fallback in the article header, but omit the low-information fallback badge from listing cards. The homepage lab index automatically lists your public subject tags while excluding these post-type tags and the local preview tag.

Ghost changes `updated_at` during migrations and some administrative edits, so the theme only displays an updated date when a post also carries the internal tag **#updated**. Add that tag when an article has received a meaningful editorial or technical revision; remove it when the timestamp would mislead readers.

For research notes, start a Ghost blockquote with a bold label, for example `> **Lab environment:** …`, `> **Method:** …`, `> **Finding:** …`, or `> **Limitation:** …`. The theme turns recognised labels into compact, colour-coded research blocks. It also recognises **Hypothesis**, **Safety**, and **Reproduction**. Add an `## Evidence & references` heading (or **Sources** / **Further reading**) to group the supporting copy and links in a first-class evidence panel. Every post finishes with **Copy link** and **Copy citation** controls, plus the platform share sheet when the reader’s browser supports it.

The optional **Archive** page template uses the Ghost Page title, excerpt, introductory body, and SEO fields, then lists the latest 100 entries. This limit is intentional: Ghost 6 removed unbounded `limit="all"` API queries. For a site-wide archive larger than 100 posts, create a routed collection with Ghost’s `routes.yaml` rather than using an unbounded theme query.

## Development checks

Ghost validates themes automatically on upload. To run the same compatibility scanner locally:

```sh
npm exec --yes --package=gscan -- gscan /path/to/the-shell-pro
```

The theme has no build tooling or runtime npm dependencies. Edit `assets/css/screen.css`, Handlebars templates, or `assets/js/shell.js` directly.

## Local Ghost 6 preview

`docker-compose.preview.yml` starts an isolated Ghost 6.54.1 + MySQL 8 stack at [http://localhost:2369](http://localhost:2369). For a clean preview with seeded technical articles and metadata:

```sh
docker compose -f docker-compose.preview.yml down -v
docker compose -f docker-compose.preview.yml up -d --build --renew-anon-volumes
node scripts/seed-preview.mjs
npm run check:preview
```

The preview builds a small local image containing the theme beside Ghost’s default theme, then activates it through Ghost’s Themes API. The seeded content exercises long-form copy, pagination, tag/author/static-page metadata, an internal series, nested ToC entries, research blocks, evidence links, code highlighting, uploaded diagrams, image zoom, and sharing/citation controls. `npm run check:preview` launches a local Chrome/Chromium instance and verifies both responsive UI behavior and rendered SEO contracts across home, post, page, tag, author, pagination, archive, and 404 routes. It checks HTTP status, titles, descriptions, canonicals, Open Graph agreement, native Ghost schema, breadcrumbs, crawlable links, image alt semantics, and server-rendered primary content. Set `CHROME_PATH` if the browser is not in a conventional system or Playwright cache location.

After editing theme files, repeat the last two commands. `--renew-anon-volumes` refreshes Ghost's preview-only theme-content volume while preserving the named MySQL database volume; rerunning the seeder restores its uploaded preview diagrams. Stop and remove the local-only database with:

```sh
docker compose -f docker-compose.preview.yml down -v
```

The compose passwords are intentionally fixed, staff-device verification is disabled, and the stack only binds to `127.0.0.1`; it is for previewing only, never deployment.

## License

GPL-3.0. See [LICENSE](LICENSE).
