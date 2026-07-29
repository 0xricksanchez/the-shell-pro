/* global hljs */
(function () {
    'use strict';

    var doc = document;
    var highlightBase = 'https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.11.1/';

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
        if (!doc.querySelector('[data-post-content] pre > code') || window.hljs) {
            return Promise.resolve();
        }
        return loadScript(highlightBase + 'highlight.min.js')
            .then(function () {
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
            var textarea = doc.createElement('textarea');
            textarea.value = text;
            textarea.setAttribute('readonly', '');
            textarea.style.position = 'fixed';
            textarea.style.opacity = '0';
            doc.body.appendChild(textarea);
            textarea.select();
            try {
                doc.execCommand('copy');
                resolve();
            } catch (error) {
                reject(error);
            }
            textarea.remove();
        });
    }

    function languageName(code) {
        var match = code.className.match(/(?:language-|lang-)([a-z0-9+_-]+)/i);
        return match ? match[1].replace(/[-_]/g, ' ') : 'code';
    }

    function filenameFor(pre, code) {
        return pre.dataset.filename || code.dataset.filename || '';
    }

    function filenameFromSource(code) {
        var match = code.textContent.match(/^(?:\/\/|#)\s*file:\s*([^\n]+)\n/);
        if (!match) {
            return '';
        }
        code.textContent = code.textContent.slice(match[0].length);
        return match[1].trim();
    }

    function addLineNumbers(wrapper, code) {
        var lineCount = code.textContent.replace(/\n$/, '').split('\n').length;
        if (lineCount < 2) {
            return;
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
    }

    function enhanceCodeBlocks() {
        doc.querySelectorAll('[data-post-content] pre > code').forEach(function (code) {
            var pre = code.parentElement;
            var file = filenameFor(pre, code) || filenameFromSource(code);
            if (window.hljs && !code.dataset.highlighted) {
                window.hljs.highlightElement(code);
            }

            if (pre.parentElement.classList.contains('shell-code-block')) {
                return;
            }

            var wrapper = doc.createElement('div');
            wrapper.className = 'shell-code-block';
            pre.parentNode.insertBefore(wrapper, pre);
            wrapper.appendChild(pre);

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
            label.textContent = languageName(code);
            identity.appendChild(label);
            var button = doc.createElement('button');
            button.type = 'button';
            button.className = 'copy-code';
            button.textContent = 'Copy';
            button.setAttribute('aria-label', 'Copy code block');
            button.addEventListener('click', function () {
                copyText(code.textContent).then(function () {
                    button.textContent = 'Copied';
                    setTimeout(function () { button.textContent = 'Copy'; }, 1600);
                }).catch(function () {
                    button.textContent = 'Select code';
                });
            });

            toolbar.append(identity, button);
            wrapper.insertBefore(toolbar, pre);
            addLineNumbers(wrapper, code);
        });
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

    function enhanceToc() {
        var content = doc.querySelector('[data-post-content]');
        var toc = doc.querySelector('[data-toc]');
        var container = doc.querySelector('[data-toc-container]');
        if (!content || !toc || !container) {
            return;
        }

        var used = new Set(Array.from(doc.querySelectorAll('[id]')).map(function (element) { return element.id; }));
        var headings = Array.from(content.querySelectorAll('h2, h3'));
        headings.forEach(function (heading) {
            if (heading.id) {
                return;
            }
            var base = slugify(heading.textContent);
            var id = base;
            var count = 2;
            while (used.has(id)) {
                id = base + '-' + count;
                count += 1;
            }
            used.add(id);
            heading.id = id;
        });

        if (headings.length < 2) {
            container.hidden = true;
            var layout = container.closest('.article-layout');
            if (layout) {
                layout.classList.add('article-layout--without-toc');
            }
            return;
        }

        var list = doc.createElement('ol');
        list.className = 'toc__list';
        list.id = 'article-toc-list';
        var links = new Map();
        var currentParent;
        headings.forEach(function (heading) {
            var item = doc.createElement('li');
            item.className = heading.tagName === 'H3' ? 'toc__item toc__item--sub' : 'toc__item';
            var link = doc.createElement('a');
            link.href = '#' + heading.id;
            link.textContent = heading.textContent;
            item.appendChild(link);
            if (heading.tagName === 'H2') {
                list.appendChild(item);
                currentParent = item;
            } else if (currentParent) {
                var nested = currentParent.lastElementChild;
                if (!nested || nested.tagName !== 'OL') {
                    nested = doc.createElement('ol');
                    currentParent.appendChild(nested);
                }
                nested.appendChild(item);
            } else {
                list.appendChild(item);
            }
            links.set(heading.id, link);
        });
        var count = doc.createElement('p');
        count.className = 'toc__count';
        count.textContent = headings.length + ' waypoints';
        toc.querySelector('.toc__title').insertAdjacentElement('afterend', count);
        toc.appendChild(list);

        function setActiveHeading(id) {
            links.forEach(function (link) { link.removeAttribute('aria-current'); });
            var active = links.get(id);
            if (active) {
                active.setAttribute('aria-current', 'location');
            }
        }

        var toggle = doc.createElement('button');
        toggle.type = 'button';
        toggle.className = 'toc__toggle';
        toggle.setAttribute('aria-controls', list.id);

        function setTocExpanded(expanded) {
            toc.classList.toggle('toc--expanded', expanded);
            toggle.setAttribute('aria-expanded', String(expanded));
            toggle.textContent = (expanded ? 'Hide' : 'Show') + ' ' + headings.length + ' waypoints';
        }

        toc.classList.add('toc--collapsible');
        setTocExpanded(false);
        toggle.addEventListener('click', function () {
            setTocExpanded(!toc.classList.contains('toc--expanded'));
        });
        list.addEventListener('click', function () {
            if (window.matchMedia('(max-width: 900px)').matches) {
                setTocExpanded(false);
            }
        });
        count.insertAdjacentElement('afterend', toggle);

        var activeHeadingFrame;
        var hashTargetId;
        function updateActiveHeading() {
            activeHeadingFrame = null;
            if (hashTargetId) {
                setActiveHeading(hashTargetId);
                return;
            }
            var readingLine = window.innerHeight * 0.28;
            var activeHeading = headings[0];
            headings.forEach(function (heading) {
                if (heading.getBoundingClientRect().top <= readingLine) {
                    activeHeading = heading;
                }
            });
            setActiveHeading(activeHeading.id);
        }

        function scheduleActiveHeadingUpdate() {
            if (activeHeadingFrame) {
                return;
            }
            activeHeadingFrame = window.requestAnimationFrame(updateActiveHeading);
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
                setActiveHeading(target.id);
            });
        }

        function releaseHashTarget() {
            if (hashTargetId) {
                hashTargetId = null;
                scheduleActiveHeadingUpdate();
            }
        }

        window.addEventListener('scroll', scheduleActiveHeadingUpdate, {passive: true});
        ['wheel', 'touchmove', 'pointerdown'].forEach(function (type) {
            window.addEventListener(type, releaseHashTarget, {passive: true});
        });
        window.addEventListener('keydown', function (event) {
            if (/^(?: |Space|Page(?:Up|Down)|Arrow(?:Up|Down)|Home|End)$/.test(event.key)) {
                releaseHashTarget();
            }
        });
        window.addEventListener('resize', scheduleActiveHeadingUpdate);

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
            pinToHashTarget(false);
        }

        // Lazy images without reserved dimensions shift the article as they
        // load, dragging an anchored heading away from the viewport; keep
        // re-anchoring until the reader takes over scrolling themselves.
        content.querySelectorAll('img').forEach(function (image) {
            if (image.complete) {
                return;
            }
            var repin = function () { pinToHashTarget(true); };
            image.addEventListener('load', repin);
            image.addEventListener('error', repin);
        });

        resolveHashTarget();
        window.addEventListener('hashchange', resolveHashTarget);
        scheduleActiveHeadingUpdate();
    }

    function enhanceResearchSections() {
        var content = doc.querySelector('[data-post-content]');
        if (!content) {
            return;
        }
        Array.from(content.querySelectorAll('h2')).forEach(function (heading) {
            var label = heading.textContent.trim().toLowerCase();
            if (!/(evidence|references|sources|further reading)/.test(label)) {
                return;
            }
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
        controls.append(original, close);
        dialog.append(controls, image);
        doc.body.appendChild(dialog);
        close.addEventListener('click', function () { dialog.close(); });
        dialog.addEventListener('click', function (event) {
            if (event.target === dialog) {
                dialog.close();
            }
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
        toggle.addEventListener('click', function () {
            var open = toggle.getAttribute('aria-expanded') === 'true';
            toggle.setAttribute('aria-expanded', String(!open));
            menu.classList.toggle('is-open', !open);
        });
        doc.addEventListener('keydown', function (event) {
            if (event.key === 'Escape') {
                toggle.setAttribute('aria-expanded', 'false');
                menu.classList.remove('is-open');
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
        button.addEventListener('click', function () { window.scrollTo({ top: 0, behavior: 'smooth' }); });
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

    function actionFeedback(button, success, fallback) {
        var original = button.textContent;
        button.textContent = success;
        setTimeout(function () { button.textContent = original; }, 1800);
        return fallback;
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
                actionFeedback(copyLink, 'Select link');
            });
        });
        copyCitation.addEventListener('click', function () {
            copyText(citation).then(function () {
                actionFeedback(copyCitation, 'Citation copied');
            }).catch(function () {
                actionFeedback(copyCitation, 'Select citation');
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
        enhanceToc();
        enhanceResearchSections();
        enhanceResearchBlocks();
        enhanceImages();
        markCurrentNavigation();
        setupNavigation();
        setupBackToTop();
        setupReadingProgress();
        setupArticleActions();
        loadSyntaxHighlighting().catch(function () {
            // Code stays readable and receives the local toolbar even when the
            // optional highlighter cannot be loaded.
        }).then(function () {
            registerTechnicalAliases();
            enhanceCodeBlocks();
        });
    }

    if (doc.readyState === 'loading') {
        doc.addEventListener('DOMContentLoaded', initialize);
    } else {
        initialize();
    }
}());
