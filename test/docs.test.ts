// What people and agents read can't drift from the CLI: SKILL.md and its
// references name only real commands and document every rule tag; README.md
// and the docs/ vault name real commands and Action inputs, and their links
// resolve.

import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { parse as parseToml } from "smol-toml";
import { expect, test } from "vitest";
import { COMMANDS } from "../src/cli.ts";
import { check } from "../src/commands.ts";
import {
  CLOSED_OPTIONAL,
  CLOSED_REQUIRED,
  DECISIONS_INTRO,
  OPEN_OPTIONAL,
  OPEN_REQUIRED,
  openRoadmap,
  RULES,
  VERSION,
} from "../src/model.ts";
import { REPO } from "./helpers.ts";

const read = (path: string) => readFileSync(join(REPO, path), "utf8");
const literal = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const matches = (re: RegExp, text: string) => [...text.matchAll(re)].map((m) => m[1] as string);

const CLI_COMMANDS = new Set(Object.keys(COMMANDS));
const NAMED =
  /(?:roadmap\.(?:py|js|mjs)|npx (?:--no -- )?roadmap|\{\{command\}\}) (?:--dir \S+ )?([a-z]+(?:-[a-z]+)*)/g;

const AGENT_DOCS = ["SKILL.md", "references/conventions.md", "assets/template/README.md"];
const README = read("README.md");
const DOC_NAMES = readdirSync(join(REPO, "docs"))
  .filter((p) => p.endsWith(".md"))
  .sort();
// README.md is the anchor outside the vault; every note it links to is in docs/.
const PAGES: Record<string, string> = {
  "README.md": README,
  ...Object.fromEntries(DOC_NAMES.map((n) => [`docs/${n}`, read(`docs/${n}`)])),
};
const USER_DOCS = Object.values(PAGES).join("\n");

function section(title: string): string {
  const match = new RegExp(`^## ${literal(title)}\\n([\\s\\S]*?)(?=^## |(?![\\s\\S]))`, "m").exec(README);
  if (!match) throw new Error(`README.md has no '## ${title}' section`);
  return match[1] as string;
}

function doc(name: string): string {
  expect(existsSync(join(REPO, "docs", name)), `docs/${name} is missing`).toBe(true);
  return read(`docs/${name}`);
}

function unknown(named: Set<string>, known: Set<string>): string[] {
  return [...named].filter((c) => !known.has(c)).sort();
}

// --- SKILL.md and the agent docs ---------------------------------------------

test("SKILL.md's frontmatter names and describes the skill", () => {
  const match = /^---\n([\s\S]*?)\n---\n/.exec(read("SKILL.md"));
  expect(match, "SKILL.md must open with ---fenced frontmatter").not.toBeNull();
  const meta = Object.fromEntries(
    (match?.[1] ?? "")
      .split("\n")
      .filter((line) => line.includes(": ") && !line.startsWith(" "))
      .map((line) => [line.slice(0, line.indexOf(": ")), line.slice(line.indexOf(": ") + 2)]),
  );

  expect(meta.name).toBe("roadmap");
  expect(meta.description?.length ?? 0, "the description is what makes an agent load the skill").toBeGreaterThan(100);
});

test("every command the agent docs name exists", () => {
  for (const name of AGENT_DOCS) {
    const named = new Set(matches(NAMED, read(name)));
    if (name !== "references/conventions.md") expect(named.size, `${name} names no commands`).toBeGreaterThan(0);
    expect(unknown(named, CLI_COMMANDS), `${name} names commands the CLI does not have`).toEqual([]);
  }
});

test("every rule tag is documented for agents", () => {
  const table = read("references/conventions.md");

  for (const tag of Object.keys(RULES)) {
    expect(table.includes(`| \`${tag}\` |`), `references/conventions.md has no row for [${tag}]`).toBe(true);
  }
});

test("every documented frontmatter field is one the schema knows", () => {
  const known = new Set([...OPEN_REQUIRED, ...OPEN_OPTIONAL, ...CLOSED_REQUIRED, ...CLOSED_OPTIONAL]);
  // roadmap.toml keys, [refs] kinds and milestones
  const other = new Set(["root", "specs", "changes", "files", "beta"]);
  for (const name of AGENT_DOCS) {
    for (const block of matches(/```toml\n([\s\S]*?)```/g, read(name))) {
      const fields = matches(/^([a-z_]+) =/gm, block.replaceAll("+++", "")).filter((f) => !other.has(f));
      expect(unknown(new Set(fields), known), `${name} documents unknown fields`).toEqual([]);
    }
  }
});

