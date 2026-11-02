// The generated blocks: what they render, their order, and how they are
// spliced into README.md and done.md.

import { join } from "node:path";
import { describe, expect, test } from "vitest";
import { check } from "../src/commands.ts";
import { DONE_BEGIN, DONE_END, INDEX_BEGIN, INDEX_END, load, openRoadmap, UsageError } from "../src/model.ts";
import { len, readText } from "../src/py.ts";
import { renderDone, renderGraph, renderIndex, short, splice } from "../src/render.ts";
import { closedMeta, D, FIXTURES, itemText, makeRoadmap, openMeta, tempDir } from "./helpers.ts";

const strings = (problems: { toString(): string }[]) => problems.map(String);

test("the committed fixture is what the renderer produces", () => {
  // The fixture's README.md and done.md are the golden files. To regenerate
  // them, run `node bin/roadmap.js index --dir test/fixtures/valid/roadmap`.
  const rm = openRoadmap(join(FIXTURES, "valid", "roadmap"));
  const [items, archived] = load(rm);
  const block = (text: string, begin: string, end: string) =>
    text.slice(text.indexOf(begin), text.indexOf(end) + end.length);

  expect(renderIndex(items, archived, rm.milestones)).toBe(block(readText(rm.readme), INDEX_BEGIN, INDEX_END));
  expect(renderDone(archived, items, rm.milestones)).toBe(block(readText(rm.done), DONE_BEGIN, DONE_END));
  expect(strings(check(rm))).toEqual([]);
});

test("empty blocks say so", () => {
  expect(renderDone([])).toContain("*Empty.*");
  expect(renderIndex([]).split("*Empty.*").length - 1).toBe(3);
  expect(renderIndex([])).not.toContain("mermaid");
});

test("index orders by bucket then rank and shows the note", () => {
  const rm = makeRoadmap(tempDir(), {
    "items/b.md": itemText(openMeta({ id: "b", title: "B", rank: 2, gate: "fast enough" })),
    "items/a.md": itemText(openMeta({ id: "a", title: "A", bucket: "later", blocked_on: "a call" })),
    "items/c.md": itemText(openMeta({ id: "c", title: "C", rank: 1 })),
  });
  const [items] = load(rm);

  const block = renderIndex(items);

  expect(block.indexOf("[C]")).toBeLessThan(block.indexOf("[B]"));
  expect(block.indexOf("[B]")).toBeLessThan(block.indexOf("[A]"));
  expect(block).toContain("**Gate:** fast enough");
  expect(block).toContain("**Blocked on:** a call");
});

test("done is newest first and grouped by month", () => {
  const rm = makeRoadmap(tempDir(), {
    "archive/old.md": itemText(closedMeta({ id: "old", title: "Old", closed: D(2026, 7, 1) })),
    "archive/new.md": itemText(closedMeta({ id: "new", title: "New", closed: D(2026, 9, 20), shipped_as: "pr-9" })),
    "archive/mid.md": itemText(closedMeta({ id: "mid", title: "Mid", closed: D(2026, 9, 2), outcome: "declined" })),
  });
  const [, archived] = load(rm);

  const block = renderDone(archived);

  const order = ["### 2026-09 (2)", "[New]", "[Mid]", "### 2026-07 (1)"].map((s) => block.indexOf(s));
  expect(order).toEqual([...order].sort((a, b) => a - b));
  expect(order).not.toContain(-1);
  expect(block).toContain("- **shipped** [New](archive/new.md) — closed 2026-09-20 as `pr-9`");
  expect(block).toContain("- **declined** [Mid](archive/mid.md) — closed 2026-09-02");
});

test("done lists the milestones the archive names", () => {
  const rm = makeRoadmap(tempDir(), {
    "roadmap.toml":
      '[milestones]\nalpha = { title = "Alpha", date = 2026-08-01 }\n' +
      'beta = { title = "Beta", date = 2026-09-01 }\nunused = { title = "Unused", date = 2026-10-01 }\n',
    "archive/a.md": itemText(closedMeta({ id: "a", title: "A", milestone: "alpha" })),
    "archive/b.md": itemText(closedMeta({ id: "b", title: "B", milestone: "beta" })),
    "archive/c.md": itemText(closedMeta({ id: "c", title: "C", milestone: "beta", outcome: "declined" })),
    "archive/d.md": itemText(closedMeta({ id: "d", title: "D", milestone: "gone" })),
    "archive/e.md": itemText(closedMeta({ id: "e", title: "E" })),
  });
  const [, archived] = load(rm);

  const block = renderDone(archived, [], rm.milestones);

  expect(block).toContain("### Milestones (3)");
  const order = [
    "- **Beta** — 2026-09-01: 1 shipped, 1 declined",
    "- **Alpha** — 2026-08-01: 1 shipped",
    "- **gone**: 1 shipped",
    "### 2026-09",
  ].map((s) => block.indexOf(s));
  expect(order).not.toContain(-1);
  expect(order).toEqual([...order].sort((a, b) => a - b));
  expect(block).not.toContain("Unused");
  expect(block).toContain("- **shipped** [A](archive/a.md) — closed 2026-09-10 — for Alpha (2026-08-01)");
  expect(block).toContain("- **shipped** [D](archive/d.md) — closed 2026-09-10 — for gone");
  expect(block).toContain("- **shipped** [E](archive/e.md) — closed 2026-09-10\n");
  expect(strings(check(rm))).toEqual([]);
});

