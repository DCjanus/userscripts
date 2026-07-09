// ==UserScript==
// @name         XTwitterImageWheel
// @name:zh-CN   X/Twitter 图片详情页长图查看
// @namespace    https://github.com/dcjanus/userscripts
// @description  在图片详情页竖向滚动查看同一帖所有图片
// @author       DCjanus
// @match        https://x.com/*
// @match        https://twitter.com/*
// @icon         https://abs.twimg.com/favicons/twitter.2.ico
// @version      20260710
// @license      MIT
// @grant        none
// ==/UserScript==

const SCRIPT_NAME = "XTwitterImageWheel";
const REPLACEMENT_ID = "dcjanus-twitter-image-gallery";
const NATIVE_TOGGLE_ID = "dcjanus-twitter-image-gallery-native-toggle";
const STYLE_ID = `${REPLACEMENT_ID}-style`;
const MODE_KEY = "XTwitterImageWheel.mode";
const RouteKind = Object.freeze({
	TweetPage: "tweetPage",
	PhotoRoute: "photoRoute",
	OtherPage: "otherPage",
});
const ViewerMode = Object.freeze({
	Gallery: "gallery",
	Native: "native",
});
const PHOTO_PATH_RE = /^\/([^/]+)\/status\/(\d+)\/photo\/(\d+)$/;
const PHOTO_LINK_PATH_RE = /^\/([^/]+)\/status\/(\d+)\/photo\/(\d+)$/;
const RENDER_DEBOUNCE_MS = 80;
const COLLECT_RETRY_MS = 250;
const MAX_COLLECT_RETRIES = 20;
const LAYOUT_DEBOUNCE_MS = 80;
const MODE_TOGGLE_TOP_OFFSET = 88;
const MODE_TOGGLE_RIGHT_OFFSET = 16;
const MIN_MEDIA_SIZE = 120;
const MIN_PANE_EXPANSION = 8;
const VIEWER_MUTATION_SELECTOR =
	'a[href*="/photo/"], img[src*="/media/"], [data-testid="swipe-to-dismiss"]';

let renderTimer = 0;
let retryTimer = 0;
let layoutTimer = 0;
let retryCount = 0;
let visibleObserver = null;
let lastRenderKey = "";
let lastRouteKey = "";
let activePhotoIndex = 0;
let activePhotoPathname = "";

function getViewerMode() {
	return localStorage.getItem(MODE_KEY) === ViewerMode.Native
		? ViewerMode.Native
		: ViewerMode.Gallery;
}

function setViewerMode(mode) {
	localStorage.setItem(MODE_KEY, mode);
}

function photoRouteFromMatch(match) {
	return {
		screenName: match[1],
		statusId: match[2],
		photoIndex: Number(match[3]),
	};
}

function getRouteState() {
	const photoMatch = location.pathname.match(PHOTO_PATH_RE);
	if (photoMatch) {
		const photo = photoRouteFromMatch(photoMatch);
		return {
			kind: RouteKind.PhotoRoute,
			key: `${photo.statusId}:photo:${photo.photoIndex}`,
			photo,
		};
	}

	const tweetMatch = location.pathname.match(/^\/([^/]+)\/status\/(\d+)\/?$/);
	if (tweetMatch) {
		const tweet = {
			screenName: tweetMatch[1],
			statusId: tweetMatch[2],
		};
		return {
			kind: RouteKind.TweetPage,
			key: `${tweet.statusId}:tweet`,
			tweet,
		};
	}

	return {
		kind: RouteKind.OtherPage,
		key: RouteKind.OtherPage,
	};
}

function linkPhotoRoute(link) {
	try {
		const url = new URL(link.href, location.href);
		const match = url.pathname.match(PHOTO_LINK_PATH_RE);
		if (!match) return null;

		return {
			screenName: match[1],
			statusId: match[2],
			photoIndex: Number(match[3]),
			pathname: url.pathname,
		};
	} catch {
		return null;
	}
}

