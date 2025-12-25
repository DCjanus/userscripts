// ==UserScript==
// @name         GitHubDateFormatCN
// @name:zh-CN   GitHub 日期中文显示
// @namespace    https://github.com/DCjanus/userscripts
// @description  将 GitHub 页面日期展示为中文格式（例如 2025年4月28日）
// @author       DCjanus
// @match        https://github.com/*
// @icon         https://github.com/favicon.ico
// @version      20251225
// @license      MIT
// ==/UserScript==
'use strict';

const SCRIPT_NAME = 'GitHubDateFormatCN';
const RELATIVE_TIME_SELECTOR = 'relative-time[datetime]';
const TITLE_ATTR = 'data-cn-date-title';
const REPLACED_ATTR = 'data-cn-date-replaced';

// 将 Date 转为中文日期格式：YYYY年M月D日
function formatDate(date) {
    const year = date.getFullYear();
    const month = date.getMonth() + 1;
    const day = date.getDate();
    return `${year}年${month}月${day}日`;
}

// 把 relative-time 元素替换为普通 span，避免 GitHub 组件重写文本
function updateRelativeTime(node) {
    const datetime = node.getAttribute('datetime');
    if (!datetime) {
        return;
    }
    const date = new Date(datetime);
    if (Number.isNaN(date.getTime())) {
        return;
    }
    const formatted = formatDate(date);
    const replacement = document.createElement('span');
    replacement.textContent = formatted;
    replacement.className = node.className;
    replacement.setAttribute(REPLACED_ATTR, 'true');
    replacement.setAttribute('data-datetime', datetime);
    replacement.setAttribute(TITLE_ATTR, formatted);
    replacement.setAttribute('title', formatted);

    const ariaLabel = node.getAttribute('aria-label');
    if (ariaLabel) {
        replacement.setAttribute('aria-label', ariaLabel);
    }

    node.replaceWith(replacement);
}

// 扫描页面内所有 relative-time 节点并替换
function updateAll() {
    const nodes = document.querySelectorAll(RELATIVE_TIME_SELECTOR);
    for (const node of nodes) {
        updateRelativeTime(node);
    }
}

// 监听 DOM 变化与 PJAX/Turbo 事件，确保动态内容也被替换
function setupObserver() {
    let pending = false;
    const schedule = () => {
        if (pending) {
            return;
        }
        pending = true;
        window.requestAnimationFrame(() => {
            pending = false;
            updateAll();
        });
    };

    schedule();

    const observer = new MutationObserver(() => {
        schedule();
    });
    observer.observe(document.body, {
        childList: true,
        subtree: true,
        characterData: true,
        attributes: true,
    });

    document.addEventListener('pjax:end', schedule);
    document.addEventListener('turbo:load', schedule);
}

function main() {
    setupObserver();
}

try {
    main();
} catch (error) {
    console.error(`[${SCRIPT_NAME}]`, error);
}
