// The port as a whole. Its behaviour is specified by the Python suite, which
// runs against the built bin with ROADMAP_IMPL=ts; these cover what that
// can't reach: the golden fixture rendered in-process, and the command list.

import { expect, test } from "vitest";
import { COMMANDS } from "../src/cli.ts";
import { check } from "../src/commands.ts";
import { DONE_BEGIN, DONE_END, INDEX_BEGIN, INDEX_END, load, openRoadmap } from "../src/model.ts";
import { readText } from "../src/py.ts";
import { renderDone, renderIndex, short } from "../src/render.ts";

const VALID = "tests/fixtures/valid/roadmap";

test("the committed fixture is what the port renders", () => {
  const rm = openRoadmap(VALID);
  const [items, archived] = load(rm);
  const block = (text: string, begin: string, end: string) =>
    text.slice(text.indexOf(begin), text.indexOf(end) + end.length);

  expect(renderIndex(items, archived, rm.milestones)).toBe(block(readText(rm.readme), INDEX_BEGIN, INDEX_END));
  expect(renderDone(archived, items, rm.milestones)).toBe(block(readText(rm.done), DONE_BEGIN, DONE_END));
  expect(check(rm).map(String)).toEqual([]);
});

test("this repo's own roadmap passes", () => {
  expect(check(openRoadmap("roadmap")).map(String)).toEqual([]);
});

test("every command but init and upgrade is ported", () => {
  expect(Object.keys(COMMANDS).sort()).toEqual(
    ["check", "close", "decide", "index", "list", "merge-driver", "move", "new", "review", "split"].sort(),
  );
});

test("a long title is shortened at a word break", () => {
  expect(short("Install and upgrade the skill through an npm package, like OpenSpec")).toBe(
    "Install and upgrade the skill through…",
  );
  expect(short("x".repeat(50))).toBe(`${"x".repeat(39)}…`);
});
