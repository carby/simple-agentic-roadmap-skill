// Shared helpers for the suite: item files built from a dict of frontmatter,
// roadmaps in temp directories, and the built bin run as a subprocess, the
// way CI and agents run it.

import { spawnSync } from "node:child_process";
import { cpSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { onTestFinished } from "vitest";
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

/** Run the built bin in `cwd`, as a subprocess. */
export function run(args: string[], cwd: string, env: Record<string, string> = {}): Result {
  const result = spawnSync(process.execPath, [BIN, ...args], {
    cwd,
    encoding: "utf8",
    env: { ...process.env, ...env },
  });
  return { status: result.status ?? -1, stdout: result.stdout, stderr: result.stderr };
}

/** A fresh temp directory, removed when the test finishes. Call it inside a test. */
export function tempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "roadmap-test-"));
  onTestFinished(() => rmSync(dir, { recursive: true, force: true }));
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
