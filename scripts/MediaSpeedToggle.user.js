// ==UserScript==
// @name         MediaSpeedToggle
// @name:zh-CN   全站视频倍速一键切换
// @namespace    https://github.com/dcjanus/userscripts
// @description  在大多数网站通过快捷键切换 1x/3x，并跨页面持久化当前速度
// @author       DCjanus
// @match        https://*/*
// @match        http://*/*
// @icon         https://raw.githubusercontent.com/DCjanus/userscripts/master/assets/media-speed-toggle.svg
// @version      20260322
// @license      MIT
// @run-at       document-start
// @grant        GM_getValue
// @grant        GM_registerMenuCommand
// @grant        GM_setValue
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
    const STORAGE_KEY = 'preferredRate';
    const REAPPLY_DEBOUNCE_MS = 120;
    const HEAL_INTERVAL_MS = 1500;

    const isMac =
        navigator.userAgentData?.platform === 'macOS' ||
        /\bMac(?:intosh)?\b/i.test(navigator.userAgent) ||
        navigator.platform?.toUpperCase().includes('MAC');
    let preferredRate = loadPreferredRate();
    let lastUrl = location.href;
    let pendingApply = 0;
    let toastTimer = 0;
    let lastIncrementalApplyAt = 0;
    let menuCommandId = null;

    const applyingMap = new WeakMap();
    const boundMedia = new WeakSet();

    function currentRate() {
        return preferredRate;
    }

    function sanitizeRate(rate) {
        return rate === RATE_NORMAL ? RATE_NORMAL : RATE_FAST;
    }

    function loadPreferredRate() {
        return sanitizeRate(GM_getValue(STORAGE_KEY, RATE_FAST));
    }

    function persistPreferredRate(rate) {
        preferredRate = sanitizeRate(rate);
        GM_setValue(STORAGE_KEY, preferredRate);
    }

    function refreshMenu() {
        if (menuCommandId !== null) {
            GM_unregisterMenuCommand(menuCommandId);
        }
        const menuText = `速度：${currentRate()}x`;
        menuCommandId = GM_registerMenuCommand(menuText.trim(), () => {
            showToast(`当前速度：${currentRate()}x`);
        });
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
        try {
            media.defaultPlaybackRate = rate;
            media.playbackRate = rate;
        } finally {
            applyingMap.set(media, false);
        }
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

        persistPreferredRate(
            preferredRate === RATE_FAST ? RATE_NORMAL : RATE_FAST,
        );
        applyAllRates();
        refreshMenu();
        showToast(`速度：${currentRate()}x`);
    }

    function setupNavigationHooks() {
        const checkUrlChanged = () => {
            if (location.href === lastUrl) return;
            lastUrl = location.href;
            preferredRate = loadPreferredRate();
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

        preferredRate = loadPreferredRate();
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
