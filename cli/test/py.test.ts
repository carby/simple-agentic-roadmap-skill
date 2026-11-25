// The Python behaviours the port reproduces. Each expected value was printed
// by CPython 3.12, so these hold the helpers to the real thing.

import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { parse as parseToml } from "smol-toml";
import { opcodes } from "../src/git.ts";
import { Day, Float, fromToml, isDict, jsonDumps, repr, splitlines, str, unquote } from "../src/py.ts";
import { each } from "./helpers.ts";

describe("repr", () => {
  each([
    ["it's", `"it's"`],
    ['say "hi"', `'say "hi"'`],
    [`both ' and "`, `'both \\' and "'`],
    ["tab\there", "'tab\\there'"],
    ["é", "'é'"],
    ["\x00", "'\\x00'"],
    [" ", "'\\u2028'"],
    ["back\\slash", "'back\\\\slash'"],
    ["😀", "'😀'"],
  ])("of the string %j", (value, expected) => {
    assert.equal(repr(value), expected);
  });

  each([
    [1.0, "1.0"],
    [1.5, "1.5"],
    [1e16, "1e+16"],
    [0.0001, "0.0001"],
    [1e-5, "1e-05"],
    [-0.0, "-0.0"],
    [123456789012345.0, "123456789012345.0"],
  ])("of the float %d", (value, expected) => {
    assert.equal(repr(new Float(value)), expected);
  });

  test("of a date, a list and a dict", () => {
    assert.equal(repr(new Day(2026, 9, 6)), "datetime.date(2026, 9, 6)");
    assert.equal(repr([1, "a", true, null]), "[1, 'a', True, None]");
    assert.equal(repr({ a: 1 }), "{'a': 1}");
  });
});

test("str of a date is ISO, of anything else its repr", () => {
  assert.equal(str(new Day(2026, 9, 6)), "2026-09-06");
  assert.equal(str("plain"), "plain");
  assert.equal(str(undefined), "None");
  assert.equal(str(true), "True");
});

test("json.dumps with indent=2 escapes non-ASCII", () => {
  const value = [{ path: "x", t: "é😀", d: new Day(2026, 9, 6), n: [], o: {} }];
  assert.equal(
    jsonDumps(value),
    '[\n  {\n    "path": "x",\n    "t": "\\u00e9\\ud83d\\ude00",\n    "d": "2026-09-06",\n    "n": [],\n    "o": {}\n  }\n]',
  );
});

test("splitlines breaks on every line boundary Python knows", () => {
  assert.deepEqual(splitlines("a\nb\rc\x0bd\x0ce\x1cf g"), ["a", "b", "c", "d", "e", "f", "g"]);
  assert.deepEqual(splitlines("a\nb\n", true), ["a\n", "b\n"]);
});

test("unquote leaves malformed escapes alone", () => {
  assert.equal(unquote("a%20b%C3%A9%zz%"), "a bé%zz%");
});

test("Day parses only real ISO dates", () => {
  assert.equal(String(Day.fromIso("2026-09-06")), "2026-09-06");
  assert.equal(String(Day.fromIso("20260906")), "2026-09-06");
  assert.equal(Day.fromIso("2026-02-30"), null);
  assert.equal(Day.fromIso("2026-0906"), null);
  assert.equal((Day.fromIso("2026-03-01") as Day).ordinal - (Day.fromIso("2026-02-28") as Day).ordinal, 1);
});

describe("opcodes matches difflib.SequenceMatcher", () => {
  test("an edit with a deletion and insertions", () => {
    assert.deepEqual(opcodes(["x", "y", "z", "q"], ["x", "z", "new", "q", "tail"]), [
      ["equal", 0, 1, 0, 1],
      ["delete", 1, 2, 1, 1],
      ["equal", 2, 3, 1, 2],
      ["insert", 3, 3, 2, 3],
      ["equal", 3, 4, 3, 4],
      ["insert", 4, 4, 4, 5],
    ]);
  });

  test("repeated lines, where the longest match decides", () => {
    assert.deepEqual(opcodes(["a", "b", "a", "b", "c"], ["b", "a", "c", "a", "b"]), [
      ["insert", 0, 0, 0, 3],
      ["equal", 0, 2, 3, 5],
      ["delete", 2, 5, 5, 5],
    ]);
  });
});

test("a TOML table is a dict, whatever prototype the parser gives it", () => {
  // smol-toml 1.9 returns tables with a null prototype; 1.6 returned plain objects.
  const parsed = parseToml('[refs]\nspecs = "specs/{}"\n[milestones]\nbeta = { title = "B", date = 2026-12-01 }\n');

  assert.equal(isDict(parsed.refs), true);
  assert.equal(isDict(Object.create(null)), true);
  assert.equal(isDict({}), true);
  for (const value of [null, [], "x", 1, new Day(2026, 1, 1), new Float(1.5)]) assert.equal(isDict(value), false);
  assert.deepEqual(fromToml(parsed), {
    refs: { specs: "specs/{}" },
    milestones: { beta: { title: "B", date: new Day(2026, 12, 1) } },
  });
});
