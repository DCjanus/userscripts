// ==UserScript==
// @name         XTwitterImageWheel
// @name:zh-CN   X/Twitter 图片滚轮翻页
// @namespace    https://github.com/dcjanus/userscripts
// @description  在图片详情页用鼠标滚轮翻页
// @author       DCjanus
// @match        https://x.com/*
// @match        https://twitter.com/*
// @icon         https://abs.twimg.com/favicons/twitter.2.ico
// @version      20260711
// @license      MIT
// @grant        none
// ==/UserScript==

const SCRIPT_NAME = "XTwitterImageWheel";
const WHEEL_END_DELAY_MS = 120;
const CAROUSEL_SELECTOR =
	'div[role="dialog"] [aria-roledescription="carousel"]';
const PREVIOUS_BUTTON_SELECTOR = '[data-testid="Carousel-NavLeft"]';
const NEXT_BUTTON_SELECTOR = '[data-testid="Carousel-NavRight"]';
const CLOSE_BUTTON_SELECTOR = '[data-testid="app-bar-close"]';
const INTERACTIVE_SELECTOR =
	"button, a, input, select, textarea, video, [contenteditable], [role=button]";

let wheelGestureActive = false;
let wheelEndTimer;

function getCarousel(event) {
	if (!(event.target instanceof Element)) {
		return null;
	}

	return event.target.closest(CAROUSEL_SELECTOR);
}

function finishWheelGestureAfterIdle() {
	clearTimeout(wheelEndTimer);
	wheelEndTimer = setTimeout(() => {
		wheelGestureActive = false;
	}, WHEEL_END_DELAY_MS);
}

function getNavigationButton(carousel, deltaY) {
	const dialog = carousel.closest('div[role="dialog"]');
	const selector = deltaY < 0 ? PREVIOUS_BUTTON_SELECTOR : NEXT_BUTTON_SELECTOR;
	const button = dialog?.querySelector(selector);

	return button instanceof HTMLElement ? button : null;
}

function handleClick(event) {
	if (event.button !== 0 || !(event.target instanceof Element)) {
		return;
	}

	const carousel = event.target.closest(CAROUSEL_SELECTOR);
	if (!carousel) {
		return;
	}

	const clickedImage = Boolean(event.target.closest("img"));
	if (!clickedImage && event.target.closest(INTERACTIVE_SELECTOR)) {
		return;
	}

	const dialog = carousel.closest('div[role="dialog"]');
	const closeButton = dialog?.querySelector(CLOSE_BUTTON_SELECTOR);
	if (!(closeButton instanceof HTMLElement)) {
		return;
	}

	event.preventDefault();
	event.stopPropagation();
	closeButton.click();
}

function handleWheel(event) {
	const carousel = getCarousel(event);
	if (
		!carousel ||
		event.deltaY === 0 ||
		event.ctrlKey ||
		event.metaKey ||
		event.altKey ||
		event.shiftKey
	) {
		return;
	}

	event.preventDefault();
	event.stopPropagation();
	finishWheelGestureAfterIdle();

	if (wheelGestureActive) {
		return;
	}
	wheelGestureActive = true;

	getNavigationButton(carousel, event.deltaY)?.click();
}

function setup() {
	document.addEventListener("click", handleClick, { capture: true });
	document.addEventListener("wheel", handleWheel, {
		capture: true,
		passive: false,
	});
}

try {
	setup();
} catch (error) {
	console.error(`[${SCRIPT_NAME}]`, error);
}
