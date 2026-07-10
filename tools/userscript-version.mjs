#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";

const VERSION_PATTERN = /^(\/\/\s*@version\s+)(\S+)(\s*)$/m;
const VERSION_VALUE_PATTERN = /^(\d{8})(?:\.(\d+))?$/;

export function parseVersion(value) {
  const match = VERSION_VALUE_PATTERN.exec(value);
  if (!match) return null;

  return {
    date: match[1],
    revision: Number(match[2] ?? 0),
  };
}

function compareVersions(left, right) {
  if (left.date !== right.date) return left.date.localeCompare(right.date);
  return left.revision - right.revision;
}

export function expectedVersion({ baseVersion, currentVersion, today, addedOn }) {
  const base = parseVersion(baseVersion ?? "");
  const current = parseVersion(currentVersion);

  if (!base) return addedOn ?? today;

  if (current && current.date <= today && compareVersions(current, base) > 0) {
    return currentVersion;
  }

  const targetDate = base.date > today ? base.date : today;
  return base.date === targetDate
    ? `${targetDate}.${base.revision + 1}`
    : targetDate;
}

function git(args, options = {}) {
  const { trim = true, ...execOptions } = options;
  try {
    const output = execFileSync("git", args, {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
      ...execOptions,
    });
    return trim ? output.trim() : output;
  } catch {
    return null;
  }
}

function readPushBase() {
  if (process.env.GITHUB_EVENT_NAME !== "push" || !process.env.GITHUB_EVENT_PATH) {
    return null;
  }

  try {
    const { before } = JSON.parse(readFileSync(process.env.GITHUB_EVENT_PATH, "utf8"));
    return /^0+$/.test(before) ? null : before;
  } catch {
    return null;
  }
}

function resolveBase(explicitBase) {
  if (explicitBase) return explicitBase;

  const pushBase = readPushBase();
  if (pushBase) return pushBase;

  if (process.env.GITHUB_BASE_REF) return `origin/${process.env.GITHUB_BASE_REF}`;

  return (
    git(["symbolic-ref", "--quiet", "--short", "refs/remotes/origin/HEAD"]) ??
    "origin/master"
  );
}

function formatDate(date) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const get = (type) => parts.find((part) => part.type === type).value;
  return `${get("year")}${get("month")}${get("day")}`;
}

function addedOn(filename) {
  const timestamp = git([
    "log",
    "--diff-filter=A",
    "--reverse",
    "--format=%aI",
    "--",
    filename,
  ])?.split("\n")[0];
  return timestamp ? formatDate(new Date(timestamp)) : null;
}

function discoverFiles(base) {
  const changed = git([
    "diff",
    "--name-only",
    "--diff-filter=AM",
    base,
    "--",
    "scripts",
  ]);
  const untracked = git([
    "ls-files",
    "--others",
    "--exclude-standard",
    "--",
    "scripts/*.user.js",
  ]);

  return [...new Set(`${changed ?? ""}\n${untracked ?? ""}`.split("\n"))].filter(
    (filename) => filename.endsWith(".user.js"),
  );
}

function parseArguments(args) {
  let mode = process.env.CI || process.env.GITHUB_ACTIONS ? "check" : "write";
  let base;
  const filenames = [];

  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === "--check") mode = "check";
    else if (argument === "--write") mode = "write";
    else if (argument === "--base") base = args[++index];
    else filenames.push(argument);
  }

  if (base === undefined && args.includes("--base")) {
    throw new Error("--base 需要指定 Git ref");
  }

  return { mode, base, filenames };
}

function versionFrom(content, filename) {
  const match = VERSION_PATTERN.exec(content);
  if (!match) throw new Error(`${filename} 缺少 // @version 元数据`);
  return match[2];
}

export function main(args = process.argv.slice(2)) {
  const options = parseArguments(args);
  const base = resolveBase(options.base);
  if (!git(["rev-parse", "--verify", `${base}^{commit}`])) {
    throw new Error(`无法读取基准提交 ${base}`);
  }

  const today = formatDate(new Date());
  const filenames = (options.filenames.length ? options.filenames : discoverFiles(base))
    .map((filename) => path.relative(process.cwd(), path.resolve(filename)))
    .filter((filename) => filename.startsWith(`scripts${path.sep}`) && filename.endsWith(".user.js"))
    .filter(existsSync);
  const pending = [];

  for (const filename of new Set(filenames)) {
    const content = readFileSync(filename, "utf8");
    const currentVersion = versionFrom(content, filename);
    const baseContent = git(["show", `${base}:${filename}`], { trim: false });

    if (baseContent === content) continue;

    const baseVersion = baseContent ? versionFrom(baseContent, `${base}:${filename}`) : null;
    const nextVersion = expectedVersion({
      baseVersion,
      currentVersion,
      today,
      addedOn: baseContent ? null : addedOn(filename),
    });

    if (currentVersion === nextVersion) continue;

    pending.push({ filename, currentVersion, nextVersion });
    if (options.mode === "write") {
      writeFileSync(
        filename,
        content.replace(VERSION_PATTERN, `$1${nextVersion}$3`),
      );
    }
  }

  for (const { filename, currentVersion, nextVersion } of pending) {
    console.log(`${filename}: ${currentVersion} -> ${nextVersion}`);
  }

  if (pending.length && options.mode === "check") {
    console.error("Userscript 版本号未更新；请在本地运行 prek 后提交自动修正。");
    process.exitCode = 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
