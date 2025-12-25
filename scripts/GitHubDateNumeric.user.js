// ==UserScript==
// @name         GitHubDateNumeric
// @name:zh-CN   GitHub 日期数字化
// @namespace    https://github.com/DCjanus/userscripts
// @description  基于 datetime 生成自定义的日期与相对时间展示
// @author       DCjanus
// @match        https://github.com/*
// @icon         https://github.com/favicon.ico
// @version      20251225
// @license      MIT
// ==/UserScript==
'use strict';

const SCRIPT_NAME = 'GitHubDateNumeric';
const RELATIVE_TIME_SELECTOR = 'relative-time[datetime]';
const MINUTE_MS = 60 * 1000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;
const WEEK_MS = 7 * DAY_MS;

function pad2(value) {
    return String(value).padStart(2, '0');
}

function formatUnit(value, singular, plural) {
    return value === 1 ? `1 ${singular}` : `${value} ${plural}`;
}

function formatDate(date, now) {
    const year = date.getFullYear();
    const month = pad2(date.getMonth() + 1);
    const day = pad2(date.getDate());
    const currentYear = now.getFullYear();
    return year === currentYear ? `${month}-${day}` : `${year}-${month}-${day}`;
}

function formatDateTime(date) {
    const year = date.getFullYear();
    const month = pad2(date.getMonth() + 1);
    const day = pad2(date.getDate());
    const hour = pad2(date.getHours());
    const minute = pad2(date.getMinutes());
    const second = pad2(date.getSeconds());
    return `${year}-${month}-${day} ${hour}:${minute}:${second}`;
}

function formatRelative(deltaMs) {
    const abs = Math.abs(deltaMs);
    if (abs < MINUTE_MS) {
        return 'just now';
    }
    if (abs < HOUR_MS) {
        const mins = Math.floor(abs / MINUTE_MS);
        const unit = formatUnit(mins, 'min', 'mins');
        return deltaMs >= 0 ? `${unit} ago` : `in ${unit}`;
    }
    if (abs < DAY_MS) {
        const hours = Math.floor(abs / HOUR_MS);
        const unit = formatUnit(hours, 'hour', 'hours');
        return deltaMs >= 0 ? `${unit} ago` : `in ${unit}`;
    }
    const days = Math.floor(abs / DAY_MS);
    const unit = formatUnit(days, 'day', 'days');
    return deltaMs >= 0 ? `${unit} ago` : `in ${unit}`;
}

function pickDisplay(date, now) {
    const deltaMs = now.getTime() - date.getTime();
    if (Math.abs(deltaMs) < WEEK_MS) {
        return formatRelative(deltaMs);
    }
    return formatDate(date, now);
}

function parseDatetime(node) {
    const datetime = node.getAttribute('datetime');
    if (!datetime) {
        return null;
    }
    const date = new Date(datetime);
    if (Number.isNaN(date.getTime())) {
        return null;
    }
    return { date, datetime };
}

function buildReplacement(node, text, title) {
    const replacement = document.createElement('span');
    replacement.textContent = text;
    replacement.className = node.className;
    replacement.setAttribute(
        'data-datetime',
        node.getAttribute('datetime') || '',
    );
    replacement.setAttribute('title', title);

    const ariaLabel = node.getAttribute('aria-label');
    if (ariaLabel) {
        replacement.setAttribute('aria-label', ariaLabel);
    }

    return replacement;
}

function replaceRelativeTime(node) {
    const parsed = parseDatetime(node);
    if (!parsed) {
        return;
    }
    const now = new Date();
    const display = pickDisplay(parsed.date, now);
    const title = formatDateTime(parsed.date);
    const replacement = buildReplacement(node, display, title);
    node.replaceWith(replacement);
}

function replaceAll() {
    const nodes = document.querySelectorAll(RELATIVE_TIME_SELECTOR);
    for (const node of nodes) {
        replaceRelativeTime(node);
    }
}

function setupObserver() {
    let pending = false;
    const schedule = () => {
        if (pending) {
            return;
        }
        pending = true;
        window.requestAnimationFrame(() => {
            pending = false;
            replaceAll();
        });
    };

    schedule();

    const observer = new MutationObserver(schedule);
    observer.observe(document.body, {
        childList: true,
        subtree: true,
    });

    document.addEventListener('pjax:end', schedule);
    document.addEventListener('turbo:load', schedule);
}

try {
    setupObserver();
} catch (error) {
    console.error(`[${SCRIPT_NAME}]`, error);
}
