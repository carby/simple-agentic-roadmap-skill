// What people and agents read can't drift from the CLI: SKILL.md and its
// references name only real commands and document every rule tag; README.md
// and the docs/ vault name real commands and Action inputs, and their links
// resolve.

import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { parse as parseToml } from "smol-toml";
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
import { contains, excludes, REPO } from "./helpers.ts";

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
  assert.equal(existsSync(join(REPO, "docs", name)), true, `docs/${name} is missing`);
  return read(`docs/${name}`);
}

function unknown(named: Set<string>, known: Set<string>): string[] {
  return [...named].filter((c) => !known.has(c)).sort();
}

// --- SKILL.md and the agent docs ---------------------------------------------

test("SKILL.md's frontmatter names and describes the skill", () => {
  const match = /^---\n([\s\S]*?)\n---\n/.exec(read("SKILL.md"));
  assert.notEqual(match, null, "SKILL.md must open with ---fenced frontmatter");
  const meta = Object.fromEntries(
    (match?.[1] ?? "")
      .split("\n")
      .filter((line) => line.includes(": ") && !line.startsWith(" "))
      .map((line) => [line.slice(0, line.indexOf(": ")), line.slice(line.indexOf(": ") + 2)]),
  );

  assert.equal(meta.name, "roadmap");
  assert.ok((meta.description?.length ?? 0) > 100, "the description is what makes an agent load the skill");
});

test("every command the agent docs name exists", () => {
  for (const name of AGENT_DOCS) {
    const named = new Set(matches(NAMED, read(name)));
    if (name !== "references/conventions.md") assert.ok(named.size > 0, `${name} names no commands`);
    assert.deepEqual(unknown(named, CLI_COMMANDS), [], `${name} names commands the CLI does not have`);
  }
});

test("every rule tag is documented for agents", () => {
  const table = read("references/conventions.md");

  for (const tag of Object.keys(RULES)) {
    assert.equal(table.includes(`| \`${tag}\` |`), true, `references/conventions.md has no row for [${tag}]`);
  }
});

test("every documented frontmatter field is one the schema knows", () => {
  const known = new Set([...OPEN_REQUIRED, ...OPEN_OPTIONAL, ...CLOSED_REQUIRED, ...CLOSED_OPTIONAL]);
  // roadmap.toml keys, [refs] kinds and milestones
  const other = new Set(["root", "specs", "changes", "files", "beta"]);
  for (const name of AGENT_DOCS) {
    for (const block of matches(/```toml\n([\s\S]*?)```/g, read(name))) {
      const fields = matches(/^([a-z_]+) =/gm, block.replaceAll("+++", "")).filter((f) => !other.has(f));
      assert.deepEqual(unknown(new Set(fields), known), [], `${name} documents unknown fields`);
    }
  }
});

