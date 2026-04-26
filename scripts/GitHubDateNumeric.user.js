// ==UserScript==
// @name         GitHubDateNumeric
// @name:zh-CN   GitHub 日期数字化
// @namespace    https://github.com/DCjanus/userscripts
// @description  基于 datetime 生成自定义的日期与相对时间展示
// @author       DCjanus
// @match        https://github.com/*
// @icon         https://github.com/favicon.ico
// @version      20260426
// @license      MIT
// ==/UserScript==
'use strict';

const SCRIPT_NAME = 'GitHubDateNumeric';
const RELATIVE_TIME_SELECTOR = 'relative-time[datetime]';
const COMMIT_GROUP_TITLE_SELECTOR = '[data-testid="commit-group-title"]';
const COMMIT_GROUP_PREFIX = 'Commits on ';
const RELATIVE_TIME_PATCHED = Symbol.for('GitHubDateNumeric.relativeTimePatched');
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

function setRelativeTimeText(node, text) {
    const target = node.shadowRoot;
    if (target) {
        const root = target.querySelector('[part="root"]');
        if (root) {
            root.textContent = text;
            return;
        }
        target.textContent = text;
        return;
    }
    node.textContent = text;
}

function getDatePrefix(node, text) {
    const explicitPrefix = node.getAttribute('prefix');
    if (explicitPrefix === '') {
        return '';
    }
    if (explicitPrefix) {
        return `${explicitPrefix.trim()} `;
    }
    return text.trim().startsWith('on ') ? 'on ' : '';
}

function renderRelativeTime(node) {
    const parsed = parseDatetime(node);
    if (!parsed) {
        return;
    }
    const now = new Date();
    let display = pickDisplay(parsed.date, now);
    const prefix = getDatePrefix(node, node.textContent || '');
    if (
        Math.abs(now.getTime() - parsed.date.getTime()) >= WEEK_MS &&
        prefix
    ) {
        display = `${prefix}${display}`;
    }
    node.setAttribute('title', formatDateTime(parsed.date));
    setRelativeTimeText(node, display);
}

function updateRelativeTimeNode(node) {
    if (typeof node.update === 'function') {
        node.update();
        return;
    }
    renderRelativeTime(node);
}

function patchRelativeTimeElement(RelativeTimeElement) {
    const proto = RelativeTimeElement && RelativeTimeElement.prototype;
    if (!proto || proto[RELATIVE_TIME_PATCHED]) {
        return;
    }
    const originalUpdate = proto.update;
    if (typeof originalUpdate !== 'function') {
        return;
    }
    Object.defineProperty(proto, RELATIVE_TIME_PATCHED, {
        value: true,
    });
    proto.update = function update() {
        originalUpdate.call(this);
        renderRelativeTime(this);
    };
}

function setupRelativeTimeHook(schedule) {
    window.customElements
        .whenDefined('relative-time')
        .then(() => {
            patchRelativeTimeElement(
                window.customElements.get('relative-time') ||
                    window.RelativeTimeElement,
            );
            schedule();
        })
        .catch((error) => {
            console.error(`[${SCRIPT_NAME}]`, error);
        });
}

function parseCommitGroupTitle(node) {
    const text = node.textContent;
    if (!text || !text.startsWith(COMMIT_GROUP_PREFIX)) {
        return null;
    }
    const dateText = text.slice(COMMIT_GROUP_PREFIX.length).trim();
    const match = dateText.match(/^([A-Za-z]+)\s+(\d{1,2}),\s+(\d{4})$/);
    if (!match) {
        return null;
    }
    const [, monthName, dayText, yearText] = match;
    const months = {
        Jan: 1,
        January: 1,
        Feb: 2,
        February: 2,
        Mar: 3,
        March: 3,
        Apr: 4,
        April: 4,
        May: 5,
        Jun: 6,
        June: 6,
        Jul: 7,
        July: 7,
        Aug: 8,
        August: 8,
        Sep: 9,
        Sept: 9,
        September: 9,
        Oct: 10,
        October: 10,
        Nov: 11,
        November: 11,
        Dec: 12,
        December: 12,
    };
    const month = months[monthName];
    if (!month) {
        return null;
    }
    const day = Number(dayText);
    const year = Number(yearText);
    if (!Number.isFinite(day) || !Number.isFinite(year)) {
        return null;
    }
    return { year, month, day };
}

function replaceCommitGroupTitle(node) {
    const parsed = parseCommitGroupTitle(node);
    if (!parsed) {
        return;
    }
    const month = pad2(parsed.month);
    const day = pad2(parsed.day);
    node.textContent = `${COMMIT_GROUP_PREFIX}${parsed.year}-${month}-${day}`;
}

function refreshAll() {
    const nodes = document.querySelectorAll(RELATIVE_TIME_SELECTOR);
    for (const node of nodes) {
        updateRelativeTimeNode(node);
    }
    const titles = document.querySelectorAll(COMMIT_GROUP_TITLE_SELECTOR);
    for (const title of titles) {
        replaceCommitGroupTitle(title);
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
            refreshAll();
        });
    };

    setupRelativeTimeHook(schedule);
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
    if (document.body) {
        setupObserver();
    } else {
        document.addEventListener('DOMContentLoaded', setupObserver, {
            once: true,
        });
    }
} catch (error) {
    console.error(`[${SCRIPT_NAME}]`, error);
}
