// ==UserScript==
// @name         GitHubPrFileTreeReviewStats
// @name:zh-CN   GitHub PR 文件树审阅状态
// @namespace    https://github.com/DCjanus/userscripts
// @description  在 GitHub PR 文件树中显示每文件增删行数，并用字重区分 Viewed 状态
// @author       DCjanus
// @include      https://github.com/*/*/pull/*/files*
// @include      https://github.com/*/*/pull/*/changes*
// @icon         https://github.com/favicon.ico
// @version      20260522
// @license      MIT
// @grant        none
// @run-at       document-start
// ==/UserScript==
'use strict';

const SCRIPT_NAME = 'GitHubPrFileTreeReviewStats';
const STYLE_ID = 'rgh-pr-file-tree-review-stats-style';
const STATS_CLASS = 'rgh-pr-file-tree-review-stats';
const PATCHED_ATTR = 'data-rgh-pr-file-tree-review-stats';
const VIEWED_ATTR = 'data-rgh-pr-file-viewed';
const NETWORK_HOOKED = Symbol.for('GitHubPrFileTreeReviewStats.networkHooked');

const FILE_SELECTOR =
    '[id^="diff-"].js-file, [id^="diff-"][class*="Diff-module__diffTargetable"]';
const FILE_HEADER_SELECTOR =
    '.file-header, [class*="DiffHeader"], [class*="FileHeader"]';
const VIEWED_CONTROL_SELECTOR =
    'button[class*="MarkAsViewedButton"], input.js-reviewed-checkbox';
const FILE_TREE_LINK_SELECTOR = 'a[href^="#diff-"]';

let updateScheduled = false;
let observerStarted = false;

function isPrFilesPage() {
    return /^\/[^/]+\/[^/]+\/pull\/\d+\/(files|changes)/.test(
        location.pathname,
    );
}

function ensureStyle() {
    if (document.getElementById(STYLE_ID)) {
        return;
    }

    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `
        li[${VIEWED_ATTR}="false"] a[href^="#diff-"],
        a[${VIEWED_ATTR}="false"][href^="#diff-"] {
            font-weight: 600;
        }

        li[${VIEWED_ATTR}="true"] a[href^="#diff-"],
        a[${VIEWED_ATTR}="true"][href^="#diff-"] {
            font-weight: 400;
        }

        .${STATS_CLASS} {
            align-items: center;
            display: inline-flex;
            flex-shrink: 0;
            font-size: 12px;
            font-variant-numeric: tabular-nums;
            gap: 4px;
            line-height: 16px;
            margin-left: auto;
            padding-left: 8px;
            white-space: nowrap;
        }

        .${STATS_CLASS}__added {
            color: var(--fgColor-success, var(--color-success-fg, #1a7f37));
        }

        .${STATS_CLASS}__deleted {
            color: var(--fgColor-danger, var(--color-danger-fg, #d1242f));
        }
    `;
    document.head.appendChild(style);
}

function parseCount(text, word) {
    const match = text.match(new RegExp(`(\\d+)\\s+${word}s?`, 'i'));
    return match ? Number(match[1]) : null;
}

function parseLineStats(text) {
    const normalized = text.replace(/\s+/g, ' ').trim();
    const additions = parseCount(normalized, 'addition');
    const deletions = parseCount(normalized, 'deletion');
    if (additions !== null || deletions !== null) {
        return {
            additions: additions ?? 0,
            deletions: deletions ?? 0,
        };
    }

    const compactMatch = normalized.match(/[+＋]\s*(\d+)\s*[−-]\s*(\d+)/);
    if (compactMatch) {
        return {
            additions: Number(compactMatch[1]),
            deletions: Number(compactMatch[2]),
        };
    }

    return null;
}

function getFileStats(file) {
    const header = file.querySelector(FILE_HEADER_SELECTOR);
    if (!header) {
        return null;
    }

    const statText =
        Array.from(header.querySelectorAll('.sr-only'))
            .map((element) => element.textContent || '')
            .find((text) => /addition|deletion|Lines changed/i.test(text)) ||
        header.textContent ||
        '';

    return parseLineStats(statText);
}

function getViewedState(file) {
    const input = file.querySelector('input.js-reviewed-checkbox');
    if (input) {
        return input.checked;
    }

    const button = file.querySelector(
        'button[class*="MarkAsViewedButton"], button[aria-pressed][aria-label*="Viewed"], button[aria-pressed][aria-label*="viewed"]',
    );
    if (!button) {
        return null;
    }

    const pressed = button.getAttribute('aria-pressed');
    if (pressed === 'true') {
        return true;
    }
    if (pressed === 'false') {
        return false;
    }

    const label = button.getAttribute('aria-label') || '';
    if (/not viewed/i.test(label)) {
        return false;
    }
    if (/viewed/i.test(label)) {
        return true;
    }

    return null;
}

function getHashFromLink(link) {
    const href = link.getAttribute('href');
    return href?.startsWith('#diff-') ? href.slice(1) : null;
}

function getFileTreeRow(link) {
    return (
        link.closest('li[class*="file-tree-row"]') ||
        link.closest('li.ActionListItem') ||
        (link.matches('.ActionList-content') ? link : null)
    );
}

function collectFileTreeRows() {
    const rowsByHash = new Map();

    for (const link of document.querySelectorAll(FILE_TREE_LINK_SELECTOR)) {
        const hash = getHashFromLink(link);
        const row = getFileTreeRow(link);
        if (hash && row) {
            rowsByHash.set(hash, { row, link });
        }
    }

    return rowsByHash;
}

