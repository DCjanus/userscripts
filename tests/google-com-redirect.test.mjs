import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const script = readFileSync(
	fileURLToPath(
		new URL("../scripts/GoogleComRedirect.user.js", import.meta.url),
	),
	"utf8",
);

function visit(tab, href, now = 0) {
	const redirects = [];
	const context = {
		URL,
		Date: class extends Date {
			static now() {
				return now;
			}
		},
		window: {
			location: {
				href,
				replace(target) {
					redirects.push(target);
				},
			},
		},
		GM_getTab(callback) {
			callback(tab);
		},
		GM_saveTab(_tab, callback) {
			callback?.();
		},
	};
	vm.runInNewContext(script, context);
	return redirects;
}

test("香港搜索经过 /ncr 后保留路径、查询参数和片段", () => {
	const tab = {};
	const source =
		"https://www.google.com.hk/search?q=%E7%83%88%E7%81%AB&tbm=isch#top";
	const target =
		"https://www.google.com/search?q=%E7%83%88%E7%81%AB&tbm=isch#top";

	assert.deepEqual(visit(tab, source), ["https://www.google.com/ncr"]);
	assert.deepEqual(visit(tab, "https://www.google.com/"), [target]);
	assert.deepEqual(visit(tab, target), []);
	assert.equal(tab.googleComRedirect, undefined);
});

test("Google 又跳回香港时不会形成循环，稍后允许重试", () => {
	const tab = {};
	const source = "https://www.google.com.hk/search?q=test";

	assert.equal(visit(tab, source, 1000).length, 1);
	assert.equal(visit(tab, "https://www.google.com/ncr", 1001).length, 1);
	assert.deepEqual(visit(tab, source, 1002), []);
	assert.deepEqual(visit(tab, `${source}&sourceid=chrome`, 1003), []);
	assert.deepEqual(visit(tab, source, 16_001), ["https://www.google.com/ncr"]);
});

test("不处理其他 Google 香港路径，也不跨标签页复用跳转状态", () => {
	const firstTab = {};
	const secondTab = {};

	assert.deepEqual(visit(firstTab, "https://www.google.com.hk/maps"), []);
	assert.deepEqual(visit(firstTab, "https://www.google.com.hk/"), [
		"https://www.google.com/ncr",
	]);
	assert.deepEqual(visit(secondTab, "https://www.google.com/"), []);
});
