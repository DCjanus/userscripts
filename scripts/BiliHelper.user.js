// ==UserScript==
// @name         BiliHelper
// @namespace    https://github.com/dcjanus/userscripts
// @description  B 站增强脚本，支持打开视频到后台新标签页，方便快速打开多个视频以预加载
// @author       DCjanus
// @match        https://t.bilibili.com/*
// @icon         https://t.bilibili.com/favicon.ico
// @updateURL    https://github.com/DCjanus/userscripts/raw/master/scripts/BiliHelper.user.js
// @downloadURL  https://github.com/DCjanus/userscripts/raw/master/scripts/BiliHelper.user.js
// @version      20230622
// @license      MIT
// ==/UserScript==
'use strict';

function main() {
    setInterval(tick, 500);
}

function tick() {
    const element = document.querySelectorAll('a.bili-dyn-card-video[href*="//www.bilibili.com/video/"]:not([x-dcjanus-processed="true"])');
    for (const old_ele of element) {
        const ele = old_ele.cloneNode(true);
        old_ele.parentNode.replaceChild(ele, old_ele);

        ele.setAttribute('x-dcjanus-processed', 'true');
        ele.setAttribute('target', '_blank');
        ele.addEventListener('click', (event) => {
            event.preventDefault();
            const m_event = new MouseEvent('click', {
                ctrlKey: true,
            });
            const tmp_ele = document.createElement('a');
            tmp_ele.href = ele.href;
            tmp_ele.target = '_blank';
            tmp_ele.dispatchEvent(m_event);
        });
    }
    if (element.length > 0) {
        console.log(`DCjanusLog: ${element.length} elements processed.`);
    }
}

try {
    main();
} catch (e) {
    console.error('DCjanusLog:', e);
}
