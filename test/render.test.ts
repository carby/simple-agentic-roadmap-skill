// The generated blocks: what they render, their order, and how they are
// spliced into README.md and done.md.

import assert from "node:assert/strict";
import { join } from "node:path";
import { describe, test } from "node:test";
import { check } from "../src/commands.ts";
import { DONE_BEGIN, DONE_END, INDEX_BEGIN, INDEX_END, load, openRoadmap, UsageError } from "../src/model.ts";
import { len, readText } from "../src/py.ts";
import { renderDone, renderGraph, renderIndex, renderTimeline, short, splice } from "../src/render.ts";
import {
  closedMeta,
  contains,
  D,
  each,
  excludes,
  FIXTURES,
  itemText,
  makeRoadmap,
  openMeta,
  tempDir,
  throwsWith,
} from "./helpers.ts";

const strings = (problems: { toString(): string }[]) => problems.map(String);

test("the committed fixture is what the renderer produces", () => {
  // The fixture's README.md and done.md are the golden files. To regenerate
  // them, run `node bin/roadmap.js index --dir test/fixtures/valid/roadmap`.
  const rm = openRoadmap(join(FIXTURES, "valid", "roadmap"));
  const [items, archived] = load(rm);
  const block = (text: string, begin: string, end: string) =>
    text.slice(text.indexOf(begin), text.indexOf(end) + end.length);

  assert.equal(renderIndex(items, archived, rm.milestones), block(readText(rm.readme), INDEX_BEGIN, INDEX_END));
  assert.equal(renderDone(archived, items, rm.milestones), block(readText(rm.done), DONE_BEGIN, DONE_END));
  assert.deepEqual(strings(check(rm)), []);
});

test("empty blocks say so", () => {
  contains(renderDone([]), "*Empty.*");
  assert.equal(renderIndex([]).split("*Empty.*").length - 1, 3);
  excludes(renderIndex([]), "mermaid");
});

test("index orders by bucket then rank and shows the note", () => {
  const rm = makeRoadmap(tempDir(), {
    "items/b.md": itemText(openMeta({ id: "b", title: "B", rank: 2, gate: "fast enough" })),
    "items/a.md": itemText(openMeta({ id: "a", title: "A", bucket: "later", blocked_on: "a call" })),
    "items/c.md": itemText(openMeta({ id: "c", title: "C", rank: 1 })),
  });
  const [items] = load(rm);

  const block = renderIndex(items);

  assert.ok(block.indexOf("[C]") < block.indexOf("[B]"), `${block.indexOf("[C]")} < ${block.indexOf("[B]")}`);
  assert.ok(block.indexOf("[B]") < block.indexOf("[A]"), `${block.indexOf("[B]")} < ${block.indexOf("[A]")}`);
  contains(block, "**Gate:** fast enough");
  contains(block, "**Blocked on:** a call");
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
  assert.deepEqual(
    order,
    [...order].sort((a, b) => a - b),
  );
  excludes(order, -1);
  contains(block, "- **shipped** [New](archive/new.md) — closed 2026-09-20 as `pr-9`");
  contains(block, "- **declined** [Mid](archive/mid.md) — closed 2026-09-02");
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

  contains(block, "### Milestones (3)");
  const order = [
    "- **Beta** — 2026-09-01: 1 shipped, 1 declined",
    "- **Alpha** — 2026-08-01: 1 shipped",
    "- **gone**: 1 shipped",
    "### 2026-09",
  ].map((s) => block.indexOf(s));
  excludes(order, -1);
  assert.deepEqual(
    order,
    [...order].sort((a, b) => a - b),
  );
  excludes(block, "Unused");
  contains(block, "- **shipped** [A](archive/a.md) — closed 2026-09-10 — for Alpha (2026-08-01)");
  contains(block, "- **shipped** [D](archive/d.md) — closed 2026-09-10 — for gone");
  contains(block, "- **shipped** [E](archive/e.md) — closed 2026-09-10\n");
  assert.deepEqual(strings(check(rm)), []);
});

test("done without milestones renders as before", () => {
  const rm = makeRoadmap(tempDir(), { "archive/a.md": itemText(closedMeta({ id: "a", title: "A" })) });
  const [, archived] = load(rm);

  assert.equal(renderDone(archived, [], rm.milestones), renderDone(archived));
  excludes(renderDone(archived), "Milestones");
});

test("a retry links to the declined item both ways", () => {
  const rm = makeRoadmap(tempDir(), {
    "archive/old.md": itemText(closedMeta({ id: "old", title: "Old", outcome: "declined" })),
    "items/retry.md": itemText(openMeta({ id: "retry", title: "Retry", supersedes: "old" })),
  });
  const [items, archived] = load(rm);

  contains(renderIndex(items, archived), "**Supersedes:** [Old](archive/old.md) (declined)");
  contains(renderDone(archived, items), "closed 2026-09-10 — superseded by [Retry](items/retry.md)");
  assert.deepEqual(strings(check(rm)), []);
});

