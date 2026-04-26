// ==UserScript==
// @name         MediaSpeedToggle
// @name:zh-CN   全站视频倍速一键切换
// @namespace    https://github.com/dcjanus/userscripts
// @description  在大多数网站通过快捷键切换 1x/3x，并按页面/站点/全局策略决定默认速度
// @author       DCjanus
// @match        https://*/*
// @match        http://*/*
// @icon         https://raw.githubusercontent.com/DCjanus/userscripts/master/assets/media-speed-toggle.svg
// @version      20260426
// @license      MIT
// @run-at       document-start
// @grant        GM_registerMenuCommand
// @grant        GM_unregisterMenuCommand
// ==/UserScript==

(() => {
    'use strict';

    // 参考实现（仅记录思路来源，当前脚本保持个人定制与最小功能）：
    // - h5player: https://github.com/xxxily/h5player
    // - Video Speed Controller: https://greasyfork.org/en/scripts/534111-video-speed-controller-control-speed-on-videos-in-any-website
    // - All Media Speed: https://greasyfork.org/en/scripts/541300-all-media-speed
    // - Universal Video Speed Adjuster: https://greasyfork.org/en/scripts/550693-universal-video-speed-adjuster

    const RATE_NORMAL = 1;
    const RATE_FAST = 3;
    const DEFAULT_RATE = RATE_FAST;
    const SITE_DEFAULT_RATES = Object.freeze({
        // 'example.com': RATE_NORMAL,
    });
    const REAPPLY_DEBOUNCE_MS = 120;
    const HEAL_INTERVAL_MS = 1500;
    const OVERLAY_ID = 'dcjanus-media-speed-overlay';
    const BILIBILI_VIDEO_TAG_SELECTOR =
        'a.tag-link[href*="from_source=video_tag"]';
    const BILIBILI_MUSIC_TAGS = new Set([
        '音乐',
        '音乐现场',
        '音乐推荐',
        '音乐综合',
        '原创音乐',
        '流行音乐',
        '歌曲',
        '音乐选集',
        '听歌',
        '翻唱',
        '男声翻唱',
        '女声翻唱',
        '演奏',
        'VOCALOID',
        'VOCALOID·UTAU',
        'UTAU',
        'MV',
        '华语MV',
        'BGM',
    ]);
    const BILIBILI_DANCE_TAGS = new Set([
        '舞蹈',
        '舞蹈翻跳',
        '舞蹈挑战',
        '热舞',
        '宅舞',
        '街舞',
        '中国舞',
        '编舞',
    ]);

    const isMac =
        navigator.userAgentData?.platform === 'macOS' ||
        /\bMac(?:intosh)?\b/i.test(navigator.userAgent) ||
        navigator.platform?.toUpperCase().includes('MAC');
    let pageOverrideRate = null;
    let lastUrl = location.href;
    let pendingApply = 0;
    let toastTimer = 0;
    let lastIncrementalApplyAt = 0;
    let menuCommandIds = [];
    let lastMenuText = '';
    let overlayKeydownHandler = null;

    const applyingMap = new WeakMap();
    const boundMedia = new WeakSet();

    function currentRate() {
        return resolveRate().rate;
    }

    function normalizeRate(rate) {
        const numericRate = Number(rate);
        if (!Number.isFinite(numericRate)) return null;
        if (numericRate < 0.0625 || numericRate > 16) return null;
        return Math.round(numericRate * 100) / 100;
    }

    function sameRate(a, b) {
        return Math.abs(a - b) < 0.001;
    }

    function formatRate(rate) {
        return `${Number(rate.toFixed(2))}x`;
    }

    function currentSiteKey() {
        return location.hostname.replace(/^www\./, '');
    }

    function getSiteRate() {
        const siteKey = currentSiteKey();
        return Object.prototype.hasOwnProperty.call(SITE_DEFAULT_RATES, siteKey)
            ? SITE_DEFAULT_RATES[siteKey]
            : null;
    }

    function detectPageRule() {
        if (isYouTubeLivePage()) {
            return {
                rate: RATE_NORMAL,
                source: '页面规则',
                reason: 'YouTube 直播',
                rule: 'youtube-live',
            };
        }

        if (isBilibiliLivePage()) {
            return {
                rate: RATE_NORMAL,
                source: '页面规则',
                reason: 'B 站直播',
                rule: 'bilibili-live-host',
            };
        }

        const bilibiliTagRule = detectBilibiliTagRule();
        if (bilibiliTagRule) return bilibiliTagRule;

        return null;
    }

    function resolveRate() {
        const siteKey = currentSiteKey();
        const siteRate = getSiteRate();
        const base = {
            siteKey,
            siteRate,
            defaultRate: DEFAULT_RATE,
            pageOverrideRate,
        };

        if (pageOverrideRate !== null) {
            return {
                ...base,
                rate: pageOverrideRate,
                source: '本页临时',
                reason: null,
                rule: 'page-override',
            };
        }

        const pageRule = detectPageRule();
        if (pageRule) return { ...base, ...pageRule };

        if (siteRate !== null) {
            return {
                ...base,
                rate: siteRate,
                source: '源码站点默认',
                reason: siteKey,
                rule: 'source-site-default',
            };
        }

        return {
            ...base,
            rate: DEFAULT_RATE,
            source: '源码默认',
            reason: null,
            rule: 'source-default',
        };
    }

    function isYouTubeHost() {
        return /(^|\.)youtube\.com$/i.test(location.hostname);
    }

    function isBilibiliHost() {
        return /(^|\.)bilibili\.com$/i.test(location.hostname);
    }

    function isYouTubeLivePage() {
        if (!isYouTubeHost()) return false;
        if (location.pathname.startsWith('/live/')) return true;
        if (hasLiveMedia()) return true;
        if (
            document.querySelector(
                'meta[itemprop="isLiveBroadcast"][content="True"], meta[itemprop="isLiveBroadcast"][content="true"]',
            )
        ) {
            return true;
        }

        return hasVisibleLiveBadge('.ytp-live, .ytp-live-badge');
    }

    function hasLiveMedia() {
        return Array.from(document.querySelectorAll('video')).some(
            (media) => media.duration === Infinity,
        );
    }

    function hasVisibleLiveBadge(selector) {
        return Array.from(document.querySelectorAll(selector)).some((el) => {
            const text = `${el.textContent || ''} ${
                el.getAttribute('aria-label') || ''
            }`;
            if (!/(live|直播)/i.test(text)) return false;
            const style = window.getComputedStyle(el);
            if (
                style.display === 'none' ||
                style.visibility === 'hidden' ||
                style.opacity === '0'
            ) {
                return false;
            }
            return el.getClientRects().length > 0;
        });
    }

    function isBilibiliLivePage() {
        return /^live\.bilibili\.com$/i.test(location.hostname);
    }

    function detectBilibiliTagRule() {
        if (!isBilibiliHost()) return false;

        const pageTags = collectBilibiliVideoTags();
        const musicTags = pageTags.filter((tag) =>
            BILIBILI_MUSIC_TAGS.has(tag),
        );
        if (musicTags.length > 0) {
            return {
                rate: RATE_NORMAL,
                source: '页面规则',
                reason: 'B 站音乐',
                rule: 'bilibili-music-tags',
                pageTags,
                matchedTags: musicTags,
            };
        }

        const danceTags = pageTags.filter((tag) =>
            BILIBILI_DANCE_TAGS.has(tag),
        );
        if (danceTags.length > 0) {
            return {
                rate: RATE_NORMAL,
                source: '页面规则',
                reason: 'B 站舞蹈',
                rule: 'bilibili-dance-tags',
                pageTags,
                matchedTags: danceTags,
            };
        }

        return null;
    }

    function collectBilibiliVideoTags() {
        return Array.from(
            document.querySelectorAll(BILIBILI_VIDEO_TAG_SELECTOR),
            (node) => normalizeBilibiliTag(node.textContent || ''),
        ).filter(Boolean);
    }

    function normalizeBilibiliTag(tag) {
        return tag.trim().replace(/^#+|#+$/g, '');
    }

    function refreshMenu() {
        const menuText = formatMenuText(resolveRate());
        if (menuText === lastMenuText && menuCommandIds.length > 0) return;

        unregisterMenuCommands();
        menuCommandIds.push(
            GM_registerMenuCommand(
                menuText,
                () => {
                    showInfoOverlay();
                },
                {
                    title: '查看 MediaSpeedToggle 状态与配置',
                },
            ),
        );
        lastMenuText = menuText;
    }

    function unregisterMenuCommands() {
        menuCommandIds.forEach((id) => {
            try {
                GM_unregisterMenuCommand(id);
            } catch (error) {
                console.warn(
                    '[MediaSpeedToggle] failed to unregister menu command:',
                    error,
                );
            }
        });
        menuCommandIds = [];
    }

    function formatMenuText(decision) {
        return `状态与配置：${formatRate(decision.rate)}（${formatShortReason(decision)}）`;
    }

    function formatShortReason(decision) {
        if (decision.reason) return decision.reason;

        if (decision.rule === 'page-override') return '本页临时';
        if (decision.rule === 'source-site-default') return '站点默认';
        return '源码默认';
    }

    function showInfoOverlay() {
        closeInfoOverlay();

        const overlay = document.createElement('div');
        overlay.id = OVERLAY_ID;
        overlay.style.cssText = [
            'position:fixed',
            'inset:0',
            'z-index:2147483647',
            'background:rgba(15,23,42,.42)',
            'display:flex',
            'align-items:flex-start',
            'justify-content:center',
            'padding:72px 16px 24px',
            'box-sizing:border-box',
            'font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,sans-serif',
            'color:#111827',
        ].join(';');

        const panel = document.createElement('section');
        panel.setAttribute('role', 'dialog');
        panel.setAttribute('aria-modal', 'true');
        panel.style.cssText = [
            'width:min(720px,100%)',
            'max-height:calc(100vh - 96px)',
            'overflow:auto',
            'background:#fff',
            'border:1px solid rgba(15,23,42,.12)',
            'border-radius:10px',
            'box-shadow:0 20px 50px rgba(15,23,42,.22)',
        ].join(';');

        const header = document.createElement('div');
        header.style.cssText = [
            'position:sticky',
            'top:0',
            'display:flex',
            'align-items:center',
            'justify-content:space-between',
            'gap:16px',
            'padding:16px 18px',
            'background:#fff',
            'border-bottom:1px solid #e5e7eb',
        ].join(';');

        const title = document.createElement('h2');
        title.textContent = 'MediaSpeedToggle 状态与配置';
        title.style.cssText = [
            'margin:0',
            'font-size:16px',
            'line-height:1.4',
            'font-weight:650',
        ].join(';');

        const closeButton = document.createElement('button');
        closeButton.type = 'button';
        closeButton.textContent = '关闭';
        closeButton.style.cssText = [
            'border:1px solid #d1d5db',
            'background:#fff',
            'color:#111827',
            'border-radius:6px',
            'padding:5px 10px',
            'font-size:13px',
            'line-height:1.4',
            'cursor:pointer',
        ].join(';');
        closeButton.addEventListener('click', closeInfoOverlay);

        header.append(title, closeButton);
        panel.appendChild(header);

        const body = document.createElement('div');
        body.style.cssText = [
            'display:grid',
            'gap:14px',
            'padding:16px 18px 18px',
            'font-size:13px',
            'line-height:1.55',
        ].join(';');

        renderInfoContent(body);

        panel.appendChild(body);
        overlay.appendChild(panel);
        overlay.addEventListener('click', (event) => {
            if (event.target === overlay) closeInfoOverlay();
        });

        overlayKeydownHandler = (event) => {
            if (event.key === 'Escape') closeInfoOverlay();
        };
        document.addEventListener('keydown', overlayKeydownHandler, true);
        document.documentElement.appendChild(overlay);
    }

    function closeInfoOverlay() {
        document.getElementById(OVERLAY_ID)?.remove();
        if (overlayKeydownHandler) {
            document.removeEventListener(
                'keydown',
                overlayKeydownHandler,
                true,
            );
            overlayKeydownHandler = null;
        }
    }

    function renderInfoContent(container) {
        const decision = resolveRate();
        appendSection(container, '本页状态', [
            ['当前速度', formatRate(decision.rate)],
            ['当前来源', formatDecisionSource(decision)],
            ['命中规则', decision.reason || decision.rule],
            ['规则 ID', decision.rule],
            ['覆盖关系', explainDecision(decision)],
            ['本页临时', formatOptionalRate(decision.pageOverrideRate)],
            [
                '页面规则',
                decision.source === '页面规则' ? decision.reason : '未命中',
            ],
        ]);
        appendSection(container, '站点状态', [
            ['当前站点', decision.siteKey],
            ['源码站点默认', formatOptionalRate(decision.siteRate)],
            ['站点默认配置', formatSiteDefaults()],
        ]);
        appendSection(container, '全局状态', [
            ['源码默认', formatRate(decision.defaultRate)],
            ['快捷键', isMac ? 'Cmd+E' : 'Ctrl+E'],
            [
                '速度档位',
                `${formatRate(RATE_NORMAL)} / ${formatRate(RATE_FAST)}`,
            ],
            ['优先级', '本页临时 > 页面规则 > 源码站点默认 > 源码默认'],
            ['持久化状态', '无'],
        ]);
        appendSection(container, '页面规则', [
            ['YouTube 直播', '/live/、直播媒体、直播元信息或可见直播标记'],
            ['B 站直播', 'hostname 为 live.bilibili.com'],
            ['B 站视频 tag 选择器', BILIBILI_VIDEO_TAG_SELECTOR],
            ['B 站音乐 tag', formatList(Array.from(BILIBILI_MUSIC_TAGS))],
            ['B 站舞蹈 tag', formatList(Array.from(BILIBILI_DANCE_TAGS))],
        ]);

        if (isBilibiliHost()) {
            appendSection(container, 'B 站 tag 诊断', [
                ['页面 tag', formatList(collectBilibiliVideoTags())],
                ['命中 tag', formatList(decision.matchedTags || [])],
                ['tag 选择器', BILIBILI_VIDEO_TAG_SELECTOR],
            ]);
        }
    }

    function appendSection(container, title, rows) {
        const section = document.createElement('section');
        section.style.cssText = [
            'border:1px solid #e5e7eb',
            'border-radius:8px',
            'overflow:hidden',
            'background:#fff',
        ].join(';');

        const heading = document.createElement('h3');
        heading.textContent = title;
        heading.style.cssText = [
            'margin:0',
            'padding:9px 12px',
            'font-size:13px',
            'line-height:1.4',
            'font-weight:650',
            'background:#f9fafb',
            'border-bottom:1px solid #e5e7eb',
        ].join(';');
        section.appendChild(heading);

        rows.forEach(([label, value]) => {
            const row = document.createElement('div');
            row.style.cssText = [
                'display:grid',
                'grid-template-columns:minmax(112px,160px) 1fr',
                'gap:12px',
                'padding:8px 12px',
                'border-top:1px solid #f3f4f6',
            ].join(';');

            const labelEl = document.createElement('div');
            labelEl.textContent = label;
            labelEl.style.cssText = 'color:#6b7280;min-width:0';

            const valueEl = document.createElement('div');
            valueEl.textContent = String(value);
            valueEl.style.cssText = [
                'color:#111827',
                'min-width:0',
                'overflow-wrap:anywhere',
                'word-break:break-word',
            ].join(';');

            row.append(labelEl, valueEl);
            section.appendChild(row);
        });

        container.appendChild(section);
    }

    function formatDecisionSource(decision) {
        return `${decision.source}${decision.reason ? `：${decision.reason}` : ''}`;
    }

    function formatOptionalRate(rate) {
        return rate === null || rate === undefined
            ? '未设置'
            : formatRate(rate);
    }

    function formatList(items) {
        return items.length > 0 ? items.join('、') : '无';
    }

    function formatSiteDefaults() {
        const entries = Object.entries(SITE_DEFAULT_RATES);
        if (entries.length === 0) return '无';

        return entries
            .map(([site, rate]) => `${site}: ${formatRate(rate)}`)
            .join('、');
    }

    function explainDecision(decision) {
        if (decision.rule === 'page-override') {
            return '本页临时速度优先于页面规则、源码站点默认和源码默认';
        }
        if (decision.source === '页面规则') {
            return `${decision.reason} 命中，优先于源码站点默认和源码默认`;
        }
        if (decision.rule === 'source-site-default') {
            return '未命中本页临时速度或页面规则，使用源码站点默认';
        }
        return '未命中本页临时速度、页面规则或源码站点默认，使用源码默认';
    }

    function showToast(message) {
        let el = document.getElementById('dcjanus-media-speed-toast');
        if (!el) {
            el = document.createElement('div');
            el.id = 'dcjanus-media-speed-toast';
            el.style.cssText = [
                'position:fixed',
                'right:16px',
                'top:16px',
                'z-index:2147483647',
                'background:rgba(0,0,0,.78)',
                'color:#fff',
                'padding:8px 12px',
                'border-radius:8px',
                'font-size:13px',
                'line-height:1.4',
                'font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,sans-serif',
                'pointer-events:none',
                'opacity:0',
                'transform:translateY(-4px)',
                'transition:opacity .15s ease, transform .15s ease',
            ].join(';');
            document.documentElement.appendChild(el);
        }

        el.textContent = message;
        el.style.opacity = '1';
        el.style.transform = 'translateY(0)';

        clearTimeout(toastTimer);
        toastTimer = window.setTimeout(() => {
            el.style.opacity = '0';
            el.style.transform = 'translateY(-4px)';
        }, 1200);
    }

    function setMediaRate(media) {
        if (!(media instanceof HTMLMediaElement)) return;
        const rate = currentRate();

        if (
            sameRate(media.playbackRate, rate) &&
            sameRate(media.defaultPlaybackRate, rate)
        ) {
            return;
        }

        applyingMap.set(media, true);
        try {
            media.defaultPlaybackRate = rate;
            media.playbackRate = rate;
        } finally {
            applyingMap.set(media, false);
        }
    }

    function recordExternalRate(media) {
        if (!(media instanceof HTMLMediaElement)) return;
        if (applyingMap.get(media)) return;

        const externalRate = normalizeRate(media.playbackRate);
        if (externalRate === null) return;
        if (sameRate(externalRate, currentRate())) return;

        pageOverrideRate = externalRate;
        refreshMenu();
        scheduleApplyAll();
    }

    function bindMedia(media) {
        if (!(media instanceof HTMLMediaElement) || boundMedia.has(media))
            return;
        boundMedia.add(media);

        media.addEventListener(
            'ratechange',
            () => recordExternalRate(media),
            true,
        );

        media.addEventListener(
            'loadedmetadata',
            () => setMediaRate(media),
            true,
        );
        media.addEventListener('play', () => setMediaRate(media), true);
    }

    function applyAllRates() {
        document.querySelectorAll('video, audio').forEach((media) => {
            bindMedia(media);
            setMediaRate(media);
        });
    }

    function applyRatesForNode(node) {
        let handled = false;

        if (node instanceof HTMLMediaElement) {
            bindMedia(node);
            setMediaRate(node);
            return true;
        }

        if (!(node instanceof Element || node instanceof DocumentFragment))
            return false;

        node.querySelectorAll('video, audio').forEach((media) => {
            bindMedia(media);
            setMediaRate(media);
            handled = true;
        });

        return handled;
    }

    function scheduleApplyAll() {
        if (pendingApply) return;
        pendingApply = window.setTimeout(() => {
            pendingApply = 0;
            applyAllRates();
            refreshMenu();
        }, REAPPLY_DEBOUNCE_MS);
    }

    function mayAffectPageRule(node) {
        if (!(node instanceof Element || node instanceof DocumentFragment))
            return false;

        if (
            node instanceof Element &&
            (node.matches(BILIBILI_VIDEO_TAG_SELECTOR) ||
                node.matches('.ytp-live, .ytp-live-badge') ||
                node.matches('meta[itemprop="isLiveBroadcast"]'))
        ) {
            return true;
        }

        return Boolean(
            node.querySelector(
                [
                    BILIBILI_VIDEO_TAG_SELECTOR,
                    '.ytp-live',
                    '.ytp-live-badge',
                    'meta[itemprop="isLiveBroadcast"]',
                ].join(','),
            ),
        );
    }

    function isEditingTarget(target) {
        if (!(target instanceof HTMLElement)) return false;
        if (target.isContentEditable) return true;
        const tag = target.tagName;
        return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';
    }

    function handleShortcut(event) {
        if (isEditingTarget(event.target)) return;

        const keyOk = event.code === 'KeyE';
        if (!keyOk) return;

        const macMatch =
            isMac &&
            event.metaKey &&
            !event.ctrlKey &&
            !event.altKey &&
            !event.shiftKey;
        const winMatch =
            !isMac &&
            event.ctrlKey &&
            !event.metaKey &&
            !event.altKey &&
            !event.shiftKey;

        if (!macMatch && !winMatch) return;

        event.preventDefault();
        event.stopPropagation();

        const nextRate = sameRate(currentRate(), RATE_FAST)
            ? RATE_NORMAL
            : RATE_FAST;
        pageOverrideRate = nextRate;
        applyAllRates();
        refreshMenu();
        showToast(`速度：${formatRate(currentRate())}（本页临时）`);
    }

    function setupNavigationHooks() {
        const checkUrlChanged = () => {
            if (location.href === lastUrl) return;
            lastUrl = location.href;
            pageOverrideRate = null;
            refreshMenu();
            scheduleApplyAll();
        };

        const wrapHistory = (methodName) => {
            const original = history[methodName];
            history[methodName] = function wrappedHistoryMethod(...args) {
                try {
                    const result = original.apply(this, args);
                    queueMicrotask(checkUrlChanged);
                    return result;
                } catch (error) {
                    queueMicrotask(checkUrlChanged);
                    console.error(
                        '[MediaSpeedToggle] history wrapper failed:',
                        error,
                    );
                    throw error;
                }
            };
        };

        wrapHistory('pushState');
        wrapHistory('replaceState');
        window.addEventListener('popstate', checkUrlChanged, true);

        const rootObserver = new MutationObserver((mutations) => {
            let changed = false;
            let ruleMayChange = false;
            mutations.forEach((mutation) => {
                mutation.addedNodes.forEach((node) => {
                    changed = applyRatesForNode(node) || changed;
                    ruleMayChange = mayAffectPageRule(node) || ruleMayChange;
                });
            });
            if (changed) lastIncrementalApplyAt = Date.now();
            if (ruleMayChange) scheduleApplyAll();
            checkUrlChanged();
        });
        rootObserver.observe(document.documentElement, {
            childList: true,
            subtree: true,
        });
    }

    function start() {
        window.addEventListener('keydown', handleShortcut, true);
        setupNavigationHooks();

        applyAllRates();
        refreshMenu();

        window.setInterval(() => {
            if (document.hidden) return;
            if (!document.querySelector('video, audio')) return;
            if (Date.now() - lastIncrementalApplyAt < HEAL_INTERVAL_MS) return;
            applyAllRates();
        }, HEAL_INTERVAL_MS);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', start, { once: true });
    } else {
        start();
    }
})();