function upgradeImageUrl(src) {
	if (!src) return "";

	try {
		const url = new URL(src, location.href);
		if (
			(url.hostname === "twimg.com" || url.hostname.endsWith(".twimg.com")) &&
			url.pathname.includes("/media/")
		) {
			url.searchParams.set("name", "orig");
			return url.toString();
		}
	} catch {
		return src;
	}

	return src;
}

function imageSourceFromLink(link) {
	const image = link.querySelector("img");
	return upgradeImageUrl(image?.currentSrc || image?.src || "");
}

function collectTweetPhotos(route) {
	const byIndex = new Map();

	for (const link of document.querySelectorAll("a[href]")) {
		const linkRoute = linkPhotoRoute(link);
		if (!linkRoute || linkRoute.statusId !== route.statusId) continue;

		const src = imageSourceFromLink(link);
		const previous = byIndex.get(linkRoute.photoIndex);
		if (!previous || (!previous.src && src)) {
			byIndex.set(linkRoute.photoIndex, {
				index: linkRoute.photoIndex,
				href: linkRoute.pathname,
				src,
				alt: link.querySelector("img")?.alt || `Photo ${linkRoute.photoIndex}`,
			});
		}
	}

	return Array.from(byIndex.values())
		.filter((photo) => photo.src)
		.sort((a, b) => a.index - b.index);
}

function ensureStyle() {
	if (document.getElementById(STYLE_ID)) return;

	const style = document.createElement("style");
	style.id = STYLE_ID;
	style.textContent = `
        #${REPLACEMENT_ID} {
            position: fixed;
            z-index: 1;
            overflow: hidden;
            color: rgb(231, 233, 234);
            background: rgb(0, 0, 0);
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
            contain: layout paint;
        }

        #${REPLACEMENT_ID} .xtig-scroller {
            position: absolute;
            inset: 0;
            overflow-x: hidden;
            overflow-y: auto;
            overscroll-behavior: contain;
            scroll-snap-type: y proximity;
            background: rgb(0, 0, 0);
        }

        #${REPLACEMENT_ID} .xtig-track {
            min-height: 100%;
        }

        #${REPLACEMENT_ID} .xtig-photo {
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            width: 100%;
            height: var(--xtig-pane-height, 100vh);
            padding: 12px;
            box-sizing: border-box;
            scroll-snap-align: start;
        }

        #${REPLACEMENT_ID} .xtig-photo img {
            display: block;
            max-width: 100%;
            max-height: calc(var(--xtig-pane-height, 100vh) - 42px);
            width: auto;
            height: auto;
            object-fit: contain;
            user-select: none;
            -webkit-user-drag: none;
        }

        #${REPLACEMENT_ID} .xtig-index {
            margin-top: 8px;
            color: rgb(139, 152, 165);
            font-size: 13px;
            line-height: 18px;
        }

        #${REPLACEMENT_ID} .xtig-mode-toggle,
        #${NATIVE_TOGGLE_ID} {
            position: fixed;
            z-index: 3;
            height: 36px;
            padding: 0 14px;
            border: 0;
            border-radius: 999px;
            color: rgb(239, 243, 244);
            background: rgba(29, 155, 240, 0.95);
            box-shadow: 0 4px 18px rgba(0, 0, 0, 0.35);
            font: 700 14px/36px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
            cursor: pointer;
        }

        #${REPLACEMENT_ID} .xtig-mode-toggle:hover,
        #${NATIVE_TOGGLE_ID}:hover {
            background: rgb(26, 140, 216);
        }
    `;
	document.head.append(style);
}

function rectFromElement(element) {
	const rect = element.getBoundingClientRect();
	if (rect.width < MIN_MEDIA_SIZE || rect.height < MIN_MEDIA_SIZE) return null;
	if (rect.right <= 0 || rect.bottom <= 0) return null;
	if (rect.left >= window.innerWidth || rect.top >= window.innerHeight)
		return null;

	return {
		left: Math.max(0, rect.left),
		top: Math.max(0, rect.top),
		right: Math.min(window.innerWidth, rect.right),
		bottom: Math.min(window.innerHeight, rect.bottom),
		width: Math.min(window.innerWidth, rect.right) - Math.max(0, rect.left),
		height: Math.min(window.innerHeight, rect.bottom) - Math.max(0, rect.top),
	};
}

