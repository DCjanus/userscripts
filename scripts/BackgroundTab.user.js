// ==UserScript==
// @name         BackgroundTab
// @namespace    https://github.com/dcjanus/userscripts
// @description  支持打开特定网站的链接到后台新标签页，不影响当前页面的浏览，目前支持 B 站首页和动态页的视频链接
// @author       DCjanus
// @match        https://t.bilibili.com/*
// @match        https://www.bilibili.com/*
// @icon         https://www.bilibili.com/favicon.ico
// @version      20230623
// @license      MIT
// @grant        GM_registerMenuCommand
// @grant        GM_unregisterMenuCommand
// @grant        GM_setValue
// @grant        GM_getValue
// ==/UserScript==
'use strict';

const ACTIVITY_NAME = 'B 站动态';
const HOME_NAME = 'B 站首页';
const MENU_VALUE_PREFIX = 'bool_menu_value_for_';
const MENU_ID_PREFIX = 'bool_menu_id_for_';
const PROCESSED_ATTR = 'x-bili-helper-processed';
const SCRIPT_NAME = GM_info.script.name;

class Page {
    constructor(object) {
        this.name = object.name;
        this.key = object.key;
        this.selector = object.selector;
        this.page_match = object.page_match;
        this.default_enable = object.default_enable;
    }

    refresh_menu() {
        const menu_id_key = MENU_ID_PREFIX + this.key;
        const menu_value_key = MENU_VALUE_PREFIX + this.key;

        const menu_id = GM_getValue(menu_id_key, undefined);
        if (menu_id !== undefined) {
            GM_unregisterMenuCommand(menu_id);
        }

        const enabled = this.enabled();
        if (!this.stored_enabled()) {
            console.log(
                `[${SCRIPT_NAME}] ${this.name} 未设置开关，使用默认值 ${enabled}`,
            );
            GM_setValue(menu_value_key, enabled);
        }

        const menu_icon = enabled ? '✅' : '❌';
        const menu_name = `${menu_icon} ${this.name} 点击切换`;
        const new_menu_id = GM_registerMenuCommand(menu_name, () => {
            console.log(`[${SCRIPT_NAME}] ${this.name} 开关切换为 ${!enabled}`);
            GM_setValue(menu_value_key, !enabled);
            refresh_menus();
        });

        GM_setValue(menu_id_key, new_menu_id);
    }

    attach() {
        if (!this.enabled()) {
            return;
        }
        const url = new URL(window.location.href);
        if (!this.page_match(url)) {
            return
        }

        setInterval(this.on_page.bind(this), 1000);
    }

    on_page() {
        if (!this.enabled()) {
            return;
        }

        const elements = document.querySelectorAll(this.selector);
        for (const element of elements) {
            set_background_click(element, this.key);
        }
        if (elements.length > 0) {
            console.log(`[${SCRIPT_NAME}] ${elements.length} 个链接已处理`);
        }
    }

    enabled() {
        return GM_getValue(MENU_VALUE_PREFIX + this.key, this.default_enable);
    }

    stored_enabled() {
        return (
            GM_getValue(MENU_VALUE_PREFIX + this.key, undefined) !== undefined
        );
    }
}

const PAGES = [
    new Page({
        name: HOME_NAME,
        key: 'bili_home',
        selector: `div.bili-video-card a[href*="//www.bilibili.com/video/"]:not([${PROCESSED_ATTR}="true"])`,
        page_match: (url) =>
            url.host === 'www.bilibili.com' && url.pathname === '/',
        default_enable: false,
    }),
    new Page({
        name: ACTIVITY_NAME,
        key: 'bili_activity',
        selector: `a.bili-dyn-card-video[href*="//www.bilibili.com/video/"]:not([${PROCESSED_ATTR}="true"])`,
        page_match: (url) => url.host === 't.bilibili.com',
        default_enable: true,
    }),
];

function refresh_menus() {
    // TODO: 现有菜单点击开关的体验不是很好，切换成点击菜单时弹出对话框选择开关
    for (const page of PAGES) {
        page.refresh_menu();
    }
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
    refresh_menus();
    const url = new URL(window.location.href);
    for (const page of PAGES) {
        if (page.page_match(url)) {
            page.attach();
        }
    }
}

try {
    main();
} catch (e) {
    console.error(`[${SCRIPT_NAME}] ${e}`);
}