test("done without milestones renders as before", () => {
  const rm = makeRoadmap(tempDir(), { "archive/a.md": itemText(closedMeta({ id: "a", title: "A" })) });
  const [, archived] = load(rm);

  expect(renderDone(archived, [], rm.milestones)).toBe(renderDone(archived));
  expect(renderDone(archived)).not.toContain("Milestones");
});

test("a retry links to the declined item both ways", () => {
  const rm = makeRoadmap(tempDir(), {
    "archive/old.md": itemText(closedMeta({ id: "old", title: "Old", outcome: "declined" })),
    "items/retry.md": itemText(openMeta({ id: "retry", title: "Retry", supersedes: "old" })),
  });
  const [items, archived] = load(rm);

  expect(renderIndex(items, archived)).toContain("**Supersedes:** [Old](archive/old.md) (declined)");
  expect(renderDone(archived, items)).toContain("closed 2026-09-10 — superseded by [Retry](items/retry.md)");
  expect(strings(check(rm))).toEqual([]);
});

test("splice keeps the prose around the block", () => {
  const text = `before\n${INDEX_BEGIN}\nold\n${INDEX_END}\nafter\n`;

  expect(splice(text, INDEX_BEGIN, INDEX_END, "NEW", "README.md")).toBe("before\nNEW\nafter\n");
});

test("splice accepts an older marker wording", () => {
  // snakestream's marker names a different script. Adopting the skill should
  // need an `index` run, not a hand edit.
  const text =
    "<!-- BEGIN INDEX: generated by tools/roadmap_index.py; edit roadmap/items/*.md instead -->\n" +
    "x\n" +
    "<!-- END INDEX -->";

  expect(splice(text, INDEX_BEGIN, INDEX_END, "NEW", "README.md")).toBe("NEW");
});

test("splice refuses a file without markers", () => {
  const attempt = () => splice("# Roadmap\n", INDEX_BEGIN, INDEX_END, "NEW", "README.md");
  expect(attempt).toThrow(UsageError);
  expect(attempt).toThrow("markers not found");
});

test("index names dependencies open, closed and unknown", () => {
  const rm = makeRoadmap(tempDir(), {
    "items/a.md": itemText(openMeta({ id: "a", title: "A" })),
    "items/b.md": itemText(openMeta({ id: "b", title: "B", rank: 2, gate: "fast", depends_on: ["a", "old", "gone"] })),
    "archive/old.md": itemText(closedMeta({ id: "old", title: "Old" })),
  });
  const [items, archived] = load(rm);

  expect(renderIndex(items, archived)).toContain(
    "2. [B](items/b.md) — filed 2026-09-06<br>  **Gate:** fast" +
      "<br>  **Depends on:** [A](items/a.md), [Old](archive/old.md) (shipped), gone",
  );
});

test("the graph boxes buckets in order and draws open dependencies", () => {
  const rm = makeRoadmap(tempDir(), {
    "items/a.md": itemText(openMeta({ id: "a", title: "A" })),
    "items/end.md": itemText(openMeta({ id: "end", title: "End", bucket: "next", depends_on: ["a", "old"] })),
    "items/z-z.md": itemText(
      openMeta({ id: "z-z", title: "Z", bucket: "later", depends_on: ["end"], blocked_on: "x" }),
    ),
    "archive/old.md": itemText(closedMeta({ id: "old", title: "Old" })),
  });
  const [items, archived] = load(rm);

  const block = renderIndex(items, archived);

  expect(block.indexOf("```mermaid")).toBeLessThan(block.indexOf("### Now"));
  expect(block.indexOf("```mermaid")).not.toBe(-1);
  expect(renderGraph(items)).toEqual([
    "```mermaid",
    "flowchart LR",
    '  subgraph b_now ["Now"]',
    '    i_a["1 · A"]',
    "  end",
    '  subgraph b_next ["Next"]',
    '    i_end["1 · End"]',
    "  end",
    '  subgraph b_later ["Later"]',
    '    i_z_z["1 · Z"]',
    "  end",
    "  b_now ~~~ b_next ~~~ b_later",
    "  i_a --> i_end",
    "  i_end --> i_z_z",
    "  classDef ready stroke-width: 3px",
    "  class i_a ready",
    "  classDef later stroke-dasharray: 5 5",
    "  class i_z_z later",
    "```",
  ]);
});

