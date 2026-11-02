// Shared helpers for the suite: item files built from a dict of frontmatter,
// roadmaps in temp directories, and the built bin run as a subprocess, the
// way CI and agents run it.

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { cpSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { after, type TestContext, test } from "node:test";
import { toml } from "../src/edit.ts";
import { DONE_BEGIN, DONE_END, INDEX_BEGIN, INDEX_END, openRoadmap, type Roadmap } from "../src/model.ts";
import { Day } from "../src/py.ts";
import { writeGenerated } from "../src/render.ts";

export const REPO = resolve(import.meta.dirname, "..");
export const BIN = join(REPO, "bin", "roadmap.js");
export const FIXTURES = join(REPO, "test", "fixtures");

export const README = `# Roadmap\n\n${INDEX_BEGIN}\n${INDEX_END}\n`;
export const DONE = `# Done\n\n${DONE_BEGIN}\n${DONE_END}\n`;

export const D = (year: number, month: number, day: number) => new Day(year, month, day);

/** A frontmatter value written as it stands, for TOML the helpers can't render, such as a date-time. */
export class Raw {
  readonly text: string;

  constructor(text: string) {
    this.text = text;
  }
}

type Value = string | number | boolean | Day | Raw | Value[] | undefined | null;
export type MetaIn = Record<string, Value>;

function render(value: Value): string {
  if (value instanceof Raw) return value.text;
  if (Array.isArray(value)) return `[${value.map(render).join(", ")}]`;
  return toml(value);
}

/** One item file from a dict of frontmatter. A value of undefined or null leaves the key out. */
export function itemText(meta: MetaIn, body = "Prose.", refs?: Record<string, Value[]>): string {
  const lines = [
    "+++",
    ...Object.entries(meta)
      .filter(([, v]) => v !== undefined && v !== null)
      .map(([k, v]) => `${k} = ${render(v)}`),
  ];
  if (refs !== undefined) lines.push("[refs]", ...Object.entries(refs).map(([k, v]) => `${k} = ${render(v)}`));
  return [...lines, "+++", "", body, ""].join("\n");
}

export function openMeta(overrides: MetaIn = {}): MetaIn {
  return { id: "sample", title: "Sample", bucket: "now", rank: 1, filed: D(2026, 9, 6), ...overrides };
}

export function closedMeta(overrides: MetaIn = {}): MetaIn {
  return {
    id: "sample",
    title: "Sample",
    filed: D(2026, 9, 6),
    closed: D(2026, 9, 10),
    outcome: "shipped",
    ...overrides,
  };
}

export function write(path: string, text: string): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, text);
}

/** A roadmap under root/roadmap holding `files` (paths relative to the
 * roadmap dir) on top of a minimal README.md and done.md. With sync, the
 * generated blocks are rendered, so the only problems left are the ones the
 * files cause. */
export function makeRoadmap(root: string, files: Record<string, string>, { sync = true } = {}): Roadmap {
  const directory = join(root, "roadmap");
  for (const [name, text] of Object.entries({ "README.md": README, "done.md": DONE, ...files })) {
    write(join(directory, name), text);
  }
  mkdirSync(join(directory, "items"), { recursive: true });
  mkdirSync(join(directory, "archive"), { recursive: true });
  const rm = openRoadmap(directory);
  if (sync) writeGenerated(rm);
  return rm;
}

export type Result = { status: number; stdout: string; stderr: string };

/** Run the built bin in `cwd`, as a subprocess. ROADMAP_TEST_NODE names
 * another Node to run it with: CI sets it to the oldest Node that `engines`
 * allows, which can't load the .ts test files themselves. */
export function run(args: string[], cwd: string, env: Record<string, string> = {}): Result {
  const result = spawnSync(process.env.ROADMAP_TEST_NODE ?? process.execPath, [BIN, ...args], {
    cwd,
    encoding: "utf8",
    env: { ...process.env, ...env },
  });
  return { status: result.status ?? -1, stdout: result.stdout, stderr: result.stderr };
}

const temps: string[] = [];
// node --test runs each test file in its own process, so this runs once per
// file, after all of that file's tests.
after(() => {
  for (const dir of temps) rmSync(dir, { recursive: true, force: true });
});