function mediaImages() {
	return Array.from(document.querySelectorAll('img[src*="/media/"]')).filter(
		(image) => !image.closest(`#${REPLACEMENT_ID}`),
	);
}

function largestVisibleMediaImage() {
	return mediaImages()
		.map((image) => ({ image, rect: rectFromElement(image) }))
		.filter((item) => item.rect)
		.sort(
			(a, b) => b.rect.width * b.rect.height - a.rect.width * a.rect.height,
		)[0]?.image;
}

function mediaPaneRectFromImage(image) {
	const imageRect = rectFromElement(image);
	if (!imageRect) return null;

	for (const selector of [
		'[data-testid="swipe-to-dismiss"]',
		'[role="listitem"]',
		'[aria-roledescription="carousel"]',
	]) {
		const pane = image.closest(selector);
		if (!pane) continue;

		const paneRect = rectFromElement(pane);
		if (
			paneRect &&
			paneRect.width >= imageRect.width &&
			paneRect.height >= imageRect.height
		) {
			return paneRect;
		}
	}

	const candidates = [];
	for (
		let element = image.parentElement;
		element && element !== document.body;
		element = element.parentElement
	) {
		const rect = rectFromElement(element);
		if (!rect) continue;
		if (rect.width < imageRect.width || rect.height < imageRect.height)
			continue;
		if (rect.height < window.innerHeight * 0.68) continue;
		if (
			rect.width < imageRect.width + MIN_PANE_EXPANSION &&
			rect.height < imageRect.height + MIN_PANE_EXPANSION
		) {
			continue;
		}

		candidates.push(rect);
	}

	if (candidates.length === 0) return imageRect;

	return candidates.sort((a, b) => a.width * a.height - b.width * b.height)[0];
}

function currentMediaPaneRect() {
	const image = largestVisibleMediaImage();
	if (!image) return null;
	return mediaPaneRectFromImage(image);
}

function removeGalleryMediaReplacement() {
	document.getElementById(REPLACEMENT_ID)?.remove();

	if (visibleObserver) {
		visibleObserver.disconnect();
		visibleObserver = null;
	}

	lastRenderKey = "";
	activePhotoIndex = 0;
	activePhotoPathname = "";
}

function removeNativeModeToggle() {
	document.getElementById(NATIVE_TOGGLE_ID)?.remove();
}

function unmountAllLayers() {
	removeGalleryMediaReplacement();
	removeNativeModeToggle();
}

function positionModeToggle(button, rect) {
	const top = rect.top + MODE_TOGGLE_TOP_OFFSET;
	const left = Math.max(
		rect.left + 8,
		rect.right - MODE_TOGGLE_RIGHT_OFFSET - 64,
	);

	button.style.top = `${Math.round(top)}px`;
	button.style.left = `${Math.round(left)}px`;
}

function applyPaneRect(element, rect) {
	element.style.left = `${Math.round(rect.left)}px`;
	element.style.top = `${Math.round(rect.top)}px`;
	element.style.width = `${Math.round(rect.width)}px`;
	element.style.height = `${Math.round(rect.height)}px`;
	element.style.setProperty(
		"--xtig-pane-height",
		`${Math.round(rect.height)}px`,
	);
}

function layoutActiveLayer() {
	const rect = currentMediaPaneRect();
	if (!rect) return;

	const replacement = document.getElementById(REPLACEMENT_ID);
	if (replacement) {
		applyPaneRect(replacement, rect);
		const button = replacement.querySelector(".xtig-mode-toggle");
		if (button) positionModeToggle(button, rect);
	}

	const nativeToggle = document.getElementById(NATIVE_TOGGLE_ID);
	if (nativeToggle) {
		positionModeToggle(nativeToggle, rect);
	}
}

