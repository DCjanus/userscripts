// ==UserScript==
// @name         GitHubGpgKeyExpiry
// @name:zh-CN   GitHub GPG 签名密钥有效期
// @namespace    https://github.com/DCjanus/userscripts
// @description  在 GitHub 首页和 SSH/GPG keys 设置页显示当前用户签名 key 的剩余有效期
// @author       DCjanus
// @match        https://github.com/
// @match        https://github.com/settings/keys
// @icon         https://github.com/favicon.ico
// @version      20260710
// @license      MIT
// @grant        none
// ==/UserScript==

const SCRIPT_NAME = "GitHubGpgKeyExpiry";
const EXPECTED_LOGIN = "DCjanus";
const API_URL = `https://api.github.com/users/${EXPECTED_LOGIN}/gpg_keys`;
const CACHE_KEY = `${SCRIPT_NAME}.cache.v1`;
const CACHE_MAX_AGE_MS = 24 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;
const HOME_CARD_ID = "github-gpg-key-expiry-card";
const SETTINGS_SUMMARY_CLASS = "github-gpg-key-expiry-summary";

function getCurrentLogin() {
	return document
		.querySelector('meta[name="user-login"]')
		?.getAttribute("content");
}

function isExpectedUser() {
	return getCurrentLogin()?.toLowerCase() === EXPECTED_LOGIN.toLowerCase();
}

function readCache() {
	try {
		const raw = window.localStorage.getItem(CACHE_KEY);
		if (!raw) {
			return null;
		}
		const cache = JSON.parse(raw);
		if (!Array.isArray(cache?.keys) || !Number.isFinite(cache?.fetchedAt)) {
			return null;
		}
		return cache;
	} catch {
		return null;
	}
}

function writeCache(keys) {
	try {
		window.localStorage.setItem(
			CACHE_KEY,
			JSON.stringify({
				fetchedAt: Date.now(),
				keys,
			}),
		);
	} catch {
		// localStorage 不可用时仍可展示本次请求结果。
	}
}

async function loadGpgKeys() {
	const cache = readCache();
	if (cache && Date.now() - cache.fetchedAt < CACHE_MAX_AGE_MS) {
		return { keys: cache.keys, stale: false };
	}

	try {
		const response = await fetch(API_URL, {
			headers: {
				Accept: "application/vnd.github+json",
			},
		});
		if (!response.ok) {
			throw new Error(`GitHub API returned ${response.status}`);
		}

		const keys = await response.json();
		if (!Array.isArray(keys)) {
			throw new TypeError("GitHub API returned an invalid GPG key list");
		}
		writeCache(keys);
		return { keys, stale: false };
	} catch (error) {
		if (cache) {
			return { keys: cache.keys, stale: true };
		}
		throw error;
	}
}

function collectSigningKeys(keys) {
	const signingKeys = [];
	for (const parent of keys) {
		const candidates = [parent, ...(parent.subkeys || [])];
		for (const key of candidates) {
			if (!key.can_sign || key.revoked) {
				continue;
			}
			signingKeys.push({
				id: key.id,
				keyId: key.key_id,
				parentId: parent.id,
				expiresAt: key.expires_at,
				isSubkey: key.id !== parent.id,
			});
		}
	}
	return signingKeys;
}

function getExpiryState(signingKey, now = Date.now()) {
	if (!signingKey.expiresAt) {
		return {
			date: null,
			label: "永不过期",
			tone: "success",
		};
	}

	const date = new Date(signingKey.expiresAt);
	if (Number.isNaN(date.getTime())) {
		return {
			date: null,
			label: "有效期未知",
			tone: "attention",
		};
	}

	const remainingMs = date.getTime() - now;
	if (remainingMs <= 0) {
		const days = Math.max(1, Math.ceil(Math.abs(remainingMs) / DAY_MS));
		return {
			date,
			label: `已过期 ${days} 天`,
			tone: "danger",
		};
	}

	const days = Math.ceil(remainingMs / DAY_MS);
	return {
		date,
		label: `剩余 ${days} 天`,
		tone: days <= 30 ? "danger" : days <= 90 ? "attention" : "success",
	};
}

function findNearestExpiry(signingKeys) {
	return [...signingKeys].sort((left, right) => {
		const leftTime = left.expiresAt
			? new Date(left.expiresAt).getTime()
			: Number.POSITIVE_INFINITY;
		const rightTime = right.expiresAt
			? new Date(right.expiresAt).getTime()
			: Number.POSITIVE_INFINITY;
		return leftTime - rightTime;
	})[0];
}

function formatExpiryDate(date) {
	return date.toLocaleString("zh-CN", {
		year: "numeric",
		month: "2-digit",
		day: "2-digit",
		hour: "2-digit",
		minute: "2-digit",
	});
}

function getToneClasses(tone) {
	switch (tone) {
		case "danger":
			return {
				label: "Label--danger",
				text: "color-fg-danger",
			};
		case "attention":
			return {
				label: "Label--attention",
				text: "color-fg-attention",
			};
		default:
			return {
				label: "Label--success",
				text: "color-fg-success",
			};
	}
}

