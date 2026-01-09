// ==UserScript==
// @name         GitHubDeepWiki
// @name:zh-CN   GitHub 仓库 DeepWiki 快捷入口
// @namespace    https://github.com/dcjanus/userscripts
// @description  在 GitHub 仓库标题旁增加 DeepWiki 按钮，并在 DeepWiki 页面展示上次索引时间
// @author       DCjanus
// @include      https://github.com/*/*
// @include      https://deepwiki.com/*
// @icon         https://github.com/favicon.ico
// @version      20260109
// @license      MIT
// ==/UserScript==
'use strict';

const BUTTON_ID = 'x-deepwiki-link-button';
const BUTTON_CLASS = 'x-deepwiki-link';
const STYLE_ID = 'x-deepwiki-link-style';
const LOG_PREFIX = '[GitHubDeepWiki]';
const SVG_ICON = `<svg class="h-7 w-7 [&amp;_path]:stroke-0 [&amp;_path]:animate-[custom-pulse_1.8s_infinite_var(--delay,0s)]" xmlns="http://www.w3.org/2000/svg" viewBox="110 110 460 500"><path style="fill: rgb(33, 193, 154);" class="[--delay:0.6s]" d="M418.73,332.37c9.84-5.68,22.07-5.68,31.91,0l25.49,14.71c.82.48,1.69.8,2.58,1.06.19.06.37.11.55.16.87.21,1.76.34,2.65.35.04,0,.08.02.13.02.1,0,.19-.03.29-.04.83-.02,1.64-.13,2.45-.32.14-.03.28-.05.42-.09.87-.24,1.7-.59,2.5-1.03.08-.04.17-.06.25-.1l50.97-29.43c3.65-2.11,5.9-6.01,5.9-10.22v-58.86c0-4.22-2.25-8.11-5.9-10.22l-50.97-29.43c-3.65-2.11-8.15-2.11-11.81,0l-50.97,29.43c-.08.04-.13.11-.2.16-.78.48-1.51,1.02-2.15,1.66-.1.1-.18.21-.28.31-.57.6-1.08,1.26-1.51,1.97-.07.12-.15.22-.22.34-.44.77-.77,1.6-1.03,2.47-.05.19-.1.37-.14.56-.22.89-.37,1.81-.37,2.76v29.43c0,11.36-6.11,21.95-15.95,27.63-9.84,5.68-22.06,5.68-31.91,0l-25.49-14.71c-.82-.48-1.69-.8-2.57-1.06-.19-.06-.37-.11-.56-.16-.88-.21-1.76-.34-2.65-.34-.13,0-.26.02-.4.02-.84.02-1.66.13-2.47.32-.13.03-.27.05-.4.09-.87.24-1.71.6-2.51,1.04-.08.04-.16.06-.24.1l-50.97,29.43c-3.65,2.11-5.9,6.01-5.9,10.22v58.86c0,4.22,2.25,8.11,5.9,10.22l50.97,29.43c.08.04.17.06.24.1.8.44,1.64.79,2.5,1.03.14.04.28.06.42.09.81.19,1.62.3,2.45.32.1,0,.19.04.29.04.04,0,.08-.02.13-.02.89,0,1.77-.13,2.65-.35.19-.04.37-.1.56-.16.88-.26,1.75-.59,2.58-1.06l25.49-14.71c9.84-5.68,22.06-5.68,31.91,0,9.84,5.68,15.95,16.27,15.95,27.63v29.43c0,.95.15,1.87.37,2.76.05.19.09.37.14.56.25.86.59,1.69,1.03,2.47.07.12.15.22.22.34.43.71.94,1.37,1.51,1.97.1.1.18.21.28.31.65.63,1.37,1.18,2.15,1.66.07.04.13.11.2.16l50.97,29.43c1.83,1.05,3.86,1.58,5.9,1.58s4.08-.53,5.9-1.58l50.97-29.43c3.65-2.11,5.9-6.01,5.9-10.22v-58.86c0-4.22-2.25-8.11-5.9-10.22l-50.97-29.43c-.08-.04-.16-.06-.24-.1-.8-.44-1.64-.8-2.51-1.04-.13-.04-.26-.05-.39-.09-.82-.2-1.65-.31-2.49-.33-.13,0-.25-.02-.38-.02-.89,0-1.78.13-2.66.35-.18.04-.36.1-.54.15-.88.26-1.75.59-2.58,1.07l-25.49,14.72c-9.84,5.68-22.07,5.68-31.9,0-9.84-5.68-15.95-16.27-15.95-27.63s6.11-21.95,15.95-27.63Z"></path><path style="fill: rgb(57, 105, 202);" d="M141.09,317.65l50.97,29.43c1.83,1.05,3.86,1.58,5.9,1.58s4.08-.53,5.9-1.58l50.97-29.43c.08-.04.13-.11.2-.16.78-.48,1.51-1.02,2.15-1.66.1-.1.18-.21.28-.31.57-.6,1.08-1.26,1.51-1.97.07-.12.15-.22.22-.34.44-.77.77-1.6,1.03-2.47.05-.19.1-.37.14-.56.22-.89.37-1.81.37-2.76v-29.43c0-11.36,6.11-21.95,15.96-27.63s22.06-5.68,31.91,0l25.49,14.71c.82.48,1.69.8,2.57,1.06.19.06.37.11.56.16.87.21,1.76.34,2.64.35.04,0,.09.02.13.02.1,0,.19-.04.29-.04.83-.02,1.65-.13,2.45-.32.14-.03.28-.05.41-.09.87-.24,1.71-.6,2.51-1.04.08-.04.16-.06.24-.1l50.97-29.43c3.65-2.11,5.9-6.01,5.9-10.22v-58.86c0-4.22-2.25-8.11-5.9-10.22l-50.97-29.43c-3.65-2.11-8.15-2.11-11.81,0l-50.97,29.43c-.08.04-.13.11-.2.16-.78.48-1.51,1.02-2.15,1.66-.1.1-.18.21-.28.31-.57.6-1.08,1.26-1.51,1.97-.07.12-.15.22-.22.34-.44.77-.77,1.6-1.03,2.47-.05.19-.1.37-.14.56-.22.89-.37,1.81-.37,2.76v29.43c0,11.36-6.11,21.95-15.95,27.63-9.84,5.68-22.07,5.68-31.91,0l-25.49-14.71c-.82-.48-1.69-.8-2.58-1.06-.19-.06-.37-.11-.55-.16-.88-.21-1.76-.34-2.65-.35-.13,0-.26.02-.4.02-.83.02-1.66.13-2.47.32-.13.03-.27.05-.4.09-.87.24-1.71.6-2.51,1.04-.08.04-.16.06-.24.1l-50.97,29.43c-3.65,2.11-5.9,6.01-5.9,10.22v58.86c0,4.22,2.25,8.11,5.9,10.22Z"></path><path style="fill: rgb(2, 148, 222);" class="[--delay:1.2s]" d="M396.88,484.35l-50.97-29.43c-.08-.04-.17-.06-.24-.1-.8-.44-1.64-.79-2.51-1.03-.14-.04-.27-.06-.41-.09-.81-.19-1.64-.3-2.47-.32-.13,0-.26-.02-.39-.02-.89,0-1.78.13-2.66.35-.18.04-.36.1-.54.15-.88.26-1.76.59-2.58,1.07l-25.49,14.72c-9.84,5.68-22.06,5.68-31.9,0-9.84-5.68-15.96-16.27-15.96-27.63v-29.43c0-.95-.15-1.87-.37-2.76-.05-.19-.09-.37-.14-.56-.25-.86-.59-1.69-1.03-2.47-.07-.12-.15-.22-.22-.34-.43-.71-.94-1.37-1.51-1.97-.1-.1-.18-.21-.28-.31-.65-.63-1.37-1.18-2.15-1.66-.07-.04-.13-.11-.2-.16l-50.97-29.43c-3.65-2.11-8.15-2.11-11.81,0l-50.97,29.43c-3.65,2.11-5.9,6.01-5.9,10.22v58.86c0,4.22,2.25,8.11,5.9,10.22l50.97,29.43c.08.04.17.06.25.1.8.44,1.63.79,2.5,1.03.14.04.29.06.43.09.8.19,1.61.3,2.43.32.1,0,.2.04.3.04.04,0,.09-.02.13-.02.88,0,1.77-.13,2.64-.34.19-.04.37-.1.56-.16.88-.26,1.75-.59,2.57-1.06l25.49-14.71c9.84-5.68,22.06-5.68,31.91,0,9.84,5.68,15.95,16.27,15.95,27.63v29.43c0,.95.15,1.87.37,2.76.05.19.09.37.14.56.25.86.59,1.69,1.03,2.47.07.12.15.22.22.34.43.71.94,1.37,1.51,1.97.1.1.18.21.28.31.65.63,1.37,1.18,2.15,1.66.07.04.13.11.2.16l50.97,29.43c1.83,1.05,3.86,1.58,5.9,1.58s4.08-.53,5.9-1.58l50.97-29.43c3.65-2.11,5.9-6.01,5.9-10.22v-58.86c0-4.22-2.25-8.11-5.9-10.22Z"></path></svg>`;
const ICON_DATA_URL = `data:image/svg+xml;utf8,${encodeURIComponent(SVG_ICON)}`;