function scheduleLayerLayout() {
	clearTimeout(layoutTimer);
	layoutTimer = setTimeout(layoutActiveLayer, LAYOUT_DEBOUNCE_MS);
}

function switchToNativeMode() {
	const targetPathname = activePhotoPathname;
	setViewerMode(ViewerMode.Native);
	removeGalleryMediaReplacement();

	if (targetPathname && targetPathname !== location.pathname) {
		const nativeLink = Array.from(document.querySelectorAll("a[href]")).find(
			(link) =>
				!link.closest(`#${REPLACEMENT_ID}`) &&
				linkPhotoRoute(link)?.pathname === targetPathname,
		);
		if (nativeLink) {
			nativeLink.click();
			return;
		}

		location.assign(targetPathname);
		return;
	}

	reconcileView();
}

function switchToGalleryMode() {
	setViewerMode(ViewerMode.Gallery);
	reconcileView();
}

function mountNativeModeToggle(routeState) {
	if (routeState.kind !== RouteKind.PhotoRoute) {
		removeNativeModeToggle();
		return;
	}

	ensureStyle();
	removeGalleryMediaReplacement();

	let button = document.getElementById(NATIVE_TOGGLE_ID);
	if (!button) {
		button = document.createElement("button");
		button.type = "button";
		button.id = NATIVE_TOGGLE_ID;
		button.textContent = "长图";
		button.setAttribute("aria-label", "Switch to long image viewer");
		button.addEventListener("click", switchToGalleryMode);
		document.body.append(button);
	}

	layoutActiveLayer();
}

function createModeButton() {
	const button = document.createElement("button");
	button.type = "button";
	button.className = "xtig-mode-toggle";
	button.textContent = "原生";
	button.setAttribute("aria-label", "Switch to native image viewer");
	button.addEventListener("click", switchToNativeMode);
	return button;
}

function createMediaReplacement(photos, initialPhotoIndex) {
	const replacement = document.createElement("div");
	replacement.id = REPLACEMENT_ID;

	const scroller = document.createElement("div");
	scroller.className = "xtig-scroller";

	const track = document.createElement("div");
	track.className = "xtig-track";

	for (const photo of photos) {
		const section = document.createElement("section");
		section.className = "xtig-photo";
		section.dataset.photoIndex = String(photo.index);

		const image = document.createElement("img");
		image.src = photo.src;
		image.alt = photo.alt;
		image.loading = photo.index === initialPhotoIndex ? "eager" : "lazy";
		image.decoding = "async";

		const index = document.createElement("div");
		index.className = "xtig-index";
		index.textContent = `${photo.index} / ${photos.length}`;

		section.append(image, index);
		track.append(section);
	}

	scroller.append(track);
	replacement.append(scroller, createModeButton());
	return { replacement, scroller };
}

function currentPhotoElement(replacement, photoIndex) {
	return replacement.querySelector(
		`.xtig-photo[data-photo-index="${photoIndex}"]`,
	);
}

function scrollToInitialPhoto(replacement, scroller, photoIndex) {
	requestAnimationFrame(() => {
		const target = currentPhotoElement(replacement, photoIndex);
		if (!target) return;

		scroller.scrollTop = target.offsetTop;
	});
}

function observeVisiblePhoto(photos, scroller) {
	const byIndex = new Map(photos.map((photo) => [photo.index, photo]));
	visibleObserver?.disconnect();

	visibleObserver = new IntersectionObserver(
		(entries) => {
			const visible = entries
				.filter((entry) => entry.isIntersecting)
				.sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
			if (!visible) return;

			const photoIndex = Number(visible.target.dataset.photoIndex);
			const photo = byIndex.get(photoIndex);
			if (!photo) return;

			activePhotoIndex = photoIndex;
			activePhotoPathname = photo.href;
		},
		{
			root: scroller,
			threshold: [0.35, 0.55, 0.75],
		},
	);

	for (const element of scroller.querySelectorAll(".xtig-photo")) {
		visibleObserver.observe(element);
	}
}

