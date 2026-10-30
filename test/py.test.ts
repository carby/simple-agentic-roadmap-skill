// The Python behaviours the port reproduces. Each expected value was printed
// by CPython 3.12, so these hold the helpers to the real thing.

import { describe, expect, test } from "vitest";
import { opcodes } from "../src/git.ts";
import { Day, Float, jsonDumps, repr, splitlines, str, unquote } from "../src/py.ts";

describe("repr", () => {
  test.each([
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
    expect(repr(value)).toBe(expected);
  });

  test.each([
    [1.0, "1.0"],
    [1.5, "1.5"],
    [1e16, "1e+16"],
    [0.0001, "0.0001"],
    [1e-5, "1e-05"],
    [-0.0, "-0.0"],
    [123456789012345.0, "123456789012345.0"],
  ])("of the float %d", (value, expected) => {
    expect(repr(new Float(value))).toBe(expected);
  });

  test("of a date, a list and a dict", () => {
    expect(repr(new Day(2026, 9, 6))).toBe("datetime.date(2026, 9, 6)");
    expect(repr([1, "a", true, null])).toBe("[1, 'a', True, None]");
    expect(repr({ a: 1 })).toBe("{'a': 1}");
  });
});

test("str of a date is ISO, of anything else its repr", () => {
  expect(str(new Day(2026, 9, 6))).toBe("2026-09-06");
  expect(str("plain")).toBe("plain");
  expect(str(undefined)).toBe("None");
  expect(str(true)).toBe("True");
});

test("json.dumps with indent=2 escapes non-ASCII", () => {
  const value = [{ path: "x", t: "é😀", d: new Day(2026, 9, 6), n: [], o: {} }];
  expect(jsonDumps(value)).toBe(
    '[\n  {\n    "path": "x",\n    "t": "\\u00e9\\ud83d\\ude00",\n    "d": "2026-09-06",\n    "n": [],\n    "o": {}\n  }\n]',
  );
});

test("splitlines breaks on every line boundary Python knows", () => {
  expect(splitlines("a\nb\rc\x0bd\x0ce\x1cf g")).toEqual(["a", "b", "c", "d", "e", "f", "g"]);
  expect(splitlines("a\nb\n", true)).toEqual(["a\n", "b\n"]);
});

test("unquote leaves malformed escapes alone", () => {
  expect(unquote("a%20b%C3%A9%zz%")).toBe("a bé%zz%");
});

test("Day parses only real ISO dates", () => {
  expect(String(Day.fromIso("2026-09-06"))).toBe("2026-09-06");
  expect(String(Day.fromIso("20260906"))).toBe("2026-09-06");
  expect(Day.fromIso("2026-02-30")).toBeNull();
  expect(Day.fromIso("2026-0906")).toBeNull();
  expect((Day.fromIso("2026-03-01") as Day).ordinal - (Day.fromIso("2026-02-28") as Day).ordinal).toBe(1);
});

describe("opcodes matches difflib.SequenceMatcher", () => {
  test("an edit with a deletion and insertions", () => {
    expect(opcodes(["x", "y", "z", "q"], ["x", "z", "new", "q", "tail"])).toEqual([
      ["equal", 0, 1, 0, 1],
      ["delete", 1, 2, 1, 1],
      ["equal", 2, 3, 1, 2],
      ["insert", 3, 3, 2, 3],
      ["equal", 3, 4, 3, 4],
      ["insert", 4, 4, 4, 5],
    ]);
  });

  test("repeated lines, where the longest match decides", () => {
    expect(opcodes(["a", "b", "a", "b", "c"], ["b", "a", "c", "a", "b"])).toEqual([
      ["insert", 0, 0, 0, 3],
      ["equal", 0, 2, 3, 5],
      ["delete", 2, 5, 5, 5],
    ]);
  });
});