test("the template config parses with its examples uncommented", () => {
  const uncommented = read("assets/template/roadmap.toml").replace(/^# (root|specs|changes|adrs|beta)/gm, "$1");

  assert.ok("beta" in (parseToml(uncommented).milestones as object));
});

test("the template decisions log is what decide writes", () => {
  assert.equal(read("assets/template/decisions.md"), DECISIONS_INTRO);
});

test("the dogfood roadmap is clean", () => {
  assert.deepEqual(check(openRoadmap(join(REPO, "roadmap"))).map(String), []);
});

test("package.json and the CLI agree on the version", () => {
  assert.equal(JSON.parse(read("package.json")).version, VERSION);
});

// --- README.md, docs/ and CONTRIBUTING.md -------------------------------------

test("client checks are in the user docs, and developer tests in CONTRIBUTING", () => {
  const contributing = read("CONTRIBUTING.md");

  assert.match(doc("checking.md"), /roadmap(\.py)? check/);
  contains(contributing, "npm test");
  excludes(USER_DOCS, "node --test");
  contains(section("Contributing"), "CONTRIBUTING.md");
});

test("every command the docs and CONTRIBUTING name exists", () => {
  for (const [name, text] of Object.entries({ "user docs": USER_DOCS, "CONTRIBUTING.md": read("CONTRIBUTING.md") })) {
    const named = new Set(matches(NAMED, text));

    assert.ok(named.size > 0, `${name} names no commands; the regex is out of date`);
    assert.deepEqual(unknown(named, CLI_COMMANDS), [], `${name} names commands the CLI does not have`);
  }
});

test("every Action input the docs use exists", () => {
  const action = read("action.yml");
  const inputs = new Set(matches(/^ {2}([a-z-]+):$/gm, action.split("runs:")[0] as string));
  const used = new Set<string>();
  for (const block of matches(/uses: \S*roadmap-skill@\S+\n\s+with:\n((?:\s{10,}\S.*\n)+)/g, USER_DOCS)) {
    for (const input of matches(/^\s+([a-z-]+):/gm, block)) used.add(input);
  }

  assert.ok(used.size > 0, "the docs show no `uses: ...roadmap-skill@...` step with inputs");
  assert.deepEqual(unknown(used, inputs), [], "the docs use Action inputs that action.yml lacks");
});

test("the rule-tags note points at the rule table", () => {
  contains(doc("rule-tags.md"), "references/conventions.md");
});

test("every rule tag is explained in the docs", () => {
  const tags = doc("rule-tags.md");
  for (const tag of Object.keys(RULES)) {
    assert.equal(tags.includes(`\`[${tag}]\``), true, `docs/rule-tags.md does not explain [${tag}]`);
  }
});

test("every slash command the README advertises is handled by the skill", () => {
  const advertised = new Set(matches(/^\| `\/roadmap ([a-z]+)/gm, section("Slash commands")));
  const handled = new Set(matches(/^\| `([a-z]+)[` ]/gm, read("SKILL.md")));

  assert.ok(advertised.size > 0, "README.md's slash-command table is empty or the regex is out of date");
  assert.deepEqual(unknown(advertised, handled), [], "SKILL.md does not say what to do for these");
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
    assert.deepEqual(text.match(/npx roadmap\b/g) ?? [], [], `${name} has a bare \`npx roadmap\``);
  }
});

test("the docs tell users to make the skill a visible requirement", () => {
  for (const [name, install] of Object.entries({
    "README.md": section("Quick start"),
    "docs/install.md": doc("install.md"),
  })) {
    contains(install, "CLAUDE.md", name);
    contains(
      install,
      "If the skill isn't available",
      `${name}: the CLAUDE.md snippet must say what to do without the skill`,
    );
  }
});

test("the README links every note in the vault", () => {
  const linked = new Set(matches(/\]\(docs\/([^)#]+\.md)/g, README));

  assert.deepEqual(unknown(new Set(DOC_NAMES), linked), [], "README.md does not link these notes");
});

test("every relative link in the docs resolves", () => {
  // Markdown links only: GitHub doesn't render Obsidian [[wikilinks]].
  for (const [name, text] of Object.entries(PAGES)) {
    const prose = text.replace(/```[\s\S]*?```/g, "");
    assert.equal(prose.includes("[["), false, `${name} uses a [[wikilink]]; use a Markdown link`);
    for (const target of matches(/\]\(([^)\s]+)\)/g, prose)) {
      if (/^[a-z]+:/.test(target) || target.startsWith("#")) continue;
      const path = join(REPO, dirname(name), target.split("#")[0] as string);
      assert.equal(existsSync(path), true, `${name} links ${target}, which doesn't exist`);
    }
  }
});

test("the CHANGELOG has an entry for the current version", () => {
  const entry = new RegExp(`^## ${literal(VERSION)} — \\d{4}-\\d{2}-\\d{2}$`, "m");

  assert.equal(entry.test(read("CHANGELOG.md")), true, `CHANGELOG.md has no '## ${VERSION} — <date>' entry`);
});
