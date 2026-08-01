/*
 * Local verification harness.
 *
 * `npm run check:preview` drives a Ghost instance at localhost:2369, which is a
 * separate deployment — it serves whatever theme was last uploaded there, not
 * the working tree. That makes it useless for verifying changes as you write
 * them.
 *
 * This serves the working tree instead, with real article HTML mirrored from
 * production. Ghost emits root-relative asset paths (`/assets/css/screen.css`),
 * so a mirrored page loads the local stylesheet and script with no rewriting —
 * you get production content rendered by working-tree assets.
 *
 *   node scripts/serve-local.mjs            # serve on :8791
 *   node scripts/serve-local.mjs --refresh  # re-download the mirrored pages
 *
 * Mirrors are cached in .cache/fixtures/ (git-ignored). Not part of the theme.
 */
import {createServer} from 'node:http';
import {readFile, writeFile, mkdir, access} from 'node:fs/promises';
import {extname, join, resolve} from 'node:path';

const ROOT = resolve(import.meta.dirname, '..');
const CACHE = join(ROOT, '.cache', 'fixtures');
const PORT = Number(process.env.PORT || 8791);
const ORIGIN = process.env.MIRROR_ORIGIN || 'https://0x434b.dev';

/* Chosen to cover the layouts that break differently: a long post dense with
 * code, one dense with tables and figures, a short one, the homepage and a tag
 * archive. */
const PAGES = {
    'home': '/',
    'kernel': '/dabbling-with-linux-kernel-exploitation-ctf-challenges-to-learn-the-ropes/',
    'glibc': '/overview-of-glibc-heap-exploitation-techniques/',
    'readme': '/from-a-stale-readme-to-a-security-research-intelligence-platform/',
    'linksys': '/linksys-ea6100_pt1/',
    'tag': '/tag/exploitation/'
};

const TYPES = {
    '.html': 'text/html; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.woff2': 'font/woff2',
    '.svg': 'image/svg+xml',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.webp': 'image/webp',
    '.txt': 'text/plain; charset=utf-8'
};

async function exists(path) {
    try {
        await access(path);
        return true;
    } catch {
        return false;
    }
}

async function mirror(refresh) {
    await mkdir(CACHE, {recursive: true});
    for (const [name, path] of Object.entries(PAGES)) {
        const file = join(CACHE, `${name}.html`);
        if (!refresh && await exists(file)) {
            continue;
        }
        const response = await fetch(ORIGIN + path);
        if (!response.ok) {
            console.warn(`  ${name}: HTTP ${response.status} — skipped`);
            continue;
        }
        await writeFile(file, await response.text());
        console.log(`  mirrored ${name} <- ${path}`);
    }
}

createServer(async (request, response) => {
    const url = new URL(request.url, `http://127.0.0.1:${PORT}`);
    let file;

    if (url.pathname === '/' || url.pathname === '/index.html') {
        const links = Object.keys(PAGES)
            .map((n) => `<li><a href="/p/${n}">${n}</a> — ${PAGES[n]}</li>`).join('');
        response.writeHead(200, {'content-type': TYPES['.html']});
        response.end(`<!doctype html><meta charset=utf-8>
<title>the-shell-pro — local harness</title>
<body style="font:16px system-ui;max-width:44rem;margin:3rem auto;background:#0b0f16;color:#cdd8e4">
<h1>Local verification harness</h1>
<p>Production content, working-tree assets. Serving <code>${ROOT}</code>.</p>
<ul>${links}</ul>`);
        return;
    }

    if (url.pathname.startsWith('/p/')) {
        file = join(CACHE, `${url.pathname.slice(3)}.html`);
    } else {
        // Everything else resolves against the working tree, so /assets/... is live.
        file = join(ROOT, url.pathname);
        if (!file.startsWith(ROOT)) {
            response.writeHead(403);
            response.end('forbidden');
            return;
        }
    }

    try {
        const body = await readFile(file);
        response.writeHead(200, {
            'content-type': TYPES[extname(file)] || 'application/octet-stream',
            'cache-control': 'no-store'
        });
        response.end(body);
    } catch {
        response.writeHead(404, {'content-type': TYPES['.html']});
        response.end('not found: ' + url.pathname);
    }
}).listen(PORT, '127.0.0.1', async () => {
    console.log('mirroring fixtures...');
    await mirror(process.argv.includes('--refresh'));
    console.log(`\nlocal harness  http://127.0.0.1:${PORT}/`);
    for (const name of Object.keys(PAGES)) {
        console.log(`  http://127.0.0.1:${PORT}/p/${name}`);
    }
});
