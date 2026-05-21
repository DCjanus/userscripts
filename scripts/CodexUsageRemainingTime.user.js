// ==UserScript==
// @name         CodexUsageRemainingTime
// @name:zh-CN   Codex 用量窗口节奏提示
// @namespace    https://github.com/DCjanus/userscripts
// @description  在 Codex 分析页展示用量窗口剩余时间，并标出额度消耗是否快于时间进度
// @author       DCjanus
// @match        https://chatgpt.com/codex/cloud/settings/analytics
// @icon         https://chatgpt.com/cdn/assets/favicon-l4nq08hd.svg
// @version      20260521
// @license      MIT
// ==/UserScript==
'use strict';

const SCRIPT_NAME = 'CodexUsageRemainingTime';
const RESET_PREFIX = '重置时间：';
const PACE_LINE_ATTR = 'data-codex-usage-pace-line';
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

function formatDuration(ms) {
    if (ms <= 0) {
        return '已重置';
    }

    const totalMinutes = Math.floor(ms / 60000);
    const minutes = totalMinutes % 60;
    const totalHours = Math.floor(totalMinutes / 60);
    const hours = totalHours % 24;
    const days = Math.floor(totalHours / 24);

    if (days > 0) {
        return `${days}天${hours}小时${minutes}分钟`;
    }
    if (hours > 0) {
        return `${hours}小时${minutes}分钟`;
    }
    return `${minutes}分钟`;
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

function parseQuotaRemainingPercent(article) {
    const match = normalizeText(article.textContent).match(/(\d{1,3})%\s*剩余/);
    if (!match) {
        return null;
    }
    return clampPercent(Number(match[1]));
}

function findResetElement(article) {
    const elements = Array.from(article.querySelectorAll('*')).filter(
        (element) => {
            if (element.hasAttribute(PACE_LINE_ATTR)) {
                return false;
            }
            return normalizeText(element.textContent).startsWith(RESET_PREFIX);
        },
    );

    return (
        elements.find(
            (element) =>
                !Array.from(element.children).some(
                    (child) =>
                        !child.hasAttribute(PACE_LINE_ATTR) &&
                        normalizeText(child.textContent).startsWith(
                            RESET_PREFIX,
                        ),
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
        if (child.hasAttribute(PACE_LINE_ATTR)) {
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

function findResetLine(resetElement) {
    const parent = resetElement.parentElement;
    if (!parent) {
        return resetElement;
    }
    return normalizeText(parent.textContent).startsWith(RESET_PREFIX)
        ? parent
        : resetElement;
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

function describePace(quotaRemainingPercent, timeRemainingPercent) {
    const diff = Math.round(quotaRemainingPercent - timeRemainingPercent);
    if (diff > 0) {
        return {
            text: `用量偏慢 ${diff}pp`,
            color: '#16a34a',
            markerColor: 'rgba(22, 163, 74, 0.9)',
        };
    }
    if (diff < 0) {
        return {
            text: `用量偏快 ${Math.abs(diff)}pp`,
            color: '#ca8a04',
            markerColor: 'rgba(202, 138, 4, 0.95)',
        };
    }
    return {
        text: '节奏持平',
        color: 'inherit',
        markerColor: 'rgba(107, 114, 128, 0.85)',
    };
}

function updateTimeMarker(progressHost, timeRemainingPercent, paceInfo) {
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
    if (marker.style.backgroundColor !== paceInfo.markerColor) {
        marker.style.backgroundColor = paceInfo.markerColor;
    }
    if (marker.title !== title) {
        marker.title = title;
    }
}

function updatePaceLine(
    resetLine,
    timeRemainingPercent,
    remainingMs,
    paceInfo,
) {
    if (resetLine.style.flexWrap !== 'wrap') {
        resetLine.style.flexWrap = 'wrap';
    }

    let line = resetLine.querySelector(`span[${PACE_LINE_ATTR}="true"]`);
    if (!line) {
        line = document.createElement('span');
        line.setAttribute(PACE_LINE_ATTR, 'true');
        line.className = 'text-token-text-tertiary';
        line.style.flexBasis = '100%';
        line.style.marginTop = '4px';
        line.style.fontWeight = '500';
        resetLine.appendChild(line);
    }

    const timeText = `${Math.round(timeRemainingPercent)}%（${formatDuration(remainingMs)}）`;
    const lineText = `时间剩余：${timeText} · ${paceInfo.text}`;
    if (line.textContent !== lineText) {
        line.textContent = lineText;
    }
    if (line.style.color !== paceInfo.color) {
        line.style.color = paceInfo.color;
    }
}

function updateArticle(article, now) {
    const title = getArticleTitle(article);
    const windowMs = getWindowMs(title);
    if (!windowMs) {
        return;
    }

    const quotaRemainingPercent = parseQuotaRemainingPercent(article);
    if (quotaRemainingPercent === null) {
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
    const paceInfo = describePace(quotaRemainingPercent, timeRemainingPercent);

    const progressHost = findProgressHost(article);
    if (progressHost) {
        updateTimeMarker(progressHost, timeRemainingPercent, paceInfo);
    }

    updatePaceLine(
        findResetLine(resetElement),
        timeRemainingPercent,
        remainingMs,
        paceInfo,
    );
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
