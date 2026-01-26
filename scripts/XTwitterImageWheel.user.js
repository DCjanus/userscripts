// ==UserScript==
// @name         XTwitterImageWheel
// @name:zh-CN   X/Twitter 图片滚轮翻页
// @namespace    https://github.com/dcjanus/userscripts
// @description  在图片详情页用鼠标滚轮翻页
// @author       DCjanus
// @match        https://x.com/*
// @match        https://twitter.com/*
// @icon         https://abs.twimg.com/favicons/twitter.2.ico
// @version      20260126
// @license      MIT
// @grant        none
// ==/UserScript==
'use strict';

const SCRIPT_NAME = 'XTwitterImageWheel';
const COOLDOWN_MS = 250;
const CAROUSEL_SELECTOR =
    'div[role="dialog"] [aria-roledescription="carousel"]';

let lastTs = 0;

function isInCarousel() {
    return Boolean(document.querySelector(CAROUSEL_SELECTOR));
}

function dispatchArrow(key) {
    const keyCode = key === 'ArrowLeft' ? 37 : 39;
    const event = new KeyboardEvent('keydown', {
        key,
        code: key,
        keyCode,
        which: keyCode,
        bubbles: true,
        cancelable: true,
    });
    document.dispatchEvent(event);
}

function handleWheel(event) {
    if (!isInCarousel()) {
        return;
    }

    if (event.deltaY === 0) {
        return;
    }

    const now = Date.now();
    if (now - lastTs < COOLDOWN_MS) {
        return;
    }
    lastTs = now;

    if (event.deltaY < 0) {
        dispatchArrow('ArrowLeft');
    } else {
        dispatchArrow('ArrowRight');
    }
}

function setup() {
    document.addEventListener('wheel', handleWheel, { passive: true });
}

try {
    setup();
} catch (error) {
    console.error(`[${SCRIPT_NAME}]`, error);
}