/** A fresh temp directory, removed after the file's tests. Call it inside a test. */
export function tempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "roadmap-test-"));
  temps.push(dir);
  return dir;
}

/** A writable copy of test/fixtures/valid. Returns the fixture root, which is
 * the directory commands run from. */
export function validCopy(tmp: string): string {
  cpSync(join(FIXTURES, "valid"), join(tmp, "valid"), { recursive: true });
  return join(tmp, "valid");
}

/** Run git in `cwd`, failing loudly. */
export function git(cwd: string, ...args: string[]): string {
  const result = spawnSync("git", args, { cwd, encoding: "utf8" });
  if (result.status !== 0) throw new Error(`git ${args.join(" ")} failed: ${result.stderr}`);
  return result.stdout;
}

/** An empty git repo with an identity, so commits work in CI. */
export function gitRepo(dir: string): string {
  git(dir, "init", "-q", "-b", "master");
  git(dir, "config", "user.email", "test@example.com");
  git(dir, "config", "user.name", "Test");
  git(dir, "config", "commit.gpgsign", "false");
  return dir;
}

/** Every Markdown file under root/roadmap, by path, to show a refused command wrote nothing. */
export function snapshot(root: string): Record<string, string> {
  const dir = join(root, "roadmap");
  return Object.fromEntries(
    readdirSync(dir, { recursive: true, encoding: "utf8" })
      .filter((p) => p.endsWith(".md"))
      .sort()
      .map((p) => [p, readFileSync(join(dir, p), "utf8")]),
  );
}

function has(haystack: string | Iterable<unknown>, needle: unknown): boolean {
  return typeof haystack === "string" ? haystack.includes(String(needle)) : [...haystack].includes(needle);
}

/** Assert that a string, an array or a set includes `needle`, showing both on failure. */
export function contains(haystack: string | Iterable<unknown>, needle: unknown, message?: string): void {
  if (!has(haystack, needle)) {
    const actual = typeof haystack === "string" ? haystack : [...haystack];
    throw new assert.AssertionError({ actual, expected: needle, operator: "includes", message });
  }
}

/** Assert that a string, an array or a set does not include `needle`. */
export function excludes(haystack: string | Iterable<unknown>, needle: unknown, message?: string): void {
  if (has(haystack, needle)) {
    const actual = typeof haystack === "string" ? haystack : [...haystack];
    throw new assert.AssertionError({ actual, expected: needle, operator: "excludes", message });
  }
}

/** Assert that `fn` throws an instance of `cls` whose message includes `part`. */
export function throwsWith(fn: () => unknown, cls: new (...args: never[]) => Error, part: string): void {
  assert.throws(fn, (exc: unknown) => {
    assert.ok(exc instanceof cls, `expected ${cls.name}, got ${String(exc)}`);
    contains(exc.message, part);
    return true;
  });
}

/** Collect what the code under test writes to stdout and stderr, in-process.
 * Call it first in the test body, never in a hook: the test runner reports
 * through stdout too, and a mock set in a hook can swallow its output. */
export function capture(t: TestContext): string[] {
  const output: string[] = [];
  const write = (chunk: unknown) => {
    output.push(String(chunk));
    return true;
  };
  t.mock.method(process.stdout, "write", write);
  t.mock.method(process.stderr, "write", write);
  return output;
}

/** `test.each` as vitest had it: one test per row, named by `format` with
 * %s as String(), %d as a number and %j as JSON, so the names stay as they were. */
export function each(rows: readonly (readonly unknown[])[]) {
  // biome-ignore lint/suspicious/noExplicitAny: rows are heterogeneous tuples, as test.each's were
  return (format: string, fn: (...args: any[]) => void | Promise<void>): void => {
    for (const row of rows) {
      let next = 0;
      const name = format.replace(/%[sdj%]/g, (spec) => {
        if (spec === "%%") return "%";
        const value = row[next++];
        if (spec === "%d") return String(Number(value));
        if (spec === "%j") return JSON.stringify(value);
        return String(value);
      });
      test(name, () => fn(...row));
    }
  };
}