function mountGalleryMediaReplacement(route, photos) {
	removeNativeModeToggle();

	const renderKey = `${route.statusId}:${photos
		.map((photo) => `${photo.index}:${photo.src}`)
		.join("|")}`;
	const existing = document.getElementById(REPLACEMENT_ID);
	if (renderKey === lastRenderKey && existing) {
		layoutActiveLayer();
		if (activePhotoIndex !== route.photoIndex) {
			const scroller = existing.querySelector(".xtig-scroller");
			if (scroller) {
				scrollToInitialPhoto(existing, scroller, route.photoIndex);
			}
		}
		return;
	}

	removeGalleryMediaReplacement();
	ensureStyle();

	const initialPhoto =
		photos.find((photo) => photo.index === route.photoIndex) ?? photos[0];
	const { replacement, scroller } = createMediaReplacement(
		photos,
		initialPhoto.index,
	);
	document.body.append(replacement);

	lastRenderKey = renderKey;
	activePhotoIndex = initialPhoto.index;
	activePhotoPathname = initialPhoto.href;

	layoutActiveLayer();
	scrollToInitialPhoto(replacement, scroller, initialPhoto.index);
	observeVisiblePhoto(photos, scroller);
}

function reconcileView() {
	clearTimeout(retryTimer);

	const routeState = getRouteState();
	if (routeState.key !== lastRouteKey) {
		retryCount = 0;
		lastRouteKey = routeState.key;
	}

	if (routeState.kind !== RouteKind.PhotoRoute) {
		retryCount = 0;
		unmountAllLayers();
		return;
	}

	const route = routeState.photo;
	const photos = collectTweetPhotos(route);
	if (photos.length >= 2 && currentMediaPaneRect()) {
		retryCount = 0;
		if (getViewerMode() === ViewerMode.Native) {
			mountNativeModeToggle(routeState);
		} else {
			mountGalleryMediaReplacement(route, photos);
		}
		return;
	}

	unmountAllLayers();

	if (retryCount < MAX_COLLECT_RETRIES) {
		retryCount += 1;
		retryTimer = setTimeout(reconcileView, COLLECT_RETRY_MS);
	}
}

function nodeMayAffectViewer(node) {
	if (!(node instanceof Element)) return false;
	return (
		node.matches(VIEWER_MUTATION_SELECTOR) ||
		Boolean(node.querySelector(VIEWER_MUTATION_SELECTOR))
	);
}

function mutationsMayAffectViewer(records) {
	return records.some((record) => {
		if (record.type === "attributes") {
			return nodeMayAffectViewer(record.target);
		}

		return [...record.addedNodes, ...record.removedNodes].some(
			nodeMayAffectViewer,
		);
	});
}

function scheduleRender() {
	clearTimeout(renderTimer);
	renderTimer = setTimeout(reconcileView, RENDER_DEBOUNCE_MS);
}

function patchHistoryMethod(name) {
	const original = history[name];
	history[name] = function patchedHistoryMethod(...args) {
		const result = original.apply(this, args);
		scheduleRender();
		return result;
	};
}

function setup() {
	patchHistoryMethod("pushState");
	patchHistoryMethod("replaceState");
	window.addEventListener("popstate", scheduleRender);
	window.addEventListener("resize", scheduleLayerLayout);
	window.addEventListener("scroll", scheduleLayerLayout, true);

	const observer = new MutationObserver((records) => {
		if (!mutationsMayAffectViewer(records)) return;
		scheduleRender();
		scheduleLayerLayout();
	});
	observer.observe(document.documentElement, {
		attributes: true,
		attributeFilter: ["href", "src"],
		childList: true,
		subtree: true,
	});

	scheduleRender();
}

try {
	setup();
} catch (error) {
	console.error(`[${SCRIPT_NAME}]`, error);
}