function renderHome(signingKeys, stale) {
	if (document.getElementById(HOME_CARD_ID)) {
		return;
	}

	const dashboard = document.getElementById("dashboard");
	const news =
		dashboard?.querySelector("feed-container")?.closest(".news") ||
		dashboard?.querySelector(":scope > .news");
	if (!dashboard || !news) {
		return;
	}

	const nearest = findNearestExpiry(signingKeys);
	const card = document.createElement("a");
	card.id = HOME_CARD_ID;
	card.href = "/settings/keys";
	card.className =
		"Box color-shadow-small tmp-mb-3 color-fg-default no-underline d-block";

	const row = document.createElement("div");
	row.className = "Box-row d-flex flex-items-center flex-justify-between gap-3";

	const details = document.createElement("div");
	details.className = "min-width-0";

	const title = document.createElement("strong");
	title.className = "d-block";
	title.textContent = "GPG 签名密钥";
	details.appendChild(title);

	const description = document.createElement("span");
	description.className = "color-fg-muted f6 d-block text-truncate";
	if (!nearest) {
		description.textContent = "没有可用的签名 key";
	} else {
		const expiry = getExpiryState(nearest);
		const expiryText = expiry.date
			? ` · 到期于 ${formatExpiryDate(expiry.date)}`
			: "";
		description.textContent = `${nearest.keyId}${expiryText}${
			stale ? " · 缓存数据" : ""
		}`;
	}
	details.appendChild(description);
	row.appendChild(details);

	const badge = document.createElement("span");
	badge.className = "Label flex-shrink-0";
	if (!nearest) {
		badge.classList.add("Label--danger");
		badge.textContent = "不可用";
	} else {
		const expiry = getExpiryState(nearest);
		badge.classList.add(getToneClasses(expiry.tone).label);
		badge.textContent = expiry.label;
	}
	row.appendChild(badge);
	card.appendChild(row);

	dashboard.insertBefore(card, news);
}

function createSettingsSummary(signingKey, stale) {
	const expiry = getExpiryState(signingKey);
	const summary = document.createElement("span");
	summary.className = `${SETTINGS_SUMMARY_CLASS} color-fg-muted d-block`;

	const keyLabel = document.createTextNode(
		`${signingKey.isSubkey ? "签名子 key" : "签名 key"} `,
	);
	const keyId = document.createElement("code");
	keyId.textContent = signingKey.keyId;
	const separator = document.createTextNode("：");
	const status = document.createElement("strong");
	status.className = getToneClasses(expiry.tone).text;
	status.textContent = expiry.label;

	summary.append(keyLabel, keyId, separator, status);
	if (expiry.date) {
		summary.append(`，到期于 ${formatExpiryDate(expiry.date)}`);
	}
	if (stale) {
		summary.append("（缓存数据）");
	}
	return summary;
}

function renderSettings(keys, stale) {
	const signingKeys = collectSigningKeys(keys);
	for (const row of document.querySelectorAll('li[id^="gpg-key-"]')) {
		if (row.querySelector(`.${SETTINGS_SUMMARY_CLASS}`)) {
			continue;
		}

		const parentId = Number(row.id.slice("gpg-key-".length));
		const content = row.querySelector(".user-key-details");
		if (!content || !Number.isFinite(parentId)) {
			continue;
		}

		const rowSigningKeys = signingKeys.filter(
			(key) => key.parentId === parentId,
		);
		for (const signingKey of rowSigningKeys) {
			content.appendChild(createSettingsSummary(signingKey, stale));
		}
	}
}

function renderError() {
	if (
		window.location.pathname !== "/" ||
		document.getElementById(HOME_CARD_ID)
	) {
		return;
	}

	const dashboard = document.getElementById("dashboard");
	const news =
		dashboard?.querySelector("feed-container")?.closest(".news") ||
		dashboard?.querySelector(":scope > .news");
	if (!dashboard || !news) {
		return;
	}

	const card = document.createElement("a");
	card.id = HOME_CARD_ID;
	card.href = "/settings/keys";
	card.className =
		"Box color-shadow-small tmp-mb-3 color-fg-danger no-underline d-block";
	const row = document.createElement("div");
	row.className = "Box-row";
	row.textContent = "GPG 签名密钥有效期读取失败";
	card.appendChild(row);
	dashboard.insertBefore(card, news);
}

async function main() {
	if (!isExpectedUser()) {
		return;
	}

	try {
		const { keys, stale } = await loadGpgKeys();
		const signingKeys = collectSigningKeys(keys);
		if (window.location.pathname === "/") {
			renderHome(signingKeys, stale);
		} else if (window.location.pathname === "/settings/keys") {
			renderSettings(keys, stale);
		}
	} catch (error) {
		console.error(`[${SCRIPT_NAME}]`, error);
		renderError();
	}
}

main();
