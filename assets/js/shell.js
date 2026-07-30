/* global hljs */
(function () {
    'use strict';

    var doc = document;
    var highlightBase = 'https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.11.1/';
    var codeWrapKey = 'the-shell-pro:code-wrap';
    var readerPreferencesKey = 'the-shell-pro:reader';
    var longCodeThreshold = 24;

    function loadScript(source) {
        return new Promise(function (resolve, reject) {
            var existing = doc.querySelector('script[src="' + source + '"]');
            if (existing) {
                if (existing.dataset.loaded === 'true') {
                    resolve();
                    return;
                }
                existing.addEventListener('load', resolve, {once: true});
                existing.addEventListener('error', reject, {once: true});
                return;
            }

            var script = doc.createElement('script');
            script.src = source;
            script.referrerPolicy = 'no-referrer';
            script.addEventListener('load', function () {
                script.dataset.loaded = 'true';
                resolve();
            }, {once: true});
            script.addEventListener('error', reject, {once: true});
            doc.head.appendChild(script);
        });
    }

    function loadSyntaxHighlighting() {
        if (!doc.querySelector('[data-post-content] pre')) {
            return Promise.resolve();
        }
        var core = window.hljs
            ? Promise.resolve()
            : loadScript(highlightBase + 'highlight.min.js');
        return core.then(function () {
            // x86asm backs the nasm/asm aliases. Load it even when hljs was
            // already on the page (injected by a card or another script);
            // otherwise assembly listings silently lose highlighting.
            if (!window.hljs || window.hljs.getLanguage('x86asm')) {
                return undefined;
            }
            return loadScript(highlightBase + 'languages/x86asm.min.js');
        });
    }

    function registerTechnicalAliases() {
        if (!window.hljs || typeof window.hljs.registerAliases !== 'function') {
            return;
        }
        if (!window.hljs.getLanguage('nasm') && window.hljs.getLanguage('x86asm')) {
            window.hljs.registerAliases('nasm', {languageName: 'x86asm'});
        }
    }

    function copyText(text) {
        if (navigator.clipboard && window.isSecureContext) {
            return navigator.clipboard.writeText(text);
        }

        return new Promise(function (resolve, reject) {
            var previousFocus = doc.activeElement;
            var textarea = doc.createElement('textarea');
            textarea.value = text;
            textarea.setAttribute('readonly', '');
            textarea.style.position = 'fixed';
            textarea.style.opacity = '0';
            doc.body.appendChild(textarea);
            textarea.select();
            try {
                if (!doc.execCommand('copy')) {
                    throw new Error('Copy command was rejected');
                }
                resolve();
            } catch (error) {
                reject(error);
            } finally {
                textarea.remove();
                // Selecting the scratch textarea moved focus off the button the
                // reader pressed; put it back so the keyboard path is unbroken.
                if (previousFocus && typeof previousFocus.focus === 'function') {
                    previousFocus.focus();
                }
            }
        });
    }

    var languageLabels = {
        asm: 'Assembly', bash: 'Bash', c: 'C', cmake: 'CMake', console: 'Console',
        cpp: 'C++', cs: 'C#', csharp: 'C#', css: 'CSS', diff: 'Diff',
        dockerfile: 'Dockerfile', go: 'Go', golang: 'Go', haskell: 'Haskell',
        html: 'HTML', ini: 'INI', java: 'Java', javascript: 'JavaScript',
        js: 'JavaScript', json: 'JSON', kotlin: 'Kotlin', lua: 'Lua',
        make: 'Makefile', makefile: 'Makefile', markdown: 'Markdown', md: 'Markdown',
        nasm: 'NASM', objectivec: 'Objective-C', patch: 'Diff', perl: 'Perl',
        php: 'PHP', powershell: 'PowerShell', ps1: 'PowerShell', py: 'Python',
        python: 'Python', rb: 'Ruby', ruby: 'Ruby', rs: 'Rust', rust: 'Rust',
        scala: 'Scala', sh: 'Shell', shell: 'Shell', sql: 'SQL', swift: 'Swift',
        toml: 'TOML', ts: 'TypeScript', typescript: 'TypeScript', xml: 'XML',
        x86asm: 'x86 assembly', yaml: 'YAML', yml: 'YAML', zsh: 'Zsh'
    };

    function languageIdentifier(code) {
        // Anchored at a class boundary so names such as "erlang-example" cannot
        // masquerade as a language, and read from the <pre> too because some
        // editors put the hint on the wrapper rather than the <code>.
        var pre = code.parentElement;
        var source = code.className + ' ' + (pre ? pre.className : '');
        var match = source.match(/(?:^|\s)(?:language|lang)-([a-z0-9+#_-]+)/i);
        return match ? match[1].toLowerCase() : '';
    }

    function languageName(identifier) {
        if (!identifier) {
            return 'Plain text';
        }
        if (Object.prototype.hasOwnProperty.call(languageLabels, identifier)) {
            return languageLabels[identifier];
        }
        return identifier.replace(/[-_]/g, ' ');
    }

    function readStorage(key) {
        try {
            return window.localStorage.getItem(key);
        } catch (error) {
            return null;
        }
    }

    function writeStorage(key, value) {
        try {
            if (value === null) {
                window.localStorage.removeItem(key);
            } else {
                window.localStorage.setItem(key, value);
            }
        } catch (error) {
            // Preferences remain available for the current page when storage
            // is unavailable or deliberately blocked.
        }
    }

    var liveRegion = null;
    var announceTimer = 0;

    /*
     * Transient button feedback ("Copied", "Saved") is a visual-only signal, so
     * every such message is mirrored here for assistive technology. The buttons
     * keep a stable accessible name; status goes through this region instead.
     */
    function announce(message) {
        if (!liveRegion) {
            liveRegion = doc.createElement('p');
            liveRegion.className = 'visually-hidden';
            liveRegion.setAttribute('role', 'status');
            liveRegion.setAttribute('aria-live', 'polite');
            doc.body.appendChild(liveRegion);
        }
        // Clearing first makes a repeated identical message announce again.
        liveRegion.textContent = '';
        window.clearTimeout(announceTimer);
        announceTimer = window.setTimeout(function () {
            liveRegion.textContent = message;
        }, 60);
    }

    function filenameFor(pre, code) {
        return pre.dataset.filename || code.dataset.filename || '';
    }

    function filenameFromSource(code) {
        // Operate on the leading text node rather than code.textContent, which
        // would flatten any markup the editor emitted inside the block.
        var first = code.firstChild;
        if (!first || first.nodeType !== 3) {
            return '';
        }
        var match = first.nodeValue.match(/^(?:\/\/|#|;)[ \t]*file:[ \t]*([^\n]*)\n/);
        if (!match) {
            return '';
        }
        first.nodeValue = first.nodeValue.slice(match[0].length);
        return match[1].trim();
    }

    function addLineNumbers(wrapper, code) {
        var lineCount = code.textContent.replace(/\n$/, '').split('\n').length;
        if (lineCount < 2) {
            return lineCount;
        }
        var numbers = doc.createElement('ol');
        numbers.className = 'code-line-numbers';
        numbers.setAttribute('aria-hidden', 'true');
        for (var index = 1; index <= lineCount; index += 1) {
            var line = doc.createElement('li');
            line.textContent = String(index);
            numbers.appendChild(line);
        }
        wrapper.classList.add('shell-code-block--numbered');
        wrapper.appendChild(numbers);
        return lineCount;
    }

    function safeDownloadName(file, language) {
        var name = (file || '').split(/[\\/]/).filter(Boolean).pop() || '';
        name = name.replace(/[\u0000-\u001f<>:"|?*]/g, '-').trim();
        if (name) {
            return name;
        }
        return 'code-snippet' + (language ? '.' + language.replace(/[^a-z0-9]+/gi, '') : '.txt');
    }

    function downloadCode(source, file, language) {
        var name = safeDownloadName(file, language);
        var url = URL.createObjectURL(new Blob([source], {type: 'text/plain;charset=utf-8'}));
        var link = doc.createElement('a');
        link.href = url;
        link.download = name;
        link.hidden = true;
        doc.body.appendChild(link);
        link.click();
        link.remove();
        window.setTimeout(function () { URL.revokeObjectURL(url); }, 0);
    }

    function createCodeButton(className, label, accessibleLabel) {
        var button = doc.createElement('button');
        button.type = 'button';
        button.className = 'shell-code-action ' + className;
        button.textContent = label;
        button.setAttribute('aria-label', accessibleLabel);
        return button;
    }

    /*
     * How many lines a collapsed block previews. The value lives in CSS as
     * --code-preview-lines and is read back here so the button label and the
     * clip height can never disagree.
     */
    function previewLineCount(element) {
        // Resolved against the block itself so a scoped override of the token
        // still produces a label that matches what the block actually shows.
        var raw = window.getComputedStyle(element || doc.documentElement)
            .getPropertyValue('--code-preview-lines');
        var value = parseInt(raw, 10);
        return value > 0 ? value : 16;
    }

    function stickyHeaderOffset() {
        var header = doc.querySelector('.site-header');
        return Math.round(header ? header.getBoundingClientRect().height : 0) + 16;
    }

    /*
     * Brings a block's top edge back below the sticky header when it has been
     * scrolled past. Instant rather than smooth: this is a correction that keeps
     * the reader where they were, not a navigation they asked for.
     */
    function revealBlockTop(wrapper) {
        var offset = stickyHeaderOffset();
        var top = wrapper.getBoundingClientRect().top;
        if (top < offset) {
            window.scrollBy({top: top - offset, left: 0, behavior: 'instant'});
        }
    }

    /*
     * A horizontally scrolling region has to be reachable without a mouse
     * (WCAG 2.1.1), but a permanent tab stop on every listing would clutter the
     * tab order. The <pre> therefore becomes focusable only while it actually
     * overflows.
     */
    function syncScrollableRegion(wrapper) {
        var pre = wrapper.querySelector('pre');
        if (!pre) {
            return;
        }
        var scrolls = pre.scrollWidth > pre.clientWidth + 1;
        wrapper.classList.toggle('shell-code-block--scrolls', scrolls);
        if (scrolls) {
            pre.setAttribute('tabindex', '0');
            pre.setAttribute('role', 'region');
            pre.setAttribute('aria-label', wrapper.dataset.regionLabel || 'Code listing');
        } else {
            pre.removeAttribute('tabindex');
            pre.removeAttribute('role');
            pre.removeAttribute('aria-label');
        }
    }

    function syncAllScrollableRegions() {
        doc.querySelectorAll('.shell-code-block').forEach(syncScrollableRegion);
    }

    /*
     * Whether a listing overflows depends on the viewport and on the reader's
     * width/text-size settings, so the focusable-region state is re-evaluated
     * whenever the layout changes rather than only once at enhancement time.
     */
    function watchCodeBlockOverflow() {
        var frame = 0;
        var schedule = function () {
            window.cancelAnimationFrame(frame);
            frame = window.requestAnimationFrame(syncAllScrollableRegions);
        };
        window.addEventListener('resize', schedule, {passive: true});
        if (typeof ResizeObserver === 'function') {
            var content = doc.querySelector('[data-post-content]');
            if (content) {
                new ResizeObserver(schedule).observe(content);
            }
        }
    }

    function setCodeWrapping(wrapped, persist) {
        doc.querySelectorAll('.shell-code-block').forEach(function (wrapper) {
            wrapper.classList.toggle('shell-code-block--wrapped', wrapped);
            var button = wrapper.querySelector('[data-code-wrap]');
            if (button) {
                // The label stays put: aria-pressed carries the state. Renaming
                // it to the opposite action made screen readers announce
                // "Scroll, pressed", which says the opposite of what is true.
                button.setAttribute('aria-pressed', String(wrapped));
            }
            syncScrollableRegion(wrapper);
        });
        if (persist) {
            writeStorage(codeWrapKey, wrapped ? 'wrap' : 'scroll');
            announce(wrapped
                ? 'Long lines now wrap in every code block'
                : 'Code blocks now scroll long lines');
        }
    }

    function enhanceCodeBlocks() {
        var preferredWrap = readStorage(codeWrapKey) === 'wrap';
        var used = new Set(Array.from(doc.querySelectorAll('[id]')).map(function (element) {
            return element.id;
        }));
        var codeIndex = 0;
        // Iterate <pre>, not "pre > code": a listing pasted without a <code>
        // child would otherwise get none of the affordances its neighbours have.
        doc.querySelectorAll('[data-post-content] pre').forEach(function (pre) {
            if (pre.parentElement.classList.contains('shell-code-block')) {
                return;
            }
            var code = pre.querySelector(':scope > code');
            if (!code) {
                code = doc.createElement('code');
                while (pre.firstChild) {
                    code.appendChild(pre.firstChild);
                }
                pre.appendChild(code);
            }

            // Always strip the "// file:" hint, even when data-filename already
            // named the block, so the marker never leaks into the rendered
            // listing, the copy payload or the download.
            var declaredName = filenameFromSource(code);
            var file = filenameFor(pre, code) || declaredName;
            var language = languageIdentifier(code);
            var source = code.textContent;
            if (!source.trim()) {
                return;
            }
            codeIndex += 1;
            ensureId(pre, 'code-source-' + codeIndex, used);
            code.dataset.shellLanguage = language;

            var wrapper = doc.createElement('div');
            wrapper.className = 'shell-code-block '
                + (file ? 'shell-code-block--identified' : 'shell-code-block--anonymous');
            wrapper.dataset.filename = file;
            wrapper.dataset.language = language;
            wrapper.dataset.regionLabel = (file || languageName(language)) + ' listing';
            pre.parentNode.insertBefore(wrapper, pre);
            wrapper.appendChild(pre);

            // The header is unconditional. Gating it on a filename left every
            // block on a filename-less site with a reserved but empty bar and no
            // way to tell what language it was reading.
            var toolbar = doc.createElement('div');
            toolbar.className = 'shell-code-toolbar';
            var identity = doc.createElement('span');
            identity.className = 'shell-code-toolbar__identity';
            if (file) {
                var filename = doc.createElement('span');
                filename.className = 'shell-code-toolbar__file';
                filename.textContent = file;
                identity.appendChild(filename);
            }
            var label = doc.createElement('span');
            label.className = 'shell-code-toolbar__language';
            label.textContent = languageName(language);
            identity.appendChild(label);
            toolbar.appendChild(identity);

            var actions = doc.createElement('span');
            actions.className = 'shell-code-toolbar__actions';
            // Wrapping is a saved reading preference that applies to the whole
            // page, so the name says so rather than implying it is local.
            var wrap = createCodeButton(
                'shell-code-wrap',
                'Wrap',
                'Wrap long lines in every code block'
            );
            wrap.dataset.codeWrap = '';
            wrap.setAttribute('aria-pressed', 'false');
            wrap.addEventListener('click', function () {
                setCodeWrapping(wrap.getAttribute('aria-pressed') !== 'true', true);
            });
            actions.appendChild(wrap);

            if (file) {
                var download = createCodeButton(
                    'shell-code-download',
                    'Download',
                    'Download ' + safeDownloadName(file, language)
                );
                download.dataset.codeDownload = '';
                download.addEventListener('click', function () {
                    try {
                        downloadCode(source, file, language);
                        actionFeedback(download, 'Saved');
                    } catch (error) {
                        actionFeedback(download, 'Download failed');
                    }
                });
                actions.appendChild(download);
            }

            var copy = createCodeButton('copy-code', 'Copy', 'Copy code block');
            copy.addEventListener('click', function () {
                copyText(source).then(function () {
                    actionFeedback(copy, 'Copied');
                }).catch(function () {
                    // The failure label resets like the success one; leaving it
                    // pinned made a single denied clipboard call look permanent.
                    actionFeedback(copy, 'Copy failed');
                });
            });
            actions.appendChild(copy);

            toolbar.appendChild(actions);
            wrapper.insertBefore(toolbar, pre);
            var lineCount = addLineNumbers(wrapper, code);

            if (lineCount > longCodeThreshold) {
                var previewLines = previewLineCount(wrapper);
                var collapseLabel = 'Collapse to ' + previewLines + '-line preview';
                var expandLabel = 'Show all ' + lineCount + ' lines';
                wrapper.classList.add('shell-code-block--collapsible', 'shell-code-block--collapsed');
                var expand = createCodeButton('shell-code-expand', expandLabel, expandLabel);
                expand.dataset.codeExpand = '';
                expand.setAttribute('aria-expanded', 'false');
                expand.setAttribute('aria-controls', pre.id);
                expand.addEventListener('click', function () {
                    var expanded = expand.getAttribute('aria-expanded') !== 'true';
                    wrapper.classList.toggle('shell-code-block--collapsed', !expanded);
                    expand.setAttribute('aria-expanded', String(expanded));
                    expand.textContent = expanded ? collapseLabel : expandLabel;
                    expand.setAttribute('aria-label', expand.textContent);
                    if (!expanded) {
                        // Collapsing removes height above the button that was
                        // just clicked, so everything below slides up and the
                        // reader lands somewhere further down the article. Pull
                        // the block back into view to keep their place.
                        revealBlockTop(wrapper);
                    }
                    syncScrollableRegion(wrapper);
                });
                wrapper.appendChild(expand);
            }
            syncScrollableRegion(wrapper);
        });
        setCodeWrapping(preferredWrap, false);
    }

    function highlightCodeBlocks() {
        doc.querySelectorAll('[data-post-content] pre > code').forEach(function (code) {
            var language = code.dataset.shellLanguage || '';
            /*
             * Only ever highlight a language the author declared. Letting
             * highlight.js auto-detect the rest meant it guessed confidently and
             * wrongly on everything that is not source: ASCII diagrams came out
             * as C++, key/value listings as CSS, and bare English words inside
             * box-drawing art were painted as keywords. An unstyled listing is
             * strictly better than a confidently mislabelled one.
             */
            if (window.hljs && !code.dataset.highlighted && language && window.hljs.getLanguage(language)) {
                try {
                    window.hljs.highlightElement(code);
                } catch (error) {
                    // Highlighting is optional; preserve the readable local
                    // code-block UI if a third-party grammar fails.
                }
            }
        });
        // Tokenising can change a listing's intrinsic width, so re-evaluate
        // which blocks actually scroll.
        syncAllScrollableRegions();
    }

    function enhanceRawEmbeds() {
        var content = doc.querySelector('[data-post-content]');
        if (!content) {
            return;
        }

        content.querySelectorAll('iframe').forEach(function (iframe) {
            if (iframe.closest('.raw-embed-frame')) {
                return;
            }

            if (!iframe.hasAttribute('title')) {
                var host = '';
                try {
                    host = new URL(iframe.src, doc.baseURI).hostname;
                } catch (error) {
                    // Keep the generic accessible title for malformed URLs.
                }
                iframe.title = host ? 'Embedded content from ' + host : 'Embedded content';
            }

            var width = Number(iframe.getAttribute('width'));
            var height = Number(iframe.getAttribute('height'));
            if (!(width > 0 && height > 0)) {
                return;
            }
            var frame = doc.createElement('div');
            frame.className = 'raw-embed-frame';
            frame.style.setProperty('--raw-embed-ratio', width + ' / ' + height);
            iframe.parentNode.insertBefore(frame, iframe);
            frame.appendChild(iframe);
        });
    }

    function enhanceFigures() {
        var content = doc.querySelector('[data-post-content]');
        if (!content) {
            return;
        }

        var figureNumber = 0;
        Array.from(content.querySelectorAll('figure')).forEach(function (figure) {
            if (figure.querySelector('.figure-artifact') || figure.classList.contains('kg-code-card') || figure.querySelector('pre')) {
                return;
            }
            figureNumber += 1;
            var artifact = doc.createElement('div');
            artifact.className = 'figure-artifact';
            var number = doc.createElement('span');
            number.className = 'figure-artifact__number';
            number.textContent = 'Fig. ' + String(figureNumber).padStart(2, '0');
            var hint = doc.createElement('span');
            hint.className = 'figure-artifact__hint';
            hint.textContent = figure.querySelector('img') ? 'select to inspect' : 'research artifact';
            artifact.append(number, hint);
            figure.insertBefore(artifact, figure.firstChild);
        });
    }

    function enhanceArticleTitle() {
        var header = doc.querySelector('.article-header');
        var title = header && header.querySelector('h1');
        if (!title) {
            return;
        }
        var length = title.textContent.trim().length;
        if (length >= 72) {
            header.classList.add('article-header--long-title');
        }
        if (length >= 108) {
            header.classList.add('article-header--very-long-title');
        }
    }

    function enhanceSeriesNavigation() {
        doc.querySelectorAll('.article-series').forEach(function (series) {
            var heading = series.querySelector('h2');
            var links = Array.from(series.querySelectorAll('ol a'));
            var currentIndex = links.findIndex(function (link) {
                return link.pathname === window.location.pathname;
            });
            if (heading) {
                heading.textContent = heading.textContent.replace(/^#series:\s*/i, '');
            }
            if (currentIndex < 0) {
                return;
            }
            var current = links[currentIndex];
            current.setAttribute('aria-current', 'page');
            current.closest('li').classList.add('article-series__current');
            var status = doc.createElement('p');
            status.className = 'article-series__status';
            status.textContent = 'Part ' + (currentIndex + 1) + ' of ' + links.length;
            heading.insertAdjacentElement('afterend', status);
        });
    }

    function researchBlockKind(label) {
        var normalized = label.toLowerCase();
        if (/(environment|toolchain|prerequisite|setup)/.test(normalized)) return 'environment';
        if (/(hypothesis|question|invariant)/.test(normalized)) return 'hypothesis';
        if (/(method|methodology|approach|procedure)/.test(normalized)) return 'method';
        if (/(finding|result|observation|evidence)/.test(normalized)) return 'finding';
        if (/(limitation|caveat|failure mode)/.test(normalized)) return 'limitation';
        if (/(safety|ethics|scope)/.test(normalized)) return 'safety';
        if (/(reproduction|reproduce|verification)/.test(normalized)) return 'reproduction';
        return '';
    }

    function enhanceResearchBlocks() {
        var content = doc.querySelector('[data-post-content]');
        if (!content) {
            return;
        }
        content.querySelectorAll('blockquote').forEach(function (quote) {
            // Ghost serializes a Markdown blockquote as a direct <strong>, while
            // HTML pasted into the editor may retain a wrapping paragraph.
            var label = quote.querySelector('p > strong:first-child, strong:first-child');
            if (!label || quote.classList.contains('research-block')) {
                return;
            }
            var labelText = label.textContent.replace(/[:：]\s*$/, '').trim();
            var kind = researchBlockKind(labelText);
            if (!kind) {
                return;
            }
            quote.classList.add('research-block', 'research-block--' + kind);
            quote.dataset.researchLabel = labelText;
        });
    }

    function slugify(value) {
        return value.toLowerCase().trim().normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .replace(/[^\w\s-]/g, '')
            .replace(/[\s_-]+/g, '-')
            .replace(/^-+|-+$/g, '') || 'section';
    }

    function ensureId(element, preferred, used) {
        if (element.id) {
            used.add(element.id);
            return element.id;
        }
        var base = preferred;
        var id = base;
        var count = 2;
        while (used.has(id)) {
            id = base + '-' + count;
            count += 1;
        }
        element.id = id;
        used.add(id);
        return id;
    }

    function conciseLabel(value, fallback) {
        var label = (value || '').replace(/\s+/g, ' ').trim();
        if (!label) {
            return fallback;
        }
        return label.length > 76 ? label.slice(0, 73).trimEnd() + '…' : label;
    }

    function createArticleModel() {
        var content = doc.querySelector('[data-post-content]');
        if (!content) {
            return null;
        }
        var used = new Set(Array.from(doc.querySelectorAll('[id]')).map(function (element) {
            return element.id;
        }));
        var sections = Array.from(content.querySelectorAll('h1, h2, h3, h4, h5'));
        sections.forEach(function (heading) {
            ensureId(heading, slugify(heading.textContent), used);
        });

        var candidates = [];
        content.querySelectorAll('.shell-code-block').forEach(function (element) {
            candidates.push({element: element, type: 'code'});
        });
        content.querySelectorAll('figure').forEach(function (element) {
            if (element.querySelector('pre') || element.classList.contains('kg-file-card')) {
                return;
            }
            candidates.push({element: element, type: 'figure'});
        });
        content.querySelectorAll('table').forEach(function (element) {
            candidates.push({element: element, type: 'table'});
        });
        content.querySelectorAll('.kg-file-card').forEach(function (element) {
            candidates.push({element: element, type: 'file'});
        });
        content.querySelectorAll('.research-section--evidence').forEach(function (element) {
            candidates.push({element: element, type: 'evidence'});
        });
        candidates.sort(function (left, right) {
            return left.element.compareDocumentPosition(right.element) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1;
        });

        var typeCounts = {};
        var artifacts = candidates.map(function (candidate) {
            typeCounts[candidate.type] = (typeCounts[candidate.type] || 0) + 1;
            var index = typeCounts[candidate.type];
            var label = '';
            if (candidate.type === 'code') {
                label = candidate.element.dataset.filename
                    || (candidate.element.dataset.language
                        ? languageName(candidate.element.dataset.language) + ' snippet'
                        : 'Code snippet');
            } else if (candidate.type === 'figure') {
                var caption = candidate.element.querySelector('figcaption');
                var image = candidate.element.querySelector('img');
                label = (caption && caption.textContent) || (image && image.alt) || 'Research figure';
            } else if (candidate.type === 'table') {
                var tableCaption = candidate.element.querySelector('caption');
                var firstHeading = candidate.element.querySelector('th');
                label = (tableCaption && tableCaption.textContent)
                    || (firstHeading && firstHeading.textContent)
                    || 'Data table';
            } else if (candidate.type === 'file') {
                var fileTitle = candidate.element.querySelector(
                    '.kg-file-card-title, .kg-file-card-filename, a[download]'
                );
                label = (fileTitle && fileTitle.textContent) || 'Downloadable file';
            } else {
                var evidenceHeading = candidate.element.querySelector('h2, h3');
                label = (evidenceHeading && evidenceHeading.textContent) || 'Evidence trail';
            }
            return {
                element: candidate.element,
                id: ensureId(candidate.element, candidate.type + '-' + index, used),
                index: index,
                label: conciseLabel(label, 'Research artifact'),
                type: candidate.type
            };
        });

        return {
            content: content,
            sections: sections,
            artifacts: artifacts
        };
    }

    function outlineNavigation(sections) {
        var list = doc.createElement('ol');
        list.className = 'toc__list';
        list.id = 'article-outline-list';
        var links = new Map();
        var outline = [];
        sections.forEach(function (heading) {
            var level = Number(heading.tagName.slice(1));
            var item = doc.createElement('li');
            item.className = 'toc__item toc__item--level-' + level;
            var link = doc.createElement('a');
            link.href = '#' + heading.id;
            link.textContent = heading.textContent;
            item.appendChild(link);

            while (outline.length && outline[outline.length - 1].level >= level) {
                outline.pop();
            }

            var parent = outline[outline.length - 1];
            var targetList = list;
            if (parent) {
                if (!parent.childList) {
                    parent.childList = doc.createElement('ol');
                    parent.item.appendChild(parent.childList);
                }
                targetList = parent.childList;
            }
            targetList.appendChild(item);
            outline.push({level: level, item: item, childList: null});
            links.set(heading.id, link);
        });
        return {list: list, links: links};
    }

    function artifactNavigation(artifacts) {
        var labels = {
            code: 'Code',
            figure: 'Figure',
            table: 'Table',
            file: 'File',
            evidence: 'Evidence'
        };
        var list = doc.createElement('ol');
        list.className = 'toc__artifact-list';
        list.id = 'article-artifact-list';
        var links = new Map();
        artifacts.forEach(function (artifact) {
            var item = doc.createElement('li');
            item.className = 'toc__artifact-item toc__artifact-item--' + artifact.type;
            var link = doc.createElement('a');
            link.href = '#' + artifact.id;
            var kind = doc.createElement('span');
            kind.className = 'toc__artifact-kind';
            kind.textContent = labels[artifact.type] + ' ' + String(artifact.index).padStart(2, '0') + ' ';
            var label = doc.createElement('span');
            label.className = 'toc__artifact-label';
            label.textContent = artifact.label;
            link.append(kind, label);
            item.appendChild(link);
            list.appendChild(item);
            links.set(artifact.id, link);
        });
        return {list: list, links: links};
    }

    function enhanceArticleNavigation(model) {
        var toc = doc.querySelector('[data-toc]');
        var container = doc.querySelector('[data-toc-container]');
        if (!model || !toc || !container) {
            return;
        }
        var sections = model.sections.length >= 2 ? model.sections : [];
        var artifacts = model.artifacts.length >= 2 ? model.artifacts : [];
        var layout = container.closest('.article-layout');
        if (!sections.length && !artifacts.length) {
            container.hidden = true;
            if (layout) {
                layout.classList.add('article-layout--without-toc');
            }
            return;
        }
        container.hidden = false;
        if (layout) {
            layout.classList.remove('article-layout--without-toc');
        }

        var title = toc.querySelector('.toc__title');
        title.textContent = sections.length && artifacts.length
            ? 'Research map'
            : (sections.length ? 'On this page' : 'Artifacts');
        var count = doc.createElement('p');
        count.className = 'toc__count';
        title.insertAdjacentElement('afterend', count);

        var toggle = doc.createElement('button');
        toggle.type = 'button';
        toggle.className = 'toc__toggle';
        toggle.setAttribute('aria-controls', 'article-navigation');
        count.insertAdjacentElement('afterend', toggle);

        var body = doc.createElement('div');
        body.className = 'toc__body';
        body.id = 'article-navigation';
        toc.appendChild(body);

        var views = {};
        if (sections.length) {
            var outline = outlineNavigation(sections);
            var outlinePanel = doc.createElement('div');
            outlinePanel.className = 'toc__panel';
            outlinePanel.id = 'article-outline-panel';
            outlinePanel.dataset.tocPanel = 'outline';
            outlinePanel.appendChild(outline.list);
            views.outline = {
                count: sections.length,
                items: sections,
                label: 'waypoints',
                links: outline.links,
                panel: outlinePanel
            };
        }
        if (artifacts.length) {
            var artifact = artifactNavigation(artifacts);
            var artifactPanel = doc.createElement('div');
            artifactPanel.className = 'toc__panel';
            artifactPanel.id = 'article-artifact-panel';
            artifactPanel.dataset.tocPanel = 'artifacts';
            artifactPanel.appendChild(artifact.list);
            views.artifacts = {
                count: artifacts.length,
                items: artifacts.map(function (item) { return item.element; }),
                label: 'artifacts',
                links: artifact.links,
                panel: artifactPanel
            };
        }

        var viewNames = Object.keys(views);
        var activeView = viewNames[0];
        var tabs = new Map();
        if (viewNames.length > 1) {
            toc.classList.add('toc--mapped');
            var tablist = doc.createElement('div');
            tablist.className = 'toc__tabs';
            tablist.setAttribute('role', 'tablist');
            tablist.setAttribute('aria-label', 'Article navigation');
            viewNames.forEach(function (name) {
                var tab = doc.createElement('button');
                tab.type = 'button';
                tab.className = 'toc__tab';
                tab.id = 'article-' + name + '-tab';
                tab.dataset.tocView = name;
                tab.setAttribute('role', 'tab');
                tab.setAttribute('aria-controls', views[name].panel.id);
                tab.innerHTML = (name === 'outline' ? 'Outline' : 'Artifacts')
                    + ' <span>' + views[name].count + '</span>';
                tabs.set(name, tab);
                tablist.appendChild(tab);
                views[name].panel.setAttribute('role', 'tabpanel');
                views[name].panel.setAttribute('aria-labelledby', tab.id);
            });
            body.appendChild(tablist);
        }
        viewNames.forEach(function (name) {
            body.appendChild(views[name].panel);
        });

        function currentDescription() {
            var view = views[activeView];
            return view.count + ' ' + view.label;
        }

        function setTocExpanded(expanded) {
            toc.classList.toggle('toc--expanded', expanded);
            toggle.setAttribute('aria-expanded', String(expanded));
            toggle.textContent = (expanded ? 'Hide ' : 'Show ') + currentDescription();
        }

        function setView(name, focus) {
            if (!views[name]) {
                return;
            }
            activeView = name;
            toc.dataset.activeView = name;
            viewNames.forEach(function (viewName) {
                var selected = viewName === name;
                views[viewName].panel.hidden = !selected;
                var tab = tabs.get(viewName);
                if (tab) {
                    tab.setAttribute('aria-selected', String(selected));
                    tab.tabIndex = selected ? 0 : -1;
                }
            });
            count.textContent = currentDescription();
            setTocExpanded(toc.classList.contains('toc--expanded'));
            viewNames.forEach(function (viewName) {
                if (viewName !== name) {
                    setCurrent(views[viewName].links, '');
                }
            });
            scheduleActiveNavigationUpdate();
            if (focus && tabs.get(name)) {
                tabs.get(name).focus();
            }
        }

        tabs.forEach(function (tab, name) {
            tab.addEventListener('click', function () { setView(name, false); });
            tab.addEventListener('keydown', function (event) {
                if (!/^(?:ArrowLeft|ArrowRight|Home|End)$/.test(event.key)) {
                    return;
                }
                event.preventDefault();
                var index = viewNames.indexOf(name);
                if (event.key === 'Home') index = 0;
                if (event.key === 'End') index = viewNames.length - 1;
                if (event.key === 'ArrowLeft') index = (index - 1 + viewNames.length) % viewNames.length;
                if (event.key === 'ArrowRight') index = (index + 1) % viewNames.length;
                setView(viewNames[index], true);
            });
        });

        function keepLinkVisible(active) {
            if (!active || window.matchMedia('(max-width: 900px)').matches || !active.offsetParent) {
                return;
            }
            var tocBox = toc.getBoundingClientRect();
            var activeBox = active.getBoundingClientRect();
            var breathingRoom = 4;
            if (activeBox.top < tocBox.top + breathingRoom) {
                toc.scrollTop += activeBox.top - tocBox.top - breathingRoom;
            } else if (activeBox.bottom > tocBox.bottom - breathingRoom) {
                toc.scrollTop += activeBox.bottom - tocBox.bottom + breathingRoom;
            }
        }

        function setCurrent(links, id) {
            links.forEach(function (link) { link.removeAttribute('aria-current'); });
            var active = links.get(id);
            if (active) {
                active.setAttribute('aria-current', 'location');
                keepLinkVisible(active);
            }
        }

        function activeItem(items) {
            var readingLine = window.innerHeight * 0.28;
            var active = items[0];
            items.forEach(function (item) {
                if (item.getBoundingClientRect().top <= readingLine) {
                    active = item;
                }
            });
            return active;
        }

        toc.classList.add('toc--collapsible');
        setView(activeView, false);
        toggle.addEventListener('click', function () {
            setTocExpanded(!toc.classList.contains('toc--expanded'));
        });
        body.addEventListener('click', function (event) {
            if (window.matchMedia('(max-width: 900px)').matches) {
                if (event.target.closest('a')) {
                    setTocExpanded(false);
                }
            }
        });
        doc.addEventListener('click', function (event) {
            if (window.matchMedia('(max-width: 900px)').matches
                && toc.classList.contains('toc--expanded')
                && !toc.contains(event.target)) {
                setTocExpanded(false);
            }
        });
        doc.addEventListener('keydown', function (event) {
            if (event.key === 'Escape'
                && window.matchMedia('(max-width: 900px)').matches
                && toc.classList.contains('toc--expanded')) {
                setTocExpanded(false);
                toggle.focus();
            }
        });

        var activeNavigationFrame;
        var hashTargetId;
        function updateActiveNavigation() {
            activeNavigationFrame = null;
            if (hashTargetId) {
                setCurrent(views[activeView].links, hashTargetId);
                return;
            }
            var active = activeItem(views[activeView].items);
            if (active) {
                setCurrent(views[activeView].links, active.id);
            }
        }

        function scheduleActiveNavigationUpdate() {
            if (activeNavigationFrame) {
                return;
            }
            activeNavigationFrame = window.requestAnimationFrame(updateActiveNavigation);
        }

        function pinToHashTarget(instant) {
            var pinnedId = hashTargetId;
            if (!pinnedId) {
                return;
            }
            window.requestAnimationFrame(function () {
                var target = hashTargetId === pinnedId && doc.getElementById(pinnedId);
                if (!target) {
                    return;
                }
                target.scrollIntoView(instant ? {block: 'start', behavior: 'instant'} : {block: 'start'});
                setCurrent(views[activeView].links, target.id);
            });
        }

        function releaseHashTarget() {
            if (hashTargetId) {
                hashTargetId = null;
                scheduleActiveNavigationUpdate();
            }
        }

        window.addEventListener('scroll', scheduleActiveNavigationUpdate, {passive: true});
        ['wheel', 'touchmove', 'pointerdown'].forEach(function (type) {
            window.addEventListener(type, releaseHashTarget, {passive: true});
        });
        window.addEventListener('keydown', function (event) {
            if (/^(?: |Space|Page(?:Up|Down)|Arrow(?:Up|Down)|Home|End)$/.test(event.key)) {
                releaseHashTarget();
            }
        });
        window.addEventListener('resize', scheduleActiveNavigationUpdate);

        function resolveHashTarget() {
            if (!window.location.hash) {
                return;
            }
            var rawId = window.location.hash.slice(1);
            var decodedId = rawId;
            try {
                decodedId = decodeURIComponent(rawId);
            } catch (error) {
                // A malformed fragment should not disrupt article enhancements.
            }
            var target = doc.getElementById(rawId) || doc.getElementById(decodedId);
            if (!target) {
                return;
            }
            hashTargetId = target.id;
            if (views.artifacts && views.artifacts.links.has(target.id)) {
                setView('artifacts', false);
            } else if (views.outline && views.outline.links.has(target.id)) {
                setView('outline', false);
            }
            pinToHashTarget(false);
        }

        // Lazy images without reserved dimensions shift the article as they
        // load, dragging an anchored heading away from the viewport; keep
        // re-anchoring until the reader takes over scrolling themselves.
        model.content.querySelectorAll('img').forEach(function (image) {
            if (image.complete) {
                return;
            }
            var repin = function () { pinToHashTarget(true); };
            image.addEventListener('load', repin);
            image.addEventListener('error', repin);
        });

        resolveHashTarget();
        window.addEventListener('hashchange', resolveHashTarget);
        scheduleActiveNavigationUpdate();
    }

    function enhanceResearchSections() {
        var content = doc.querySelector('[data-post-content]');
        if (!content) {
            return;
        }
        var used = new Set(Array.from(doc.querySelectorAll('[id]')).map(function (element) {
            return element.id;
        }));
        Array.from(content.querySelectorAll('h2')).forEach(function (heading) {
            var label = heading.textContent.trim().toLowerCase();
            if (!/(evidence|references|sources|further reading)/.test(label)) {
                return;
            }
            ensureId(heading, slugify(heading.textContent), used);
            var section = doc.createElement('section');
            section.className = 'research-section research-section--evidence';
            section.setAttribute('aria-labelledby', heading.id);
            heading.parentNode.insertBefore(section, heading);
            section.appendChild(heading);
            var next = section.nextSibling;
            while (next && !(next.nodeType === 1 && next.tagName === 'H2')) {
                var following = next.nextSibling;
                section.appendChild(next);
                next = following;
            }
        });
    }

    function setupReaderTools() {
        var article = doc.querySelector('.article');
        var content = doc.querySelector('[data-post-content]');
        var trigger = doc.querySelector('[data-reader-settings]');
        var dialog = doc.querySelector('[data-reader-dialog]');
        if (!article || !content || !trigger || !dialog || typeof dialog.showModal !== 'function') {
            return;
        }

        var defaults = {
            text: 'default',
            measure: 'standard',
            contrast: 'normal',
            focus: false
        };
        var allowed = {
            text: ['compact', 'default', 'large'],
            measure: ['focused', 'standard', 'wide'],
            contrast: ['normal', 'high']
        };
        var preferences = Object.assign({}, defaults);
        var stored = readStorage(readerPreferencesKey);
        if (stored) {
            try {
                var parsed = JSON.parse(stored);
                Object.keys(allowed).forEach(function (name) {
                    if (allowed[name].includes(parsed[name])) {
                        preferences[name] = parsed[name];
                    }
                });
                preferences.focus = parsed.focus === true;
            } catch (error) {
                writeStorage(readerPreferencesKey, null);
            }
        }

        function syncControls() {
            dialog.querySelectorAll('[data-reader-text]').forEach(function (button) {
                button.setAttribute('aria-pressed', String(button.dataset.readerText === preferences.text));
            });
            dialog.querySelectorAll('[data-reader-measure]').forEach(function (button) {
                button.setAttribute('aria-pressed', String(button.dataset.readerMeasure === preferences.measure));
            });
            dialog.querySelectorAll('[data-reader-contrast]').forEach(function (button) {
                button.setAttribute('aria-pressed', String(button.dataset.readerContrast === preferences.contrast));
            });
            dialog.querySelector('[data-reader-focus]').setAttribute('aria-pressed', String(preferences.focus));
        }

        function applyPreferences() {
            article.dataset.readerText = preferences.text;
            article.dataset.readerMeasure = preferences.measure;
            article.dataset.readerContrast = preferences.contrast;
            doc.body.classList.toggle('reader-focus', preferences.focus);
            syncControls();
        }

        function preserveReadingPosition(change) {
            var anchor = content.firstElementChild;
            Array.from(content.children).some(function (element) {
                var box = element.getBoundingClientRect();
                if (box.top <= 150 && box.bottom > 0) {
                    anchor = element;
                    return false;
                }
                return box.top > 150;
            });
            var before = anchor ? anchor.getBoundingClientRect().top : 0;
            change();
            window.requestAnimationFrame(function () {
                if (anchor && anchor.isConnected) {
                    window.scrollBy(0, anchor.getBoundingClientRect().top - before);
                }
                window.dispatchEvent(new Event('resize'));
            });
        }

        function saveAndApply() {
            applyPreferences();
            writeStorage(readerPreferencesKey, JSON.stringify(preferences));
        }

        dialog.querySelectorAll('[data-reader-text]').forEach(function (button) {
            button.addEventListener('click', function () {
                preserveReadingPosition(function () {
                    preferences.text = button.dataset.readerText;
                    saveAndApply();
                });
            });
        });
        dialog.querySelectorAll('[data-reader-measure]').forEach(function (button) {
            button.addEventListener('click', function () {
                preserveReadingPosition(function () {
                    preferences.measure = button.dataset.readerMeasure;
                    saveAndApply();
                });
            });
        });
        dialog.querySelectorAll('[data-reader-contrast]').forEach(function (button) {
            button.addEventListener('click', function () {
                preferences.contrast = button.dataset.readerContrast;
                saveAndApply();
            });
        });
        dialog.querySelector('[data-reader-focus]').addEventListener('click', function () {
            preserveReadingPosition(function () {
                preferences.focus = !preferences.focus;
                saveAndApply();
            });
        });
        dialog.querySelector('[data-reader-reset]').addEventListener('click', function () {
            preserveReadingPosition(function () {
                preferences = Object.assign({}, defaults);
                applyPreferences();
                writeStorage(readerPreferencesKey, null);
            });
        });

        trigger.addEventListener('click', function () {
            trigger.setAttribute('aria-expanded', 'true');
            dialog.showModal();
        });
        dialog.addEventListener('click', function (event) {
            if (event.target === dialog) {
                dialog.close();
            }
        });
        dialog.addEventListener('close', function () {
            trigger.setAttribute('aria-expanded', 'false');
            trigger.focus();
        });

        applyPreferences();
        trigger.hidden = false;
    }

    function enhanceImages() {
        var content = doc.querySelector('[data-post-content]');
        if (!content) {
            return;
        }

        var dialog = doc.createElement('dialog');
        dialog.className = 'image-lightbox';
        var controls = doc.createElement('div');
        controls.className = 'image-lightbox__controls';
        var original = doc.createElement('a');
        original.className = 'image-lightbox__original';
        original.target = '_blank';
        original.rel = 'noopener';
        original.textContent = 'Open original ↗';
        var close = doc.createElement('button');
        close.type = 'button';
        close.className = 'image-lightbox__close';
        close.textContent = 'Close';
        close.setAttribute('aria-label', 'Close enlarged image');
        var image = doc.createElement('img');
        var opener;
        controls.append(original, close);
        dialog.append(controls, image);
        doc.body.appendChild(dialog);
        close.addEventListener('click', function () { dialog.close(); });
        dialog.addEventListener('click', function (event) {
            if (event.target === dialog) {
                dialog.close();
            }
        });
        dialog.addEventListener('keydown', function (event) {
            if (event.key === 'Escape' && dialog.open) {
                event.preventDefault();
                dialog.close();
            }
        });
        dialog.addEventListener('close', function () {
            image.removeAttribute('src');
            if (opener && opener.isConnected) {
                opener.focus();
            }
            opener = null;
        });

        content.querySelectorAll('img').forEach(function (thumbnail) {
            if (!thumbnail.hasAttribute('alt')) {
                thumbnail.alt = '';
            }
            if (thumbnail.closest('a') || thumbnail.closest('.kg-emoji-card')) {
                return;
            }
            thumbnail.classList.add('is-zoomable');
            thumbnail.tabIndex = 0;
            thumbnail.setAttribute('role', 'button');
            thumbnail.setAttribute('aria-label', 'Enlarge image' + (thumbnail.alt ? ': ' + thumbnail.alt : ''));
            var open = function () {
                opener = thumbnail;
                var originalUrl = new URL(thumbnail.getAttribute('src') || thumbnail.src, doc.baseURI).href;
                image.src = originalUrl;
                image.alt = thumbnail.alt || '';
                original.href = originalUrl;
                if (typeof dialog.showModal === 'function') {
                    dialog.showModal();
                    close.focus();
                } else {
                    window.open(originalUrl, '_blank', 'noopener');
                }
            };
            thumbnail.addEventListener('click', open);
            thumbnail.addEventListener('keydown', function (event) {
                if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    open();
                }
            });
        });
    }

    function markCurrentNavigation() {
        // Ghost only sets nav-current on an exact URL match, so a navigation
        // item saved as /Publications/ never lights up on /publications/.
        var links = Array.from(doc.querySelectorAll('.site-nav__menu a, .footer-nav__links a'));
        function isSameSite(link) {
            if (link.origin === window.location.origin) {
                return true;
            }
            var loopbackHosts = ['localhost', '127.0.0.1', '[::1]'];
            return link.port === window.location.port
                && loopbackHosts.includes(link.hostname)
                && loopbackHosts.includes(window.location.hostname);
        }
        links.forEach(function (link) {
            if (isSameSite(link)) {
                return;
            }
            link.setAttribute('aria-label', link.textContent.trim() + ' (external site)');
            (link.closest('li') || link).classList.add('nav-external');
        });
        if (doc.querySelector('.site-nav__menu .nav-current')) {
            return;
        }
        var currentPath = window.location.pathname.replace(/\/+$/, '').toLowerCase();
        links.forEach(function (link) {
            if (!isSameSite(link)) {
                return;
            }
            if (link.pathname.replace(/\/+$/, '').toLowerCase() !== currentPath) {
                return;
            }
            link.setAttribute('aria-current', 'page');
            (link.closest('li') || link).classList.add('nav-current');
        });
    }

    function setupNavigation() {
        var toggle = doc.querySelector('[data-menu-toggle]');
        var menu = doc.querySelector('[data-menu]');
        if (!toggle || !menu) {
            return;
        }
        function setMenuOpen(open) {
            toggle.setAttribute('aria-expanded', String(open));
            menu.classList.toggle('is-open', open);
        }
        toggle.addEventListener('click', function () {
            setMenuOpen(toggle.getAttribute('aria-expanded') !== 'true');
        });
        menu.addEventListener('click', function (event) {
            if (event.target.closest('a')) {
                setMenuOpen(false);
            }
        });
        doc.addEventListener('click', function (event) {
            if (toggle.getAttribute('aria-expanded') === 'true'
                && !toggle.contains(event.target)
                && !menu.contains(event.target)) {
                setMenuOpen(false);
            }
        });
        doc.addEventListener('keydown', function (event) {
            if (event.key === 'Escape' && toggle.getAttribute('aria-expanded') === 'true') {
                setMenuOpen(false);
                toggle.focus();
            }
        });
    }

    function setupBackToTop() {
        var button = doc.querySelector('[data-back-to-top]');
        if (!button) {
            return;
        }
        var update = function () { button.hidden = window.scrollY < 500; };
        update();
        window.addEventListener('scroll', update, { passive: true });
        button.addEventListener('click', function () {
            var reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
            window.scrollTo({top: 0, behavior: reducedMotion ? 'auto' : 'smooth'});
        });
    }

    function setupReadingProgress() {
        var progress = doc.querySelector('[data-reading-progress]');
        var article = doc.querySelector('.article');
        if (!progress || !article) {
            return;
        }
        var meter = progress.querySelector('span');
        progress.hidden = false;
        var update = function () {
            var start = article.offsetTop - 112;
            var distance = Math.max(article.offsetHeight - window.innerHeight + 224, 1);
            var ratio = Math.min(1, Math.max(0, (window.scrollY - start) / distance));
            meter.style.transform = 'scaleX(' + ratio + ')';
        };
        update();
        window.addEventListener('scroll', update, {passive: true});
        window.addEventListener('resize', update);
    }

    /*
     * Shows a transient label on a button and restores it afterwards.
     *
     * The idle label is captured once and kept on the element: reading it fresh
     * on every call meant a second click inside the reset window captured the
     * feedback text as the "original", and the button kept that text forever.
     * The accessible name is deliberately left alone — it stays stable while the
     * status goes to the live region.
     */
    function actionFeedback(button, message) {
        if (typeof button.dataset.idleLabel !== 'string') {
            button.dataset.idleLabel = button.textContent;
        }
        button.textContent = message;
        announce(message);
        window.clearTimeout(Number(button.dataset.feedbackTimer) || 0);
        button.dataset.feedbackTimer = String(window.setTimeout(function () {
            button.textContent = button.dataset.idleLabel;
            delete button.dataset.feedbackTimer;
        }, 1800));
    }

    function setupArticleActions() {
        var actions = doc.querySelector('[data-article-actions]');
        if (!actions) {
            return;
        }
        var title = actions.dataset.shareTitle;
        var url = actions.dataset.shareUrl;
        var author = actions.dataset.shareAuthor;
        var date = actions.dataset.shareDate;
        var site = actions.dataset.shareSite;
        var copyLink = actions.querySelector('[data-copy-link]');
        var copyCitation = actions.querySelector('[data-copy-citation]');
        var nativeShare = actions.querySelector('[data-native-share]');
        var citation = [author ? author + '.' : '', '“' + title + '.”', site + ',', date + '.', url]
            .filter(Boolean).join(' ');

        copyLink.addEventListener('click', function () {
            copyText(url).then(function () {
                actionFeedback(copyLink, 'Link copied');
            }).catch(function () {
                actionFeedback(copyLink, 'Copy failed');
            });
        });
        copyCitation.addEventListener('click', function () {
            copyText(citation).then(function () {
                actionFeedback(copyCitation, 'Citation copied');
            }).catch(function () {
                actionFeedback(copyCitation, 'Copy failed');
            });
        });
        if (navigator.share) {
            nativeShare.hidden = false;
            nativeShare.addEventListener('click', function () {
                navigator.share({title: title, text: title, url: url}).catch(function () {
                    // A dismissed native share sheet is not an error worth surfacing.
                });
            });
        }
    }

    function initialize() {
        enhanceRawEmbeds();
        enhanceFigures();
        enhanceArticleTitle();
        enhanceSeriesNavigation();
        enhanceResearchSections();
        enhanceResearchBlocks();
        enhanceCodeBlocks();
        enhanceArticleNavigation(createArticleModel());
        enhanceImages();
        setupReaderTools();
        markCurrentNavigation();
        setupNavigation();
        setupBackToTop();
        setupReadingProgress();
        setupArticleActions();
        watchCodeBlockOverflow();
        loadSyntaxHighlighting().catch(function () {
            // Code stays readable and receives the local toolbar even when the
            // optional highlighter cannot be loaded.
        }).then(function () {
            registerTechnicalAliases();
            highlightCodeBlocks();
        });
    }

    if (doc.readyState === 'loading') {
        doc.addEventListener('DOMContentLoaded', initialize);
    } else {
        initialize();
    }
}());