test("splice keeps the prose around the block", () => {
  const text = `before\n${INDEX_BEGIN}\nold\n${INDEX_END}\nafter\n`;

  assert.equal(splice(text, INDEX_BEGIN, INDEX_END, "NEW", "README.md"), "before\nNEW\nafter\n");
});

test("splice accepts an older marker wording", () => {
  // snakestream's marker names a different script. Adopting the skill should
  // need an `index` run, not a hand edit.
  const text =
    "<!-- BEGIN INDEX: generated by tools/roadmap_index.py; edit roadmap/items/*.md instead -->\n" +
    "x\n" +
    "<!-- END INDEX -->";

  assert.equal(splice(text, INDEX_BEGIN, INDEX_END, "NEW", "README.md"), "NEW");
});

test("splice refuses a file without markers", () => {
  throwsWith(() => splice("# Roadmap\n", INDEX_BEGIN, INDEX_END, "NEW", "README.md"), UsageError, "markers not found");
});

test("index names dependencies open, closed and unknown", () => {
  const rm = makeRoadmap(tempDir(), {
    "items/a.md": itemText(openMeta({ id: "a", title: "A" })),
    "items/b.md": itemText(openMeta({ id: "b", title: "B", rank: 2, gate: "fast", depends_on: ["a", "old", "gone"] })),
    "archive/old.md": itemText(closedMeta({ id: "old", title: "Old" })),
  });
  const [items, archived] = load(rm);

  contains(
    renderIndex(items, archived),
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

  assert.ok(
    block.indexOf("```mermaid") < block.indexOf("### Now"),
    `${block.indexOf("```mermaid")} < ${block.indexOf("### Now")}`,
  );
  assert.notEqual(block.indexOf("```mermaid"), -1);
  assert.deepEqual(renderGraph(items), [
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

  contains(renderGraph(items), "  class i_a,i_c ready");
});

describe("long titles are shortened at a word break", () => {
  each([
    ["Short enough", "Short enough"],
    ["Evals for how an agent uses the skill, not just for the script", "Evals for how an agent uses the skill…"],
    ["x".repeat(50), `${"x".repeat(39)}…`],
  ])("%s", (title, shortened) => {
    assert.equal(short(title), shortened);
    assert.ok(len(short(title)) <= 40, `${len(short(title))} <= ${40}`);
  });
});

test("the graph leaves out a chart with no arrows", () => {
  const rm = makeRoadmap(tempDir(), {
    "items/a.md": itemText(openMeta({ id: "a", title: "A" })),
    "items/b.md": itemText(openMeta({ id: "b", title: "B", bucket: "next" })),
  });
  const [items, archived] = load(rm);

  const block = renderIndex(items, archived);

  assert.deepEqual(renderGraph(items), []);
  excludes(block, "```mermaid");
  contains(block, "*No open item depends on another or on a milestone, so there is no chart.*");
  assert.deepEqual(strings(check(rm)), []);
});

test("the graph escapes titles", () => {
  const rm = makeRoadmap(tempDir(), {
    "items/a.md": itemText(openMeta({ id: "a", title: 'Fix #12: "<b>" in `x`' })),
    "items/b.md": itemText(openMeta({ id: "b", rank: 2, depends_on: ["a"] })),
  });
  const [items] = load(rm);

  contains(renderGraph(items), '    i_a["1 · Fix #35;12: #quot;#lt;b#gt;#quot; in #96;x#96;"]');
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

  contains(block, "1. [A](items/a.md) — filed 2026-09-06<br>  **Due for:** Public beta (2026-12-01)");
  contains(block, "**Depends on:** Public beta (2026-12-01), [A](items/a.md)");
  assert.deepEqual(strings(check(rm)), []);
});

test("the graph draws the milestones open items name as hexagons", () => {
  const rm = makeRoadmap(tempDir(), {
    "roadmap.toml": MILESTONES,
    "items/a.md": itemText(openMeta({ id: "a", title: "A", milestone: "beta" })),
    "items/b.md": itemText(openMeta({ id: "b", title: "B", bucket: "next", depends_on: ["beta"] })),
  });
  const [items] = load(rm);

  const graph = renderGraph(items, rm.milestones);

  assert.deepEqual(graph.slice(-6), [
    '  m_beta{{"Public beta (2026-12-01)"}}',
    "  i_a --> m_beta",
    "  m_beta --> i_b",
    "  classDef ready stroke-width: 3px",
    "  class i_a ready", // b waits on the milestone, so it is not ready
    "```",
  ]);
  assert.equal(
    graph.some((line) => line.includes("m_unused")),
    false,
  );
});

const TIMELINE =
  "[milestones]\n" +
  'beta = { title = "Public beta", date = 2026-12-01 }\n' +
  'alpha = { title = "Alpha", date = 2026-08-01 }\n' +
  'unused = { title = "U", date = 2027-01-01 }\n';

test("the timeline marks every declared milestone in date order", () => {
  const rm = makeRoadmap(tempDir(), {
    "roadmap.toml": TIMELINE,
    "items/a.md": itemText(openMeta({ id: "a", title: "A", milestone: "beta" })),
  });
  const [items, archived] = load(rm);

  const timeline = renderTimeline(items, archived, rm.milestones);

  assert.deepEqual(timeline.slice(0, 9), [
    "### Milestones (3)",
    "",
    "```mermaid",
    "gantt",
    "  dateFormat YYYY-MM-DD",
    "  axisFormat %Y-%m",
    "  Alpha : milestone, m_alpha, 2026-08-01, 0d", // passed or not, every declared one is drawn
    "  Public beta : milestone, m_beta, 2026-12-01, 0d",
    "  U : milestone, m_unused, 2027-01-01, 0d", // no item names it
  ]);
  contains(renderIndex(items, archived, rm.milestones), timeline.join("\n"));
  assert.deepEqual(strings(check(rm)), []);
});

test("the timeline lists the open items due for each milestone, and the closed ones", () => {
  const rm = makeRoadmap(tempDir(), {
    "roadmap.toml": TIMELINE,
    "items/a.md": itemText(openMeta({ id: "a", title: "A", bucket: "next", milestone: "beta" })),
    "items/b.md": itemText(openMeta({ id: "b", title: "B", milestone: "beta" })),
    "items/c.md": itemText(openMeta({ id: "c", title: "C", bucket: "next", rank: 2, depends_on: ["beta"] })),
    "archive/d.md": itemText(closedMeta({ id: "d", title: "D", milestone: "alpha" })),
    "archive/e.md": itemText(closedMeta({ id: "e", title: "E", milestone: "beta", outcome: "declined" })),
  });
  const [items, archived] = load(rm);

  const timeline = renderTimeline(items, archived, rm.milestones);

  assert.deepEqual(
    timeline.filter((line) => line.startsWith("- ")),
    [
      "- **Alpha** (`alpha`) — 2026-08-01: nothing open; 1 closed in [done.md](done.md)",
      // index order, Now before Next; c only waits on beta, so it is left out
      "- **Public beta** (`beta`) — 2026-12-01: open [B](items/b.md), [A](items/a.md); 1 closed in [done.md](done.md)",
      "- **U** (`unused`) — 2027-01-01: nothing open",
    ],
  );
  assert.deepEqual(strings(check(rm)), []);
});

test("the timeline leaves out a chart whose milestones share one date", () => {
  const rm = makeRoadmap(tempDir(), { "roadmap.toml": MILESTONES.split("unused")[0] ?? "" });
  const [items, archived] = load(rm);

  assert.deepEqual(renderTimeline(items, archived, rm.milestones), [
    "### Milestones (1)",
    "",
    "- **Public beta** (`beta`) — 2026-12-01: nothing open",
    "",
  ]);
});

test("without milestones there is no timeline", () => {
  const rm = makeRoadmap(tempDir(), { "items/a.md": itemText(openMeta({ id: "a", title: "A" })) });
  const [items, archived] = load(rm);

  assert.deepEqual(renderTimeline(items, archived, rm.milestones), []);
  excludes(renderIndex(items, archived, rm.milestones), "### Milestones");
});

test("a milestone title cannot break the gantt", () => {
  const rm = makeRoadmap(tempDir(), {
    "roadmap.toml":
      "[milestones]\n" +
      'v1 = { title = "v1: #1 launch; done", date = 2026-08-01 }\n' +
      'cfp = { title = "Call for papers", date = 2026-09-01 }\n' +
      'pct = { title = "5% rollout", date = 2026-10-01 }\n' +
      'sec = { title = "Section 2", date = 2026-11-01 }\n',
  });
  const [items, archived] = load(rm);

  const gantt = renderTimeline(items, archived, rm.milestones).filter((line) => line.includes(": milestone,"));

  assert.deepEqual(gantt, [
    "  v1∶ #1 launch; done : milestone, m_v1, 2026-08-01, 0d", // only a colon ends a task's name
    "  “Call for papers” : milestone, m_cfp, 2026-09-01, 0d",
    "  “5% rollout” : milestone, m_pct, 2026-10-01, 0d",
    "  “Section 2” : milestone, m_sec, 2026-11-01, 0d",
  ]);
});
