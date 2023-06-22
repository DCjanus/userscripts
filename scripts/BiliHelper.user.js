// ==UserScript==
// @name         BiliHelper
// @namespace    https://github.com/dcjanus/userscripts
// @description  B 站增强脚本，支持打开视频到后台新标签页，方便快速打开多个视频以预加载
// @author       DCjanus
// @match        https://t.bilibili.com/*
// @match        https://www.bilibili.com/*
// @icon         https://t.bilibili.com/favicon.ico
// @updateURL    https://github.com/DCjanus/userscripts/raw/master/scripts/BiliHelper.user.js
// @downloadURL  https://github.com/DCjanus/userscripts/raw/master/scripts/BiliHelper.user.js
// @version      20230623
// @license      MIT
// @grant        GM_registerMenuCommand
// @grant        GM_unregisterMenuCommand
// @grant        GM_setValue
// @grant        GM_getValue
// ==/UserScript==
'use strict';

const ACTIVITY_NAME = '动态页';
const HOME_NAME = '首页';
const MENU_VALUE_PREFIX = 'bool_menu_value_for_';
const MENU_ID_PREFIX = 'bool_menu_id_for_';
const PROCESSED_ATTR = 'x-bili-helper-processed';

function refresh_menus() {
    // TODO: 现有菜单点击开关的体验不是很好，切换成点击菜单时弹出对话框选择开关
    const pages = [ACTIVITY_NAME, HOME_NAME];
    for (const page of pages) {
        const menu_id_key = MENU_ID_PREFIX + page;
        const menu_value_key = MENU_VALUE_PREFIX + page;

        const menu_id = GM_getValue(menu_id_key, undefined);
        if (menu_id !== undefined) {
            GM_unregisterMenuCommand(menu_id);
        }

        const enable = GM_getValue(menu_value_key, true);
        const has_set = GM_getValue(menu_id_key, false);
        if (!has_set) {
            // 第一次设置默认值
            GM_setValue(menu_value_key, enable);
        }

        const menu_icon = enable ? '✅' : '❌';
        const menu_name = `${menu_icon} ${page} 点击切换`;
        const new_menu_id = GM_registerMenuCommand(menu_name, () => {
            GM_setValue(menu_value_key, !enable);
            refresh_menus();
        });

        GM_setValue(menu_id_key, new_menu_id);
    }
}


function on_page(page_name, selector) {
    return function () {
        const enable = GM_getValue(MENU_VALUE_PREFIX + page_name, true);
        if (!enable) {
            return;
        }
        const elements = document.querySelectorAll(selector);
        for (const element of elements) {
            set_background_click(element, page_name)
        }
        if (elements.length > 0) {
            console.log(`[BiliHelper] ${elements.length} elements processed.`);
        }
    };
}

function set_background_click(old_element, page_name) {
    const new_element = old_element.cloneNode(true);
    old_element.parentNode.replaceChild(new_element, old_element);

    new_element.setAttribute('target', '_blank');
    new_element.addEventListener('click', (event) => {
        event.preventDefault();
        const tmp_ele = document.createElement('a');
        tmp_ele.href = new_element.href;
        tmp_ele.target = '_blank';

        // 为了保证切换开关后对当前页面立即生效，这里直接读取开关值
        const enable = GM_getValue(MENU_VALUE_PREFIX + page_name, true);
        const mouse_event = new MouseEvent('click', {
            ctrlKey: enable, // for Windows and Linux
            metaKey: enable, // for Mac OS
        });
        tmp_ele.dispatchEvent(new MouseEvent('click', mouse_event));
    });
    new_element.setAttribute(PROCESSED_ATTR, 'true');
}

function main() {
    const url = new URL(window.location.href);
    if (url.host === 't.bilibili.com') {
        setInterval(on_page(ACTIVITY_NAME, `a.bili-dyn-card-video[href*="//www.bilibili.com/video/"]:not([${PROCESSED_ATTR}="true"])`), 500);
    }
    if (url.host === 'www.bilibili.com' && url.pathname === '/') {
        setInterval(on_page(HOME_NAME, `div.bili-video-card a[href*="//www.bilibili.com/video/"]:not([${PROCESSED_ATTR}="true"])`), 500);
    }
}

try {
    refresh_menus();
    main();
} catch (e) {
    console.error(`[BiliHelper] ${e}`);
}
