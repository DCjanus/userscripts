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
// ==/UserScript==
'use strict';

const SCRIPT_NAME = 'GitHubPrFileTreeReviewStats';
const STYLE_ID = 'rgh-pr-file-tree-review-stats-style';
const STATS_CLASS = 'rgh-pr-file-tree-review-stats';
const PATCHED_ATTR = 'data-rgh-pr-file-tree-review-stats';
const VIEWED_ATTR = 'data-rgh-pr-file-viewed';
const UPDATE_DELAY_MS = 100;
let updateTimer = 0;

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
        li[${VIEWED_ATTR}="false"] a[href^="#diff-"] {
            font-weight: 600;
        }

        li[${VIEWED_ATTR}="true"] a[href^="#diff-"] {
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
    const header =
        file.querySelector('.file-header') ||
        file.querySelector('[class*="DiffHeader"]') ||
        file.querySelector('[class*="FileHeader"]');
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

function collectDiffInfo() {
    const infoByHash = new Map();
    const files = document.querySelectorAll(
        '[id^="diff-"].js-file, [id^="diff-"][class*="Diff-module__diffTargetable"]',
    );

    for (const file of files) {
        const stats = getFileStats(file);
        if (!stats) {
            continue;
        }

        infoByHash.set(file.id, {
            ...stats,
            viewed: getViewedState(file),
        });
    }

    return infoByHash;
}

function collectFileTreeRows() {
    const rowsByHash = new Map();

    for (const link of document.querySelectorAll('a[href^="#diff-"]')) {
        const href = link.getAttribute('href');
        const row = link.closest('li[class*="file-tree-row"]');
        if (!href || !row) {
            continue;
        }

        rowsByHash.set(href.slice(1), { row, link });
    }

    return rowsByHash;
}

function getStatsHost(row, link) {
    return (
        row.querySelector('[class*="TreeViewItemContent"]') ||
        link.closest('[class*="TreeViewItemContentText"]') ||
        link.parentElement
    );
}

function renderStatsElement(stats) {
    const element = document.createElement('span');
    element.className = STATS_CLASS;
    element.setAttribute(
        'aria-label',
        `${stats.additions} additions, ${stats.deletions} deletions`,
    );
    element.title = `${stats.additions} additions, ${stats.deletions} deletions`;
    element.innerHTML = `
        <span class="${STATS_CLASS}__added">+${stats.additions}</span>
        <span class="${STATS_CLASS}__deleted">-${stats.deletions}</span>
    `;
    return element;
}

function updateRow(rowInfo, stats) {
    const { row, link } = rowInfo;
    const host = getStatsHost(row, link);
    if (!host) {
        return;
    }

    row.setAttribute(PATCHED_ATTR, 'true');
    if (stats.viewed === null) {
        row.removeAttribute(VIEWED_ATTR);
    } else {
        row.setAttribute(VIEWED_ATTR, String(stats.viewed));
    }

    const existing = host.querySelector(`.${STATS_CLASS}`);
    if (existing) {
        const expected = `+${stats.additions}-${stats.deletions}`;
        if (existing.textContent.replace(/\s+/g, '') !== expected) {
            existing.replaceWith(renderStatsElement(stats));
        }
        return;
    }

    host.appendChild(renderStatsElement(stats));
}

function updateFileTree() {
    if (!isPrFilesPage()) {
        return;
    }

    ensureStyle();
    const diffInfo = collectDiffInfo();
    const fileTreeRows = collectFileTreeRows();

    for (const [hash, rowInfo] of fileTreeRows) {
        const stats = diffInfo.get(hash);
        if (stats) {
            updateRow(rowInfo, stats);
        }
    }
}

function scheduleUpdate() {
    window.clearTimeout(updateTimer);
    updateTimer = window.setTimeout(updateFileTree, UPDATE_DELAY_MS);
}

function start() {
    scheduleUpdate();

    const observer = new MutationObserver(scheduleUpdate);
    observer.observe(document.body, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ['aria-pressed', 'aria-label', 'checked'],
    });

    document.addEventListener(
        'click',
        (event) => {
            if (!(event.target instanceof Element)) {
                return;
            }

            if (
                event.target.closest(
                    'button[class*="MarkAsViewedButton"], input.js-reviewed-checkbox',
                )
            ) {
                scheduleUpdate();
            }
        },
        true,
    );

    document.addEventListener('turbo:load', scheduleUpdate);
    document.addEventListener('pjax:end', scheduleUpdate);
    window.addEventListener('popstate', scheduleUpdate);
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start, { once: true });
} else {
    start();
}

console.debug(`[${SCRIPT_NAME}] loaded`);
