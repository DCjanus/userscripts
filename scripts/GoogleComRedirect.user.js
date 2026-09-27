// ==UserScript==
// @name         GoogleComRedirect
// @name:zh-CN   Google 香港搜索转到 .com
// @namespace    https://github.com/DCjanus/userscripts
// @description  通过 /ncr 将 Google 香港搜索转到 .com，保留搜索条件
// @author       DCjanus
// @match        https://www.google.com.hk/*
// @match        https://www.google.com/*
// @run-at       document-start
// @noframes
// @version      20260927
// @license      MIT
// @grant        GM_getTab
// @grant        GM_saveTab
// ==/UserScript==

const STATE_KEY = "googleComRedirect";
const RETRY_WINDOW_MS = 15_000;

GM_getTab((tab) => {
	const current = new URL(window.location.href);
	const pending = tab[STATE_KEY];

	if (current.hostname === "www.google.com.hk") {
		if (current.pathname !== "/" && current.pathname !== "/search") {
			return;
		}

		const target = new URL(current.href);
		target.hostname = "www.google.com";
		if (pending && Date.now() - pending.startedAt < RETRY_WINDOW_MS) {
			return;
		}

		tab[STATE_KEY] = {
			target: target.href,
			startedAt: Date.now(),
			phase: "ncr",
		};
		GM_saveTab(tab, () => {
			window.location.replace("https://www.google.com/ncr");
		});
		return;
	}

	if (!pending) {
		return;
	}

	if (
		Date.now() - pending.startedAt >= RETRY_WINDOW_MS ||
		pending.phase !== "ncr" ||
		(current.pathname !== "/ncr" && current.pathname !== "/")
	) {
		delete tab[STATE_KEY];
		GM_saveTab(tab);
		return;
	}

	pending.phase = "search";
	GM_saveTab(tab, () => {
		window.location.replace(pending.target);
	});
});
