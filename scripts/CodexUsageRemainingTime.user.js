// ==UserScript==
// @name         CodexUsageRemainingTime
// @name:zh-CN   Codex 用量窗口时间刻度
// @namespace    https://github.com/DCjanus/userscripts
// @description  在 Codex 分析页的用量进度条上标出时间窗口剩余位置
// @author       DCjanus
// @match        https://chatgpt.com/codex/cloud/settings/analytics
// @icon         https://chatgpt.com/cdn/assets/favicon-l4nq08hd.svg
// @version      20260521
// @license      MIT
// ==/UserScript==
'use strict';

const SCRIPT_NAME = 'CodexUsageRemainingTime';
const RESET_PREFIX = '重置时间：';
const TIME_MARKER_ATTR = 'data-codex-usage-time-marker';
const UPDATE_INTERVAL_MS = 30 * 1000;
const WINDOW_FIVE_HOURS_MS = 5 * 60 * 60 * 1000;
const WINDOW_WEEK_MS = 7 * 24 * 60 * 60 * 1000;
let updateScheduled = false;

function normalizeText(text) {
    return (text || '').replace(/\s+/g, ' ').trim();
}

function parseResetDate(resetText, now) {
    const raw = normalizeText(resetText);
    if (!raw.startsWith(RESET_PREFIX)) {
        return null;
    }

    const value = raw.slice(RESET_PREFIX.length).trim();
    if (!value) {
        return null;
    }

    const fullMatch = value.match(
        /^(\d{4})年(\d{1,2})月(\d{1,2})日\s+(\d{1,2}):(\d{2})$/,
    );
    if (fullMatch) {
        return new Date(
            Number(fullMatch[1]),
            Number(fullMatch[2]) - 1,
            Number(fullMatch[3]),
            Number(fullMatch[4]),
            Number(fullMatch[5]),
            0,
            0,
        );
    }

    const shortMatch = value.match(/^(\d{1,2}):(\d{2})$/);
    if (shortMatch) {
        const candidate = new Date(
            now.getFullYear(),
            now.getMonth(),
            now.getDate(),
            Number(shortMatch[1]),
            Number(shortMatch[2]),
            0,
            0,
        );
        if (candidate.getTime() <= now.getTime()) {
            candidate.setDate(candidate.getDate() + 1);
        }
        return candidate;
    }

    return null;
}

function clampPercent(value) {
    return Math.max(0, Math.min(100, value));
}

function getWindowMs(title) {
    if (title.includes('5') && title.includes('小时')) {
        return WINDOW_FIVE_HOURS_MS;
    }
    if (title.includes('每周')) {
        return WINDOW_WEEK_MS;
    }
    return null;
}

function getArticleTitle(article) {
    const titleNode = article.querySelector('p');
    return normalizeText(titleNode?.textContent);
}

function findResetElement(article) {
    const elements = Array.from(article.querySelectorAll('*')).filter(
        (element) =>
            normalizeText(element.textContent).startsWith(RESET_PREFIX),
    );

    return (
        elements.find(
            (element) =>
                !Array.from(element.children).some((child) =>
                    normalizeText(child.textContent).startsWith(RESET_PREFIX),
                ),
        ) || null
    );
}

function extractResetText(resetElement) {
    for (const child of resetElement.childNodes) {
        if (child.nodeType === Node.TEXT_NODE) {
            const text = normalizeText(child.textContent);
            if (text.startsWith(RESET_PREFIX)) {
                return text;
            }
            continue;
        }

        if (child.nodeType !== Node.ELEMENT_NODE) {
            continue;
        }
        const text = normalizeText(child.textContent);
        if (text.startsWith(RESET_PREFIX)) {
            return text;
        }
    }

    const fallback = normalizeText(resetElement.textContent).match(
        /重置时间：\s*(\d{4}年\d{1,2}月\d{1,2}日\s+\d{1,2}:\d{2}|\d{1,2}:\d{2})/,
    );
    return fallback ? `${RESET_PREFIX}${fallback[1]}` : '';
}

function findProgressHost(article) {
    return (
        Array.from(article.querySelectorAll('div')).find(
            (element) =>
                element.classList.contains('relative') &&
                element.classList.contains('w-full'),
        ) || null
    );
}

function updateTimeMarker(progressHost, timeRemainingPercent) {
    let marker = progressHost.querySelector(`span[${TIME_MARKER_ATTR}="true"]`);
    if (!marker) {
        marker = document.createElement('span');
        marker.setAttribute(TIME_MARKER_ATTR, 'true');
        marker.style.position = 'absolute';
        marker.style.top = '-3px';
        marker.style.bottom = '-3px';
        marker.style.width = '2px';
        marker.style.borderRadius = '999px';
        marker.style.pointerEvents = 'none';
        marker.style.transform = 'translateX(-1px)';
        marker.style.boxShadow = '0 0 0 1px rgba(255, 255, 255, 0.75)';
        progressHost.appendChild(marker);
    }

    const left = `${clampPercent(timeRemainingPercent)}%`;
    const title = `时间窗口剩余 ${Math.round(timeRemainingPercent)}%`;
    if (marker.style.left !== left) {
        marker.style.left = left;
    }
    if (marker.style.backgroundColor !== 'rgb(202, 138, 4)') {
        marker.style.backgroundColor = '#ca8a04';
    }
    if (marker.title !== title) {
        marker.title = title;
    }
}

function updateArticle(article, now) {
    const title = getArticleTitle(article);
    const windowMs = getWindowMs(title);
    if (!windowMs) {
        return;
    }

    const resetElement = findResetElement(article);
    if (!resetElement) {
        return;
    }

    const resetDate = parseResetDate(extractResetText(resetElement), now);
    if (!resetDate) {
        return;
    }

    const remainingMs = resetDate.getTime() - now.getTime();
    const timeRemainingPercent = clampPercent((remainingMs / windowMs) * 100);

    const progressHost = findProgressHost(article);
    if (progressHost) {
        updateTimeMarker(progressHost, timeRemainingPercent);
    }
}

function updateAllCards() {
    const now = new Date();
    for (const article of document.querySelectorAll('article')) {
        updateArticle(article, now);
    }
}

function scheduleUpdateAllCards() {
    if (updateScheduled) {
        return;
    }

    updateScheduled = true;
    requestAnimationFrame(() => {
        updateScheduled = false;
        updateAllCards();
    });
}

function observeAndUpdate() {
    updateAllCards();

    const observer = new MutationObserver(() => {
        scheduleUpdateAllCards();
    });
    observer.observe(document.body, {
        childList: true,
        subtree: true,
        characterData: true,
    });

    setInterval(updateAllCards, UPDATE_INTERVAL_MS);
}

function main() {
    observeAndUpdate();
}

try {
    main();
} catch (error) {
    console.error(`[${SCRIPT_NAME}]`, error);
}