test("the template config parses with its examples uncommented", () => {
  const uncommented = read("assets/template/roadmap.toml").replace(/^# (root|specs|changes|adrs|beta)/gm, "$1");

  expect(parseToml(uncommented).milestones).toHaveProperty("beta");
});

test("the template decisions log is what decide writes", () => {
  expect(read("assets/template/decisions.md")).toBe(DECISIONS_INTRO);
});

test("the dogfood roadmap is clean", () => {
  expect(check(openRoadmap(join(REPO, "roadmap"))).map(String)).toEqual([]);
});

test("package.json and the CLI agree on the version", () => {
  expect(JSON.parse(read("package.json")).version).toBe(VERSION);
});

// --- README.md, docs/ and CONTRIBUTING.md -------------------------------------

test("client checks are in the user docs, and developer tests in CONTRIBUTING", () => {
  const contributing = read("CONTRIBUTING.md");

  expect(doc("checking.md")).toMatch(/roadmap(\.py)? check/);
  expect(contributing).toContain("npx vitest run");
  expect(USER_DOCS).not.toContain("npx vitest");
  expect(section("Contributing")).toContain("CONTRIBUTING.md");
});

test("every command the docs and CONTRIBUTING name exists", () => {
  for (const [name, text] of Object.entries({ "user docs": USER_DOCS, "CONTRIBUTING.md": read("CONTRIBUTING.md") })) {
    const named = new Set(matches(NAMED, text));

    expect(named.size, `${name} names no commands; the regex is out of date`).toBeGreaterThan(0);
    expect(unknown(named, CLI_COMMANDS), `${name} names commands the CLI does not have`).toEqual([]);
  }
});

test("every Action input the docs use exists", () => {
  const action = read("action.yml");
  const inputs = new Set(matches(/^ {2}([a-z-]+):$/gm, action.split("runs:")[0] as string));
  const used = new Set<string>();
  for (const block of matches(/uses: \S*roadmap-skill@\S+\n\s+with:\n((?:\s{10,}\S.*\n)+)/g, USER_DOCS)) {
    for (const input of matches(/^\s+([a-z-]+):/gm, block)) used.add(input);
  }

  expect(used.size, "the docs show no `uses: ...roadmap-skill@...` step with inputs").toBeGreaterThan(0);
  expect(unknown(used, inputs), "the docs use Action inputs that action.yml lacks").toEqual([]);
});

test("the rule-tags note points at the rule table", () => {
  expect(doc("rule-tags.md")).toContain("references/conventions.md");
});

test("every rule tag is explained in the docs", () => {
  const tags = doc("rule-tags.md");
  for (const tag of Object.keys(RULES)) {
    expect(tags.includes(`\`[${tag}]\``), `docs/rule-tags.md does not explain [${tag}]`).toBe(true);
  }
});

test("every slash command the README advertises is handled by the skill", () => {
  const advertised = new Set(matches(/^\| `\/roadmap ([a-z]+)/gm, section("Slash commands")));
  const handled = new Set(matches(/^\| `([a-z]+)[` ]/gm, read("SKILL.md")));

  expect(advertised.size, "README.md's slash-command table is empty or the regex is out of date").toBeGreaterThan(0);
  expect(unknown(advertised, handled), "SKILL.md does not say what to do for these").toEqual([]);
});

test("no doc or template runs a bare npx roadmap", () => {
  // An unrelated package called \`roadmap\` is on npm. Without \`--no --\`, npx in
  // a non-interactive shell installs and runs it when this one is missing.
  const sources: Record<string, string> = {
    ...PAGES,
    ...Object.fromEntries(
      [...AGENT_DOCS, "CONTRIBUTING.md", "CLAUDE.md", "action.yml", "assets/template/decisions.md"].map((n) => [
        n,
        read(n),
      ]),
    ),
  };
  for (const [name, text] of Object.entries(sources)) {
    expect(text.match(/npx roadmap\b/g) ?? [], `${name} has a bare \`npx roadmap\``).toEqual([]);
  }
});

test("the docs tell users to make the skill a visible requirement", () => {
  for (const [name, install] of Object.entries({
    "README.md": section("Quick start"),
    "docs/install.md": doc("install.md"),
  })) {
    expect(install, name).toContain("CLAUDE.md");
    expect(install, `${name}: the CLAUDE.md snippet must say what to do without the skill`).toContain(
      "If the skill isn't available",
    );
  }
});

test("the README links every note in the vault", () => {
  const linked = new Set(matches(/\]\(docs\/([^)#]+\.md)/g, README));

  expect(unknown(new Set(DOC_NAMES), linked), "README.md does not link these notes").toEqual([]);
});

test("every relative link in the docs resolves", () => {
  // Markdown links only: GitHub doesn't render Obsidian [[wikilinks]].
  for (const [name, text] of Object.entries(PAGES)) {
    const prose = text.replace(/```[\s\S]*?```/g, "");
    expect(prose.includes("[["), `${name} uses a [[wikilink]]; use a Markdown link`).toBe(false);
    for (const target of matches(/\]\(([^)\s]+)\)/g, prose)) {
      if (/^[a-z]+:/.test(target) || target.startsWith("#")) continue;
      const path = join(REPO, dirname(name), target.split("#")[0] as string);
      expect(existsSync(path), `${name} links ${target}, which doesn't exist`).toBe(true);
    }
  }
});

test("the CHANGELOG has an entry for the current version", () => {
  const entry = new RegExp(`^## ${literal(VERSION)} — \\d{4}-\\d{2}-\\d{2}$`, "m");

  expect(entry.test(read("CHANGELOG.md")), `CHANGELOG.md has no '## ${VERSION} — <date>' entry`).toBe(true);
});