function getStatsHost(row, link) {
    if (row === link) {
        return link;
    }

    return (
        row.querySelector('[class*="TreeViewItemContent"]') ||
        row.querySelector('.ActionList-content') ||
        link.closest('[class*="TreeViewItemContentText"]') ||
        link.parentElement
    );
}

function setAttributeValue(element, name, value) {
    if (value === null) {
        if (element.hasAttribute(name)) {
            element.removeAttribute(name);
        }
        return;
    }

    const stringValue = String(value);
    if (element.getAttribute(name) !== stringValue) {
        element.setAttribute(name, stringValue);
    }
}

function renderStatsElement(stats) {
    const element = document.createElement('span');
    const added = document.createElement('span');
    const deleted = document.createElement('span');

    element.className = STATS_CLASS;
    element.setAttribute(
        'aria-label',
        `${stats.additions} additions, ${stats.deletions} deletions`,
    );
    element.title = `${stats.additions} additions, ${stats.deletions} deletions`;

    added.className = `${STATS_CLASS}__added`;
    added.textContent = `+${stats.additions}`;

    deleted.className = `${STATS_CLASS}__deleted`;
    deleted.textContent = `-${stats.deletions}`;

    element.append(added, deleted);
    return element;
}

function updateRow(rowInfo, stats) {
    const { row, link } = rowInfo;
    const host = getStatsHost(row, link);
    if (!host) {
        return;
    }

    setAttributeValue(row, PATCHED_ATTR, true);
    setAttributeValue(
        row,
        VIEWED_ATTR,
        typeof stats.viewed === 'boolean' ? stats.viewed : null,
    );

    if (row === link) {
        setAttributeValue(
            link,
            VIEWED_ATTR,
            typeof stats.viewed === 'boolean' ? stats.viewed : null,
        );
    }

    const existing = host.querySelector(`.${STATS_CLASS}`);
    const expected = `+${stats.additions}-${stats.deletions}`;
    if (existing) {
        if (existing.textContent.replace(/\s+/g, '') !== expected) {
            existing.replaceWith(renderStatsElement(stats));
        }
        return;
    }

    host.appendChild(renderStatsElement(stats));
}

function updateFile(file, rowsByHash = collectFileTreeRows(), viewedOverride) {
    const stats = getFileStats(file);
    if (!stats) {
        return;
    }

    const rowInfo = rowsByHash.get(file.id);
    if (!rowInfo) {
        return;
    }

    updateRow(rowInfo, {
        ...stats,
        viewed:
            typeof viewedOverride === 'boolean'
                ? viewedOverride
                : getViewedState(file),
    });
}

function updateFileTree() {
    updateScheduled = false;
    if (!isPrFilesPage() || !document.body) {
        return;
    }

    ensureStyle();
    const rowsByHash = collectFileTreeRows();
    for (const file of document.querySelectorAll(FILE_SELECTOR)) {
        updateFile(file, rowsByHash);
    }
}

function scheduleUpdate() {
    if (updateScheduled) {
        return;
    }

    updateScheduled = true;
    requestAnimationFrame(updateFileTree);
}

function schedulePostNetworkUpdate() {
    requestAnimationFrame(() => {
        requestAnimationFrame(scheduleUpdate);
    });
}

function getFileFromControl(control) {
    return control.closest(FILE_SELECTOR);
}

function handleViewedClick(event) {
    if (!(event.target instanceof Element)) {
        return;
    }

    const control = event.target.closest(VIEWED_CONTROL_SELECTOR);
    if (!control || control instanceof HTMLInputElement) {
        return;
    }

    const file = getFileFromControl(control);
    if (!file) {
        return;
    }

    const currentViewed = getViewedState(file);
    if (typeof currentViewed === 'boolean') {
        updateFile(file, collectFileTreeRows(), !currentViewed);
    }
}

function handleViewedChange(event) {
    if (
        event.target instanceof HTMLInputElement &&
        event.target.matches('input.js-reviewed-checkbox')
    ) {
        const file = getFileFromControl(event.target);
        if (file) {
            updateFile(file);
        }
    }
}

function installNetworkHooks() {
    if (window[NETWORK_HOOKED]) {
        return;
    }

    Object.defineProperty(window, NETWORK_HOOKED, {
        value: true,
    });

    const nativeFetch = window.fetch;
    if (typeof nativeFetch === 'function') {
        window.fetch = async function fetchWithReviewStatsUpdate(...args) {
            try {
                return await nativeFetch.apply(this, args);
            } finally {
                schedulePostNetworkUpdate();
            }
        };
    }

    const nativeSend = XMLHttpRequest.prototype.send;
    XMLHttpRequest.prototype.send = function sendWithReviewStatsUpdate(
        ...args
    ) {
        this.addEventListener('loadend', schedulePostNetworkUpdate, {
            once: true,
        });
        return nativeSend.apply(this, args);
    };
}

function start() {
    if (observerStarted) {
        return;
    }
    observerStarted = true;

    installNetworkHooks();
    scheduleUpdate();

    const observer = new MutationObserver(scheduleUpdate);
    observer.observe(document.documentElement, {
        childList: true,
        characterData: true,
        subtree: true,
        attributes: true,
        attributeFilter: [
            'aria-label',
            'aria-pressed',
            'checked',
            'class',
            'data-file-user-viewed',
            'hidden',
        ],
    });

    document.addEventListener('click', handleViewedClick, true);
    document.addEventListener('change', handleViewedChange, true);

    document.addEventListener('turbo:load', scheduleUpdate);
    document.addEventListener('turbo:render', scheduleUpdate);
    document.addEventListener('pjax:end', scheduleUpdate);
    window.addEventListener('popstate', scheduleUpdate);
}

start();

console.debug(`[${SCRIPT_NAME}] loaded`);