function ensureStyle() {
    if (document.getElementById(STYLE_ID)) {
        return;
    }

    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `
        .${BUTTON_CLASS} {
            align-items: center;
            display: inline-flex;
            gap: 4px;
            margin-left: 4px;
            padding: 0 6px;
            text-decoration: none;
            vertical-align: middle;
        }

        .${BUTTON_CLASS}:hover {
            text-decoration: none;
        }

        .${BUTTON_CLASS} img {
            height: 12px;
            width: 12px;
        }
    `;

    document.head.appendChild(style);
}

function getRepoInfo() {
    const container = document.querySelector('#repo-title-component');
    if (!container) {
        return null;
    }

    const visibilityLabel = container.querySelector('.Label');
    if (!visibilityLabel || !visibilityLabel.textContent) {
        return null;
    }

    const visibilityText = visibilityLabel.textContent.trim().toLowerCase();
    const isPublicRepo =
        visibilityText === 'public' || visibilityText === 'public archive';
    if (!isPublicRepo) {
        return null;
    }

    const repoLink =
        container.querySelector('strong[itemprop="name"] a[href]') ||
        container.querySelector('a[href]');
    if (!repoLink) {
        return null;
    }

    const href = repoLink.getAttribute('href');
    if (!href) {
        return null;
    }

    const url = new URL(href, window.location.origin);
    const parts = url.pathname.split('/').filter(Boolean);
    if (parts.length < 2) {
        return null;
    }

    return {
        container,
        visibilityLabel,
        owner: parts[0],
        repo: parts[1],
    };
}

