import assert from "node:assert/strict";
import test from "node:test";

import { expectedVersion, parseVersion } from "../tools/userscript-version.mjs";

test("解析日期版本及同日修订号", () => {
  assert.deepEqual(parseVersion("20260710"), { date: "20260710", revision: 0 });
  assert.deepEqual(parseVersion("20260710.2"), { date: "20260710", revision: 2 });
  assert.equal(parseVersion("1.0.0"), null);
});

test("跨日修改使用当天日期", () => {
  assert.equal(
    expectedVersion({
      baseVersion: "20260709",
      currentVersion: "20260709",
      today: "20260710",
    }),
    "20260710",
  );
});

test("同日修改递增修订号", () => {
  assert.equal(
    expectedVersion({
      baseVersion: "20260710.1",
      currentVersion: "20260710.1",
      today: "20260710",
    }),
    "20260710.2",
  );
});

test("同一 PR 内保留已经更新的版本", () => {
  assert.equal(
    expectedVersion({
      baseVersion: "20260710",
      currentVersion: "20260710.1",
      today: "20260711",
    }),
    "20260710.1",
  );
});

test("默认分支追上版本后继续递增", () => {
  assert.equal(
    expectedVersion({
      baseVersion: "20260710.1",
      currentVersion: "20260710.1",
      today: "20260711",
    }),
    "20260711",
  );
});

test("新脚本使用首次提交日期", () => {
  assert.equal(
    expectedVersion({
      baseVersion: null,
      currentVersion: "20260709",
      today: "20260710",
      addedOn: "20260709",
    }),
    "20260709",
  );
});
