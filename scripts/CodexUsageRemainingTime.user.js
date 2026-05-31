// ==UserScript==
// @name         CodexUsageRemainingTime
// @name:zh-CN   Codex 用量窗口时间刻度
// @namespace    https://github.com/DCjanus/userscripts
// @description  在 Codex 分析页的用量进度条上标出时间窗口剩余位置
// @author       DCjanus
// @match        https://chatgpt.com/codex/cloud/settings/analytics
// @icon         https://chatgpt.com/cdn/assets/favicon-l4nq08hd.svg
// @version      20260525
// @license      MIT
// ==/UserScript==
'use strict';

const SCRIPT_NAME = 'CodexUsageRemainingTime';
const RESET_PREFIX = '重置时间：';
const RATE_LIMIT_API_URL = '/backend-api/wham/usage';
const TIME_MARKER_ATTR = 'data-codex-usage-time-marker';
const WEEK_SEGMENTS_ATTR = 'data-codex-usage-week-segments';
const MARKER_COLOR = 'rgb(217, 119, 6)';
const SEGMENT_COLOR = 'rgba(107, 114, 128, 0.42)';
const UPDATE_INTERVAL_MS = 30 * 1000;
const USAGE_CACHE_MS = 5 * 60 * 1000;
const WINDOW_WEEK_MS = 7 * 24 * 60 * 60 * 1000;
const WINDOW_WEEK_SECONDS = WINDOW_WEEK_MS / 1000;
const WEEK_DAYS = 7;
let updateScheduled = false;
let usageSnapshot = null;
let usageFetchPromise = null;
let usageFetchFailed = false;

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
    if (title.includes('每周')) {
        return WINDOW_WEEK_MS;
    }
    return null;
}

function isApproximately(value, target) {
    return (
        typeof value === 'number' &&
        Number.isFinite(value) &&
        value > 0 &&
        Math.abs(value - target) <= target * 0.05
    );
}

function getWeeklyLimitName(title) {
    const normalizedTitle = normalizeText(title);
    const zhSuffix = '每周使用限额';
    if (normalizedTitle.endsWith(zhSuffix)) {
        return normalizedTitle.slice(0, -zhSuffix.length).trim();
    }

    const enSuffix = 'Weekly usage limit';
    if (normalizedTitle.endsWith(enSuffix)) {
        return normalizedTitle.slice(0, -enSuffix.length).trim();
    }

    return null;
}

function normalizeLimitName(value) {
    return normalizeText(value).toLowerCase();
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

function getWindowResetAtMs(windowData, fetchedAtMs) {
    const resetAfterSeconds = Number(windowData?.reset_after_seconds);
    if (!Number.isFinite(resetAfterSeconds) || resetAfterSeconds < 0) {
        return null;
    }
    return fetchedAtMs + resetAfterSeconds * 1000;
}

function collectWeeklyWindows(usageData, fetchedAtMs) {
    const windows = [];
    const addWindow = (limitName, windowData) => {
        if (
            !windowData ||
            !isApproximately(
                Number(windowData.limit_window_seconds),
                WINDOW_WEEK_SECONDS,
            )
        ) {
            return;
        }

        const resetAtMs = getWindowResetAtMs(windowData, fetchedAtMs);
        if (resetAtMs === null) {
            return;
        }

        windows.push({
            limitName: normalizeLimitName(limitName),
            resetAtMs,
            windowMs: WINDOW_WEEK_MS,
        });
    };

    addWindow('', usageData?.rate_limit?.primary_window);
    addWindow('', usageData?.rate_limit?.secondary_window);

    for (const additionalLimit of usageData?.additional_rate_limits || []) {
        addWindow(
            additionalLimit?.limit_name || '',
            additionalLimit?.rate_limit?.primary_window,
        );
        addWindow(
            additionalLimit?.limit_name || '',
            additionalLimit?.rate_limit?.secondary_window,
        );
    }

    return windows;
}

async function fetchUsageSnapshot() {
    const nowMs = Date.now();
    if (usageSnapshot && nowMs - usageSnapshot.fetchedAtMs < USAGE_CACHE_MS) {
        return usageSnapshot;
    }

    if (usageFetchPromise) {
        return usageFetchPromise;
    }

    usageFetchPromise = fetch(RATE_LIMIT_API_URL, {
        credentials: 'include',
        headers: {
            accept: 'application/json',
        },
    })
        .then((response) => {
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }
            return response.json();
        })
        .then((usageData) => {
            const fetchedAtMs = Date.now();
            usageSnapshot = {
                fetchedAtMs,
                weeklyWindows: collectWeeklyWindows(usageData, fetchedAtMs),
            };
            usageFetchFailed = false;
            return usageSnapshot;
        })
        .catch((error) => {
            usageSnapshot = null;
            if (!usageFetchFailed) {
                usageFetchFailed = true;
                console.warn(
                    `[${SCRIPT_NAME}] Failed to fetch usage data`,
                    error,
                );
            }
            return null;
        })
        .finally(() => {
            usageFetchPromise = null;
        });

    return usageFetchPromise;
}