function insertDeepWikiButton() {
    const info = getRepoInfo();
    if (!info) {
        const existing = document.getElementById(BUTTON_ID);
        if (existing) {
            existing.remove();
        }
        return false;
    }

    const deepWikiUrl = `https://deepwiki.com/${info.owner}/${info.repo}`;
    const existing = document.getElementById(BUTTON_ID);
    if (existing) {
        if (existing.getAttribute('href') !== deepWikiUrl) {
            existing.setAttribute('href', deepWikiUrl);
        }
        return true;
    }

    ensureStyle();

    const link = document.createElement('a');
    link.id = BUTTON_ID;
    link.className = `Label Label--secondary v-align-middle ${BUTTON_CLASS}`;
    link.href = deepWikiUrl;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    link.setAttribute('aria-label', 'Open DeepWiki');

    const icon = document.createElement('img');
    icon.src = ICON_DATA_URL;
    icon.alt = '';
    icon.setAttribute('aria-hidden', 'true');

    const text = document.createElement('span');
    text.textContent = 'DeepWiki';

    link.appendChild(icon);
    link.appendChild(text);

    info.visibilityLabel.insertAdjacentElement('afterend', link);

    return true;
}

function parseDeepWikiMetadata() {
    const scripts = Array.from(document.scripts);
    const generatedRegex = /"generated_at":"([^"]+)"/;
    let generatedAt = null;

    for (const script of scripts) {
        const text = script.textContent;
        if (!text) {
            continue;
        }

        if (!generatedAt) {
            const match = text.match(generatedRegex);
            if (match) {
                generatedAt = match[1];
            }
        }

        if (generatedAt) {
            break;
        }
    }

    if (!generatedAt) {
        const ldJson = document.querySelector(
            'script[type="application/ld+json"]',
        );
        if (ldJson && ldJson.textContent) {
            try {
                const data = JSON.parse(ldJson.textContent);
                if (data && data.dateModified) {
                    generatedAt = data.dateModified;
                }
            } catch (error) {
                console.warn(
                    '[GitHubDeepWiki] 解析 DeepWiki 元信息失败',
                    error,
                );
            }
        }
    }

    return {
        generatedAt,
    };
}

function formatRelativeTime(targetDate) {
    const diffMs = Date.now() - targetDate.getTime();
    const diffSeconds = Math.max(0, Math.floor(diffMs / 1000));
    const diffMinutes = Math.floor(diffSeconds / 60);
    const diffHours = Math.floor(diffMinutes / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffDays >= 1) {
        return `${diffDays} ${diffDays === 1 ? 'day' : 'days'} ago`;
    }
    if (diffHours >= 1) {
        return `${diffHours} ${diffHours === 1 ? 'hour' : 'hours'} ago`;
    }
    if (diffMinutes >= 1) {
        return `${diffMinutes} ${diffMinutes === 1 ? 'minute' : 'minutes'} ago`;
    }
    return `${diffSeconds} ${diffSeconds === 1 ? 'second' : 'seconds'} ago`;
}

