// ==UserScript==
// @name         CodexUsageRemainingTime
// @name:zh-CN   Codex 用量窗口剩余时间
// @namespace    https://github.com/DCjanus/userscripts
// @description  在 Codex 用量页面展示每个用量窗口剩余时间
// @author       DCjanus
// @match        https://chatgpt.com/codex/settings/usage
// @icon         https://chatgpt.com/cdn/assets/favicon-l4nq08hd.svg
// @version      20251226
// @license      MIT
// ==/UserScript==
'use strict';

const SCRIPT_NAME = 'CodexUsageRemainingTime';
const RESET_PREFIX = '重置时间：';
const REMAINING_ATTR = 'data-codex-remaining-time';
const UPDATE_INTERVAL_MS = 30 * 1000;
const WINDOW_FIVE_HOURS_MS = 5 * 60 * 60 * 1000;
const WINDOW_WEEK_MS = 7 * 24 * 60 * 60 * 1000;

function parseResetDate(text, now) {
    const raw = text.trim().replace(/\s+/g, ' ');
    if (!raw.startsWith(RESET_PREFIX)) {
        return null;
    }
    const value = raw.slice(RESET_PREFIX.length).trim();
    if (!value) {
        return null;
    }

    // 长格式：2025年12月26日 10:52
    const fullMatch = value.match(
        /^(\d{4})年(\d{1,2})月(\d{1,2})日\s+(\d{1,2}):(\d{2})$/,
    );
    if (fullMatch) {
        const year = Number(fullMatch[1]);
        const month = Number(fullMatch[2]) - 1;
        const day = Number(fullMatch[3]);
        const hour = Number(fullMatch[4]);
        const minute = Number(fullMatch[5]);
        return new Date(year, month, day, hour, minute, 0, 0);
    }

    // 短格式：20:52，默认今天；若已过去则滚到明天
    const shortMatch = value.match(/^(\d{1,2}):(\d{2})$/);
    if (shortMatch) {
        const hour = Number(shortMatch[1]);
        const minute = Number(shortMatch[2]);
        const candidate = new Date(
            now.getFullYear(),
            now.getMonth(),
            now.getDate(),
            hour,
            minute,
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

function getWindowMs(span) {
    const article = span.closest('article');
    if (!article) {
        return null;
    }
    const titles = Array.from(article.querySelectorAll('p')).map((node) =>
        (node.textContent || '').trim(),
    );
    for (const title of titles) {
        if (title.includes('5') && title.includes('小时')) {
            return WINDOW_FIVE_HOURS_MS;
        }
        if (title.includes('每周')) {
            return WINDOW_WEEK_MS;
        }
    }
    return null;
}

function formatRemainingPercent(remainingMs, windowMs) {
    if (!windowMs || windowMs <= 0) {
        return '';
    }
    const ratio = Math.max(0, Math.min(1, remainingMs / windowMs));
    const percent = Math.round(ratio * 100);
    return `（${percent}%）`;
}

function updateRemainingForSpan(span) {
    const now = new Date();
    const resetDate = parseResetDate(span.textContent || '', now);
    if (!resetDate) {
        return;
    }
    const remainingMs = resetDate.getTime() - now.getTime();
    const remainingText = formatDuration(remainingMs);

    let remainingNode = span.querySelector(`span[${REMAINING_ATTR}="true"]`);
    if (!remainingNode) {
        remainingNode = document.createElement('span');
        remainingNode.setAttribute(REMAINING_ATTR, 'true');
        remainingNode.style.marginLeft = '8px';
        remainingNode.style.fontWeight = '500';
        remainingNode.style.color = 'inherit';
        span.appendChild(remainingNode);
    }
    const windowMs = getWindowMs(span);
    const percentText = formatRemainingPercent(remainingMs, windowMs);
    remainingNode.textContent = `剩余：${remainingText}${percentText}`;
}

function updateAllRemaining() {
    const spans = document.querySelectorAll('span');
    for (const span of spans) {
        const text = span.textContent || '';
        if (!text.includes(RESET_PREFIX)) {
            continue;
        }
        updateRemainingForSpan(span);
    }
}

function observeAndUpdate() {
    updateAllRemaining();
    const observer = new MutationObserver(() => {
        updateAllRemaining();
    });
    observer.observe(document.body, {
        childList: true,
        subtree: true,
        characterData: true,
    });
    setInterval(updateAllRemaining, UPDATE_INTERVAL_MS);
}

function main() {
    observeAndUpdate();
}

try {
    main();
} catch (error) {
    console.error(`[${SCRIPT_NAME}]`, error);
}
