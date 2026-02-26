// ==UserScript==
// @name         MediaSpeedToggle
// @name:zh-CN   全站视频倍速一键切换
// @namespace    https://github.com/dcjanus/userscripts
// @description  在大多数网站通过快捷键切换 1x/3x，直播页自动锁定 1x
// @author       DCjanus
// @match        https://*/*
// @match        http://*/*
// @version      20260226.3
// @license      MIT
// @run-at       document-start
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
    const REAPPLY_DEBOUNCE_MS = 120;
    const LIVE_RECHECK_MS = 2500;
    const HEAL_INTERVAL_MS = 1500;

    const isMac =
        navigator.userAgentData?.platform === 'macOS' ||
        /\bMac(?:intosh)?\b/i.test(navigator.userAgent) ||
        navigator.platform?.toUpperCase().includes('MAC');
    let preferredRate = RATE_FAST;
    let liveLocked = false;
    let lastUrl = location.href;
    let pendingApply = 0;
    let toastTimer = 0;
    let lastIncrementalApplyAt = 0;

    const applyingMap = new WeakMap();
    const boundMedia = new WeakSet();

    function currentRate() {
        return liveLocked ? RATE_NORMAL : preferredRate;
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
            Math.abs(media.playbackRate - rate) < 0.001 &&
            Math.abs(media.defaultPlaybackRate - rate) < 0.001
        ) {
            return;
        }

        applyingMap.set(media, true);
        media.defaultPlaybackRate = rate;
        media.playbackRate = rate;
        applyingMap.set(media, false);
    }

    function bindMedia(media) {
        if (!(media instanceof HTMLMediaElement) || boundMedia.has(media))
            return;
        boundMedia.add(media);

        media.addEventListener(
            'ratechange',
            () => {
                if (applyingMap.get(media)) return;
                setMediaRate(media);
            },
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
        }, REAPPLY_DEBOUNCE_MS);
    }

    function isEditingTarget(target) {
        if (!(target instanceof HTMLElement)) return false;
        if (target.isContentEditable) return true;
        const tag = target.tagName;
        return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';
    }

    function isLiveByUrl() {
        const host = location.host.toLowerCase();
        const path = location.pathname.toLowerCase();
        const search = location.search.toLowerCase();

        if (host === 'live.bilibili.com' || host.endsWith('.live.bilibili.com'))
            return true;
        if (host.endsWith('youtube.com') && path.startsWith('/live'))
            return true;
        if (
            host.includes('pornhub') &&
            /(\/live|\/model|\/webcam|\/cam)/.test(path)
        )
            return true;

        if (
            host.endsWith('bilibili.com') &&
            /(^\/blanc\/|^\/live\/|\/live$)/.test(path)
        )
            return true;
        if (host.endsWith('youtube.com') && search.includes('live='))
            return true;

        return false;
    }

    function isLiveByDomSignal() {
        const metaLive = document.querySelector(
            'meta[itemprop="isLiveBroadcast"][content="True"]',
        );
        if (metaLive) return true;

        const title = (document.title || '').toLowerCase();
        if (/\blive\b|正在直播|直播中/.test(title)) return true;

        const hasLiveKeyword = (value) => {
            if (!value) return false;
            return /\blive\b/i.test(value) || /(正在直播|直播中)/.test(value);
        };

        const candidates = document.querySelectorAll(
            '[aria-label], [data-title], [data-live], ytd-badge-supported-renderer, .live-status, .live-room-app',
        );
        for (const candidate of candidates) {
            if (!(candidate instanceof Element)) continue;

            if (hasLiveKeyword(candidate.getAttribute('aria-label')))
                return true;
            if (hasLiveKeyword(candidate.getAttribute('data-title')))
                return true;

            const dataLive = (
                candidate.getAttribute('data-live') || ''
            ).toLowerCase();
            if (dataLive === 'true' || dataLive === '1' || dataLive === 'live')
                return true;

            for (const classToken of candidate.classList) {
                if (
                    /^(is-)?live$/i.test(classToken) ||
                    /^live[-_]/i.test(classToken) ||
                    /live[-_]badge/i.test(classToken)
                ) {
                    return true;
                }
            }

            if (
                /(^|[-_])live([_-]|$)/i.test(candidate.id) ||
                /live[-_]badge/i.test(candidate.id)
            )
                return true;
        }

        return false;
    }

    function detectLivePage() {
        return isLiveByUrl() || isLiveByDomSignal();
    }

    function refreshLiveLock(showMessage) {
        const locked = detectLivePage();
        if (locked === liveLocked) return;

        liveLocked = locked;
        applyAllRates();

        if (showMessage) {
            showToast(
                liveLocked
                    ? '直播页：已锁定 1x'
                    : `直播锁已解除：${currentRate()}x`,
            );
        }
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

        if (liveLocked) {
            preferredRate = RATE_NORMAL;
            applyAllRates();
            showToast('直播页仅允许 1x');
            return;
        }

        preferredRate = preferredRate === RATE_FAST ? RATE_NORMAL : RATE_FAST;
        applyAllRates();
        showToast(`速度：${preferredRate}x`);
    }

    function setupNavigationHooks() {
        const checkUrlChanged = () => {
            if (location.href === lastUrl) return;
            lastUrl = location.href;
            refreshLiveLock(false);
            scheduleApplyAll();
        };

        const wrapHistory = (methodName) => {
            const original = history[methodName];
            history[methodName] = function wrappedHistoryMethod(...args) {
                const result = original.apply(this, args);
                queueMicrotask(checkUrlChanged);
                return result;
            };
        };

        wrapHistory('pushState');
        wrapHistory('replaceState');
        window.addEventListener('popstate', checkUrlChanged, true);

        const rootObserver = new MutationObserver((mutations) => {
            let changed = false;
            mutations.forEach((mutation) => {
                mutation.addedNodes.forEach((node) => {
                    changed = applyRatesForNode(node) || changed;
                });
            });
            if (changed) lastIncrementalApplyAt = Date.now();
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

        refreshLiveLock(false);
        applyAllRates();

        window.setInterval(() => {
            refreshLiveLock(false);
        }, LIVE_RECHECK_MS);

        window.setInterval(() => {
            if (document.hidden) return;
            if (!document.querySelector('video, audio')) return;
            if (Date.now() - lastIncrementalApplyAt < HEAL_INTERVAL_MS) return;
            applyAllRates();
        }, HEAL_INTERVAL_MS);

        showToast('MediaSpeedToggle 已加载（⌘/Ctrl + E）');
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', start, { once: true });
    } else {
        start();
    }
})();
