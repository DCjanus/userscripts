// ==UserScript==
// @name         GitHubDeepWiki
// @name:zh-CN   GitHub 仓库 DeepWiki 快捷入口
// @namespace    https://github.com/dcjanus/userscripts
// @description  在 GitHub 仓库标题旁增加 DeepWiki 按钮，并在 DeepWiki 页面展示上次索引时间
// @author       DCjanus
// @match        https://github.com/*/*
// @match        https://deepwiki.com/*
// @icon         https://raw.githubusercontent.com/DCjanus/userscripts/master/assets/deepwiki.svg
// @version      20260710
// @license      MIT
// ==/UserScript==

const BUTTON_ID = "x-deepwiki-link-button";
const BUTTON_CLASS = "x-deepwiki-link";
const STYLE_ID = "x-deepwiki-link-style";
const ICON_DATA_URL =
	"https://raw.githubusercontent.com/DCjanus/userscripts/master/assets/deepwiki.svg";
let metadataCache = {
	url: "",
	generatedAt: null,
};

function ensureStyle() {
	if (document.getElementById(STYLE_ID)) {
		return;
	}

	const style = document.createElement("style");
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
	const container = document.querySelector("#repo-title-component");
	if (!container) {
		return null;
	}

	const visibilityLabel = container.querySelector(".Label");
	if (!visibilityLabel?.textContent) {
		return null;
	}

	const visibilityText = visibilityLabel.textContent.trim().toLowerCase();
	const isPublicRepo =
		visibilityText === "public" || visibilityText === "public archive";
	if (!isPublicRepo) {
		return null;
	}

	const repoLink =
		container.querySelector('strong[itemprop="name"] a[href]') ||
		container.querySelector("a[href]");
	if (!repoLink) {
		return null;
	}

	const href = repoLink.getAttribute("href");
	if (!href) {
		return null;
	}

	const url = new URL(href, window.location.origin);
	const parts = url.pathname.split("/").filter(Boolean);
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
		if (existing.getAttribute("href") !== deepWikiUrl) {
			existing.setAttribute("href", deepWikiUrl);
		}
		return true;
	}

	ensureStyle();

	const link = document.createElement("a");
	link.id = BUTTON_ID;
	link.className = `Label Label--secondary v-align-middle ${BUTTON_CLASS}`;
	link.href = deepWikiUrl;
	link.target = "_blank";
	link.rel = "noopener noreferrer";
	link.setAttribute("aria-label", "Open DeepWiki");

	const icon = document.createElement("img");
	icon.src = ICON_DATA_URL;
	icon.alt = "";
	icon.setAttribute("aria-hidden", "true");

	const text = document.createElement("span");
	text.textContent = "DeepWiki";

	link.appendChild(icon);
	link.appendChild(text);

	info.visibilityLabel.insertAdjacentElement("afterend", link);

	return true;
}

function parseDeepWikiMetadata() {
	let generatedAt = null;

	const ldJson = document.querySelector('script[type="application/ld+json"]');
	if (ldJson?.textContent) {
		try {
			const data = JSON.parse(ldJson.textContent);
			if (data?.dateModified) {
				generatedAt = data.dateModified;
			}
		} catch (error) {
			console.warn("[GitHubDeepWiki] 解析 DeepWiki 元信息失败", error);
		}
	}

	if (!generatedAt) {
		const generatedRegex = /"generated_at":"([^"]+)"/;
		for (const script of document.scripts) {
			const match = script.textContent?.match(generatedRegex);
			if (match) {
				generatedAt = match[1];
				break;
			}
		}
	}

	return {
		generatedAt,
	};
}

function getDeepWikiMetadata() {
	const url = window.location.href;
	if (metadataCache.url === url && metadataCache.generatedAt) {
		return {
			generatedAt: metadataCache.generatedAt,
		};
	}

	const metadata = parseDeepWikiMetadata();
	metadataCache = {
		url,
		generatedAt: metadata.generatedAt,
	};
	return metadata;
}

function formatRelativeTime(targetDate) {
	const diffMs = Date.now() - targetDate.getTime();
	const diffSeconds = Math.max(0, Math.floor(diffMs / 1000));
	const diffMinutes = Math.floor(diffSeconds / 60);
	const diffHours = Math.floor(diffMinutes / 60);
	const diffDays = Math.floor(diffHours / 24);

	if (diffDays >= 1) {
		return `${diffDays} ${diffDays === 1 ? "day" : "days"} ago`;
	}
	if (diffHours >= 1) {
		return `${diffHours} ${diffHours === 1 ? "hour" : "hours"} ago`;
	}
	if (diffMinutes >= 1) {
		return `${diffMinutes} ${diffMinutes === 1 ? "minute" : "minutes"} ago`;
	}
	return `${diffSeconds} ${diffSeconds === 1 ? "second" : "seconds"} ago`;
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
	const parts = window.location.pathname.split("/").filter(Boolean);
	if (parts.length < 2) {
		return null;
	}

	return {
		owner: parts[0],
		repo: parts[1],
	};
}

function findDeepWikiTitleElement() {
	return document.querySelector('a[title="Open repository"]');
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
	const dataKey = "deepwikiBaseText";
	let baseText = repoInfo ? `${repoInfo.owner}/${repoInfo.repo}` : "";
	let textNode = getRepoLinkTextNode(link);

	if (!baseText) {
		baseText = link.dataset[dataKey];
		if (textNode) {
			baseText ||= textNode.nodeValue.trim();
		}
	}
	link.dataset[dataKey] = baseText;

	const fullText = suffixText ? `${baseText} ${suffixText}` : baseText;
	if (textNode) {
		if (textNode.nodeValue !== fullText) {
			textNode.nodeValue = fullText;
		}
		return;
	}

	textNode = document.createTextNode(fullText);
	link.insertBefore(textNode, link.firstChild);
}

function updateDeepWikiInfo() {
	const repoInfo = getDeepWikiRepoInfo();
	if (!repoInfo) {
		return;
	}

	const title = findDeepWikiTitleElement();
	if (!title) {
		return;
	}

	const metadata = getDeepWikiMetadata();
	if (!metadata.generatedAt) {
		setRepoLinkSuffix(title, repoInfo, "(time unavailable)");
		return;
	}

	let baseGeneratedText = "";
	if (metadata.generatedAt) {
		const normalizedGeneratedAt = normalizeGeneratedAt(metadata.generatedAt);
		const generatedDate = new Date(normalizedGeneratedAt);
		if (!Number.isNaN(generatedDate.getTime())) {
			baseGeneratedText = `indexed at ${formatRelativeTime(generatedDate)}`;
		}
	}

	setRepoLinkSuffix(
		title,
		repoInfo,
		baseGeneratedText ? `(${baseGeneratedText})` : "(time unavailable)",
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

	document.addEventListener("pjax:end", scheduleInsert);
	document.addEventListener("turbo:load", scheduleInsert);
}

function setupDeepWikiObserver() {
	let pending = false;

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

	const observer = new MutationObserver(scheduleUpdate);

	observer.observe(document.body, {
		childList: true,
		subtree: true,
	});

	window.addEventListener("popstate", scheduleUpdate);
	scheduleUpdate();
}

try {
	if (window.location.hostname === "github.com") {
		setupObserver();
	} else if (window.location.hostname === "deepwiki.com") {
		setupDeepWikiObserver();
	}
} catch (error) {
	console.error("[GitHubDeepWiki]", error);
}