function normalizeGeneratedAt(value) {
    if (!value) {
        return value;
    }
    const trimmed = value.trim();
    if (!trimmed) {
        return trimmed;
    }
    // DeepWiki 的 generated_at 常不带时区信息，按 UTC 解析以避免本地时区偏差。
    const hasTimezone = /Z$|[+-]\d{2}:\d{2}$|[+-]\d{2}\d{2}$/.test(trimmed);
    if (hasTimezone) {
        return trimmed;
    }
    return `${trimmed}Z`;
}

function getDeepWikiRepoInfo() {
    const parts = window.location.pathname.split('/').filter(Boolean);
    if (parts.length < 2) {
        return null;
    }

    return {
        owner: parts[0],
        repo: parts[1],
    };
}

function findDeepWikiTitleElement(repoInfo) {
    const link = document.querySelector('a[title="Open repository"]');
    console.log(LOG_PREFIX, 'repo link found:', Boolean(link), repoInfo);
    return link;
}

function getRepoLinkTextNode(link) {
    for (const node of link.childNodes) {
        if (node.nodeType === Node.TEXT_NODE) {
            return node;
        }
    }
    return null;
}

function setRepoLinkSuffix(link, repoInfo, suffixText) {
    const dataKey = 'deepwikiBaseText';
    let baseText = link.dataset[dataKey];
    let textNode = getRepoLinkTextNode(link);

    if (!baseText) {
        if (textNode) {
            baseText = textNode.nodeValue.trim();
        }
        if (!baseText) {
            baseText = repoInfo ? `${repoInfo.owner}/${repoInfo.repo}` : '';
        }
        link.dataset[dataKey] = baseText;
        console.log(LOG_PREFIX, 'base text set:', baseText);
    }

    const fullText = suffixText ? `${baseText} ${suffixText}` : baseText;
    console.log(LOG_PREFIX, 'update title text:', fullText);
    if (textNode) {
        textNode.nodeValue = fullText;
        return;
    }

    textNode = document.createTextNode(fullText);
    link.insertBefore(textNode, link.firstChild);
}

async function updateDeepWikiInfo() {
    const repoInfo = getDeepWikiRepoInfo();
    if (!repoInfo) {
        console.log(LOG_PREFIX, 'repo info missing');
        return;
    }

    const title = findDeepWikiTitleElement(repoInfo);
    if (!title) {
        console.log(LOG_PREFIX, 'repo title link not found');
        return;
    }

    const metadata = parseDeepWikiMetadata();
    console.log(LOG_PREFIX, 'metadata:', metadata);
    if (!metadata.generatedAt) {
        setRepoLinkSuffix(title, repoInfo, '(time unavailable)');
        return;
    }

    let baseGeneratedText = '';
    if (metadata.generatedAt) {
        const normalizedGeneratedAt = normalizeGeneratedAt(
            metadata.generatedAt,
        );
        const generatedDate = new Date(normalizedGeneratedAt);
        if (!Number.isNaN(generatedDate.getTime())) {
            baseGeneratedText = `indexed at ${formatRelativeTime(generatedDate)}`;
        }
    }

    setRepoLinkSuffix(
        title,
        repoInfo,
        baseGeneratedText ? `(${baseGeneratedText})` : '(time unavailable)',
    );
}

function setupObserver() {
    let pending = false;

    const scheduleInsert = () => {
        if (pending) {
            return;
        }
        pending = true;
        window.requestAnimationFrame(() => {
            pending = false;
            insertDeepWikiButton();
        });
    };

    scheduleInsert();

    const observer = new MutationObserver(() => {
        scheduleInsert();
    });

    observer.observe(document.body, {
        childList: true,
        subtree: true,
    });

    document.addEventListener('pjax:end', scheduleInsert);
    document.addEventListener('turbo:load', scheduleInsert);
}

function setupDeepWikiObserver() {
    let pending = false;
    let lastUrl = window.location.href;

    const scheduleUpdate = () => {
        if (pending) {
            return;
        }
        pending = true;
        window.requestAnimationFrame(() => {
            pending = false;
            updateDeepWikiInfo();
        });
    };

    const observer = new MutationObserver(() => {
        if (window.location.href !== lastUrl) {
            lastUrl = window.location.href;
        }
        scheduleUpdate();
    });

    observer.observe(document.body, {
        childList: true,
        subtree: true,
    });

    window.addEventListener('popstate', scheduleUpdate);
    scheduleUpdate();
}

try {
    if (window.location.hostname === 'github.com') {
        setupObserver();
    } else if (window.location.hostname === 'deepwiki.com') {
        setupDeepWikiObserver();
    }
} catch (error) {
    console.error('[GitHubDeepWiki]', error);
}