test("an item waiting only on shipped work is ready", () => {
  const rm = makeRoadmap(tempDir(), {
    "items/a.md": itemText(openMeta({ id: "a" })),
    "items/b.md": itemText(openMeta({ id: "b", rank: 2, depends_on: ["a"] })),
    "items/c.md": itemText(openMeta({ id: "c", rank: 3, depends_on: ["old"] })),
    "archive/old.md": itemText(closedMeta({ id: "old" })),
  });
  const [items] = load(rm);

  expect(renderGraph(items)).toContain("  class i_a,i_c ready");
});

describe("long titles are shortened at a word break", () => {
  test.each([
    ["Short enough", "Short enough"],
    ["Evals for how an agent uses the skill, not just for the script", "Evals for how an agent uses the skill…"],
    ["x".repeat(50), `${"x".repeat(39)}…`],
  ])("%s", (title, shortened) => {
    expect(short(title)).toBe(shortened);
    expect(len(short(title))).toBeLessThanOrEqual(40);
  });
});

test("the graph leaves out a chart with no arrows", () => {
  const rm = makeRoadmap(tempDir(), {
    "items/a.md": itemText(openMeta({ id: "a", title: "A" })),
    "items/b.md": itemText(openMeta({ id: "b", title: "B", bucket: "next" })),
  });
  const [items, archived] = load(rm);

  const block = renderIndex(items, archived);

  expect(renderGraph(items)).toEqual([]);
  expect(block).not.toContain("```mermaid");
  expect(block).toContain("*No open item depends on another or on a milestone, so there is no chart.*");
  expect(strings(check(rm))).toEqual([]);
});

test("the graph escapes titles", () => {
  const rm = makeRoadmap(tempDir(), {
    "items/a.md": itemText(openMeta({ id: "a", title: 'Fix #12: "<b>" in `x`' })),
    "items/b.md": itemText(openMeta({ id: "b", rank: 2, depends_on: ["a"] })),
  });
  const [items] = load(rm);

  expect(renderGraph(items)).toContain('    i_a["1 · Fix #35;12: #quot;#lt;b#gt;#quot; in #96;x#96;"]');
});

const MILESTONES =
  '[milestones]\nbeta = { title = "Public beta", date = 2026-12-01 }\nunused = { title = "U", date = 2027-01-01 }\n';

test("the index names the milestones an item is due for and waits on", () => {
  const rm = makeRoadmap(tempDir(), {
    "roadmap.toml": MILESTONES,
    "items/a.md": itemText(openMeta({ id: "a", title: "A", milestone: "beta" })),
    "items/b.md": itemText(openMeta({ id: "b", title: "B", bucket: "next", depends_on: ["beta", "a"] })),
  });
  const [items, archived] = load(rm);

  const block = renderIndex(items, archived, rm.milestones);

  expect(block).toContain("1. [A](items/a.md) — filed 2026-09-06<br>  **Due for:** Public beta (2026-12-01)");
  expect(block).toContain("**Depends on:** Public beta (2026-12-01), [A](items/a.md)");
  expect(strings(check(rm))).toEqual([]);
});

test("the graph draws the milestones open items name as hexagons", () => {
  const rm = makeRoadmap(tempDir(), {
    "roadmap.toml": MILESTONES,
    "items/a.md": itemText(openMeta({ id: "a", title: "A", milestone: "beta" })),
    "items/b.md": itemText(openMeta({ id: "b", title: "B", bucket: "next", depends_on: ["beta"] })),
  });
  const [items] = load(rm);

  const graph = renderGraph(items, rm.milestones);

  expect(graph.slice(-6)).toEqual([
    '  m_beta{{"Public beta (2026-12-01)"}}',
    "  i_a --> m_beta",
    "  m_beta --> i_b",
    "  classDef ready stroke-width: 3px",
    "  class i_a ready", // b waits on the milestone, so it is not ready
    "```",
  ]);
  expect(graph.some((line) => line.includes("m_unused"))).toBe(false);
});