function findWeeklyWindow(limitWindows, title) {
    const limitName = getWeeklyLimitName(title);
    if (limitName === null) {
        return null;
    }

    const normalizedLimitName = normalizeLimitName(limitName);
    return (
        limitWindows.find(
            (windowData) => windowData.limitName === normalizedLimitName,
        ) || null
    );
}

function setStyleValue(element, property, value) {
    if (element.style[property] !== value) {
        element.style[property] = value;
    }
}

function updateWeeklySegments(progressHost) {
    let segments = progressHost.querySelector(
        `span[${WEEK_SEGMENTS_ATTR}="true"]`,
    );
    if (!segments) {
        segments = document.createElement('span');
        segments.setAttribute(WEEK_SEGMENTS_ATTR, 'true');
        for (let day = 1; day < WEEK_DAYS; day += 1) {
            const divider = document.createElement('span');
            divider.style.position = 'absolute';
            divider.style.top = '-3px';
            divider.style.bottom = '-3px';
            divider.style.left = `${(day / WEEK_DAYS) * 100}%`;
            divider.style.width = '1px';
            divider.style.transform = 'translateX(-1px)';
            divider.style.backgroundColor = SEGMENT_COLOR;
            divider.style.boxShadow = '0 0 0 1px rgba(255, 255, 255, 0.5)';
            segments.appendChild(divider);
        }
        progressHost.appendChild(segments);
    }

    setStyleValue(segments, 'position', 'absolute');
    setStyleValue(segments, 'inset', '0');
    setStyleValue(segments, 'pointerEvents', 'none');
}

function getWeekDayIndex(resetDate, now) {
    const windowStartMs = resetDate.getTime() - WINDOW_WEEK_MS;
    const elapsedMs = now.getTime() - windowStartMs;
    const rawIndex = Math.floor((elapsedMs / WINDOW_WEEK_MS) * WEEK_DAYS);
    return Math.max(0, Math.min(WEEK_DAYS - 1, rawIndex));
}

function updateWeeklyDayMarker(
    progressHost,
    resetDate,
    now,
    timeRemainingPercent,
) {
    updateWeeklySegments(progressHost);

    let marker = progressHost.querySelector(`span[${TIME_MARKER_ATTR}="true"]`);
    if (!marker) {
        marker = document.createElement('span');
        marker.setAttribute(TIME_MARKER_ATTR, 'true');
        progressHost.appendChild(marker);
    }

    const dayIndex = getWeekDayIndex(resetDate, now);
    const left = `${clampPercent(timeRemainingPercent)}%`;
    const title = `每周窗口：当前第 ${dayIndex + 1} 天 / 共 ${WEEK_DAYS} 天`;
    setStyleValue(marker, 'position', 'absolute');
    setStyleValue(marker, 'top', 'calc(100% + 3px)');
    setStyleValue(marker, 'bottom', '');
    setStyleValue(marker, 'left', left);
    setStyleValue(marker, 'width', '8px');
    setStyleValue(marker, 'height', '8px');
    setStyleValue(marker, 'borderLeft', '');
    setStyleValue(marker, 'borderRight', '');
    setStyleValue(marker, 'borderBottom', '');
    setStyleValue(marker, 'borderRadius', '999px');
    setStyleValue(marker, 'pointerEvents', 'none');
    setStyleValue(marker, 'transform', 'translateX(-4px)');
    setStyleValue(marker, 'backgroundColor', MARKER_COLOR);
    setStyleValue(
        marker,
        'boxShadow',
        '0 0 0 2px rgba(255, 255, 255, 0.95), 0 1px 3px rgba(0, 0, 0, 0.18)',
    );
    if (marker.title !== title) {
        marker.title = title;
    }
}

function updateArticleFromApi(article, now, limitWindows) {
    const title = getArticleTitle(article);
    const weeklyWindow = findWeeklyWindow(limitWindows, title);
    if (!weeklyWindow) {
        return false;
    }

    const remainingMs = weeklyWindow.resetAtMs - now.getTime();
    const timeRemainingPercent = clampPercent(
        (remainingMs / weeklyWindow.windowMs) * 100,
    );

    const progressHost = findProgressHost(article);
    if (!progressHost) {
        return false;
    }

    updateWeeklyDayMarker(
        progressHost,
        new Date(weeklyWindow.resetAtMs),
        now,
        timeRemainingPercent,
    );
    return true;
}

function updateArticleFromResetText(article, now) {
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
    if (!progressHost) {
        return;
    }

    updateWeeklyDayMarker(progressHost, resetDate, now, timeRemainingPercent);
}

async function updateAllCardsAsync() {
    const now = new Date();
    const snapshot = await fetchUsageSnapshot();
    const weeklyWindows = snapshot?.weeklyWindows || [];

    for (const article of document.querySelectorAll('article')) {
        if (
            weeklyWindows.length > 0 &&
            updateArticleFromApi(article, now, weeklyWindows)
        ) {
            continue;
        }

        updateArticleFromResetText(article, now);
    }
}

function updateAllCards() {
    updateAllCardsAsync().catch((error) => {
        console.error(`[${SCRIPT_NAME}]`, error);
    });
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
