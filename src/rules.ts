/** Validation: every rule `check` enforces except `generated` and
 * `append-only`, plus the link scanner `close` reuses to move links. */

import { readdirSync } from "node:fs";
import {
  BUCKETS,
  type Bucket,
  CLOSED_OPTIONAL,
  CLOSED_REQUIRED,
  DATE_FIELDS,
  DONE_BEGIN,
  DONE_END,
  INDEX_BEGIN,
  INDEX_END,
  type Item,
  type Milestone,
  OPEN_OPTIONAL,
  OPEN_REQUIRED,
  OUTCOMES,
  Problem,
  QUEUE_FIELDS,
  type Roadmap,
  SLUG,
  STRING_FIELDS,
} from "./model.ts";
import { exists, isDir, join, lexists, normpath, parent, relpath, stem } from "./pathlib.ts";
import { cmp, Day, isDict, isInt, readText, repr, splitlines, str, truthy, unquote } from "./py.ts";
import { blockSpan } from "./render.ts";

/** Every rule except `generated` and `append-only`, as a list of problems.
 * An empty list is a clean roadmap. Problems are collected rather than
 * thrown, so one run reports all of them instead of just the first. */
export function validate(rm: Roadmap, items: Item[], archived: Item[]): Problem[] {
  const problems: Problem[] = [];
  const everything = [...items, ...archived];
  const byId = byIdOf(everything);
  for (const item of everything) {
    problems.push(
      ...schemaProblems(item),
      ...dateProblems(item),
      ...bodyProblems(item),
      ...refProblems(item, rm),
      ...dependsProblems(item, byId, rm.milestones),
    );
  }
  for (const item of items) {
    problems.push(
      ...supersedesProblems(item, byId),
      ...bucketProblems(item, byId, rm.milestones),
      ...rankProblems(item),
    );
  }
  problems.push(...collisionProblems(items), ...idProblems(everything, rm.milestones));
  return [...problems, ...linkProblems(rm, items)];
}

function sortedNames(names: Iterable<string>): string {
  return [...names].sort((a, b) => cmp([a], [b])).join(", ");
}

/** The fields themselves. Open and archived items have different schemas.
 * The id has to agree with the filename, so that a file can be found from its
 * index entry. */
function schemaProblems(item: Item): Problem[] {
  const [required, optional] = item.archived ? [CLOSED_REQUIRED, CLOSED_OPTIONAL] : [OPEN_REQUIRED, OPEN_OPTIONAL];
  const problems: string[] = [];
  const fields = new Set(Object.keys(item.meta));
  const missing = [...required].filter((f) => !fields.has(f));
  if (missing.length) problems.push(`missing required field(s) ${sortedNames(missing)}`);
  let unknown = [...fields].filter((f) => !required.has(f) && !optional.has(f));
  const queue = unknown.filter((f) => QUEUE_FIELDS.has(f));
  if (item.archived && queue.length) {
    problems.push(`queue field(s) ${sortedNames(queue)} belong to open items; an archived item has left the queue`);
    unknown = unknown.filter((f) => !QUEUE_FIELDS.has(f));
  }
  if (unknown.length) problems.push(`unknown field(s) ${sortedNames(unknown)}`);
  if ("id" in item.meta && item.meta.id !== stem(item.path)) {
    problems.push(`id ${repr(item.meta.id)} does not match its filename`);
  }
  if (!SLUG.test(stem(item.path))) {
    problems.push(
      `filename ${repr(stem(item.path))} is not a kebab-case slug (lowercase letters, digits, single hyphens)`,
    );
  }
  for (const name of STRING_FIELDS) {
    const value = item.meta[name];
    if (name in item.meta && !(typeof value === "string" && value.trim())) {
      problems.push(`${name} must be a non-empty string`);
    }
  }
  if (item.archived && "outcome" in item.meta && !(OUTCOMES as readonly unknown[]).includes(item.meta.outcome)) {
    problems.push(`outcome ${repr(item.meta.outcome)} is not one of ${OUTCOMES.join(", ")}`);
  }
  return problems.map((message) => new Problem(item.path, "schema", message));
}

/** The one entry criterion a field can carry. Later is for the undecided,
 * so a later item names the decision it is waiting on, and naming one
 * anywhere else contradicts the bucket. Depending on a later item counts as
 * naming it: the item waits on that item's decision. So does waiting on a
 * milestone that a later item is due for. Now and Next differ only in
 * priority. Now is the top of the list, like a planned sprint. Neither one
 * tracks who is working on what: an item leaves the roadmap when it is
 * closed in the same merge as its code. */
export function bucketProblems(item: Item, byId: Map<string, Item>, milestones: Map<string, Milestone>): Problem[] {
  if (!("bucket" in item.meta)) return [];
  if (!isBucket(item.bucket)) {
    return [new Problem(item.path, "bucket", `bucket ${repr(item.meta.bucket)} is not one of ${BUCKETS.join(", ")}`)];
  }
  const problems: string[] = [];
  const blocked = truthy(item.meta.blocked_on);
  if (item.bucket === "later" && !blocked && !waitsOnLater(item, byId, milestones)) {
    problems.push("a 'later' item must name what it is blocked_on, or depend on another 'later' item");
  }
  if (item.bucket !== "later" && blocked) {
    problems.push(`blocked_on belongs to a 'later' item; this one is ${repr(item.bucket)}`);
  }
  return problems.map((message) => new Problem(item.path, "bucket", message));
}

export function isBucket(bucket: string): bucket is Bucket {
  return (BUCKETS as readonly string[]).includes(bucket);
}

/** Items by id. Where an id is taken twice, the first wins; `ids` reports the rest. */
export function byIdOf(everything: Item[]): Map<string, Item> {
  const byId = new Map<string, Item>();
  for (const item of everything) if (!byId.has(item.id)) byId.set(item.id, item);
  return byId;
}

/** The ids an item depends on, or none if the field is malformed, which
 * `depends` reports. */
export function dependsOn(item: Item): string[] {
  const deps = "depends_on" in item.meta ? item.meta.depends_on : [];
  return Array.isArray(deps) && deps.every((d) => typeof d === "string") ? deps : [];
}

/** Where an item sits in the queue, or null if its bucket or rank is
 * invalid, which `bucket` and `rank` report. */
export function position(item: Item): [number, number] | null {
  if (item.archived || !isBucket(item.bucket) || item.rank <= 0) return null;
  return [BUCKETS.indexOf(item.bucket), item.rank];
}

/** `position(item) or (fallback, 0)`, as a sort key. */
export function positionKey(item: Item, fallback: number = BUCKETS.length): [number, number] {
  return position(item) ?? [fallback, 0];
}

function after(a: [number, number], b: [number, number]): boolean {
  return cmp(a, b) >= 0;
}

/** The declared milestone an item is due for, if any. */
export function due(item: Item, milestones: Map<string, Milestone>): Milestone | undefined {
  const mid = item.meta.milestone;
  return typeof mid === "string" ? milestones.get(mid) : undefined;
}

/** The milestones an item's depends_on names. An id that is both an item
 * and a milestone is read as the item; `ids` reports the clash. */
export function awaited(item: Item, byId: Map<string, Item>, milestones: Map<string, Milestone>): Milestone[] {
  return dependsOn(item)
    .filter((d) => !byId.has(d) && milestones.has(d))
    .map((d) => milestones.get(d) as Milestone);
}

/** The open items that must come before `item` because of a milestone: the
 * ones due for a milestone it waits on, or for an earlier one. They are in
 * queue order, so the last one is the furthest down. */
export function dueBefore(item: Item, byId: Map<string, Item>, milestones: Map<string, Milestone>): Item[] {
  const waits = awaited(item, byId, milestones);
  if (!waits.length) return [];
  const latest = Math.max(...waits.map((m) => m.date.ordinal));
  const found = [...byId.values()].filter((other) => {
    const m = other !== item && !other.archived ? due(other, milestones) : undefined;
    return m !== undefined && m.date.ordinal <= latest;
  });
  return found.sort((a, b) => cmp(positionKey(a), positionKey(b)));
}

/** Whether `item` has to come after `other`: it depends on it, or waits on
 * a milestone `other` is due for. */
export function mustFollow(
  item: Item,
  other: Item,
  byId: Map<string, Item>,
  milestones: Map<string, Milestone>,
): boolean {
  return dependsOn(item).includes(other.id) || dueBefore(item, byId, milestones).some((o) => o.id === other.id);
}

export function waitsOnLater(item: Item, byId: Map<string, Item>, milestones: Map<string, Milestone>): boolean {
  const before = [...dependsOn(item).map((d) => byId.get(d)), ...dueBefore(item, byId, milestones)];
  return before.some((other) => other && !other.archived && other.bucket === "later");
}

function latestOf(milestones: Milestone[]): Milestone {
  // Python's max() keeps the first of equal keys.
  return milestones.reduce((best, m) => (m.date.ordinal > best.date.ordinal ? m : best));
}

/** An item's dependencies come first: in an earlier bucket, or higher in
 * its own. Ranks are unique, so this also rules out cycles. A shipped
 * dependency is satisfied. A declined one means the item has to be re-argued.
 *
 * A milestone is a point in time. An item that waits on one comes after
 * every item due for it or for an earlier one, and an item can't wait on a
 * point it is due before. Today's date plays no part, so `check` gives the
 * same answer every day. An archived item keeps depends_on and milestone as
 * history, so only their types are checked. */
export function dependsProblems(item: Item, byId: Map<string, Item>, milestones: Map<string, Milestone>): Problem[] {
  const deps = "depends_on" in item.meta ? item.meta.depends_on : [];
  if (!(Array.isArray(deps) && deps.every((d) => typeof d === "string" && d.trim()))) {
    return [new Problem(item.path, "depends", 'depends_on must be a list of item ids, e.g. ["other-item"]')];
  }
  if (item.archived) return [];

  const problems: string[] = [];
  const mine = due(item, milestones);
  const mid = item.meta.milestone;
  if (typeof mid === "string" && mine === undefined) {
    problems.push(`is due for milestone ${repr(mid)}, which roadmap.toml does not declare`);
  }
  if (new Set(deps).size !== deps.length) problems.push("depends_on names an item more than once");
  for (const depId of new Set(deps as string[])) {
    const dep = byId.get(depId);
    const waitsFor = dep === undefined ? milestones.get(depId) : undefined;
    const here = position(item);
    const there = dep ? position(dep) : null;
    const later = mine && dep && !dep.archived ? due(dep, milestones) : undefined;
    if (depId === item.id) {
      problems.push("depends on itself");
    } else if (waitsFor) {
      if (mine && waitsFor.date.ordinal >= mine.date.ordinal) {
        problems.push(`is due for ${repr(mine.id)} (${mine.date}) but waits on ${repr(depId)} (${waitsFor.date})`);
      }
    } else if (dep === undefined) {
      problems.push(`depends on ${repr(depId)}, which is not an open or archived item, or a declared milestone`);
    } else if (dep.archived && dep.meta.outcome === "declined") {
      problems.push(`depends on ${repr(depId)}, which was declined; drop the dependency or re-scope this item`);
    } else if (here && there && after(there, here)) {
      problems.push(
        `depends on ${repr(depId)} (${repr(dep.bucket)}, rank ${dep.rank}), which must come first:` +
          ` in an earlier bucket, or higher in ${repr(item.bucket)}`,
      );
    } else if (mine && later && later.date.ordinal > mine.date.ordinal) {
      problems.push(
        `is due for ${repr(mine.id)} (${mine.date}) but depends on ${repr(depId)}, which is due later, for` +
          ` ${repr(later.id)} (${later.date})`,
      );
    }
  }
  const here = position(item);
  const late = here
    ? dueBefore(item, byId, milestones).filter((o) => {
        const there = position(o);
        return there !== null && after(there, here);
      })
    : [];
  const other = late[late.length - 1];
  if (other) {
    const latest = latestOf(awaited(item, byId, milestones));
    problems.push(
      `depends on milestone ${repr(latest.id)} (${latest.date}), but ${repr(other.id)} (${repr(other.bucket)}, rank` +
        ` ${other.rank}) is due by then and must come first: in an earlier bucket, or higher in ${repr(item.bucket)}`,
    );
  }
  return problems.map((message) => new Problem(item.path, "depends", message));
}

/** A second attempt at a declined idea names the item it tries again, so a
 * reader can find the first attempt and see what changed. Work that follows
 * on from a shipped item depends on it instead. Only open items are checked;
 * an archived item keeps the field as history. */
export function supersedesProblems(item: Item, byId: Map<string, Item>): Problem[] {
  const oldId = item.meta.supersedes;
  if (typeof oldId !== "string" || !oldId.trim()) return []; // missing, or a type problem `schema` already reports
  const old = byId.get(oldId);
  let message: string;
  if (oldId === item.id) message = "supersedes itself";
  else if (old === undefined || !old.archived) message = `supersedes ${repr(oldId)}, which is not an archived item`;
  else if (old.meta.outcome !== "declined") {
    message = `supersedes ${repr(oldId)}, which ${str(old.meta.outcome)}; use depends_on for follow-up work`;
  } else return [];
  return [new Problem(item.path, "supersedes", message)];
}

function rankProblems(item: Item): Problem[] {
  const rank = item.meta.rank;
  if (rank === undefined || (isInt(rank) && rank > 0)) return [];
  return [new Problem(item.path, "rank", `rank must be a positive integer, not ${repr(rank)}`)];
}

/** A bare TOML date parses to a Day. A quoted one parses to a string, and
 * then sorts and renders wrong. The difference is invisible in the file, which
 * is why it gets a check. */
function dateProblems(item: Item): Problem[] {
  const problems = DATE_FIELDS.filter((name) => name in item.meta && !(item.meta[name] instanceof Day)).map(
    (name) =>
      new Problem(item.path, "dates", `${name} must be a bare TOML date (2026-09-06), not ${repr(item.meta[name])}`),
  );
  const filed = item.meta.filed;
  if (filed instanceof Day) {
    for (const name of DATE_FIELDS.slice(1)) {
      const value = item.meta[name];
      if (value instanceof Day && value.ordinal < filed.ordinal) {
        problems.push(new Problem(item.path, "dates", `${name} ${value} is before filed ${filed}`));
      }
    }
  }
  return problems;
}

const COMMENT = /<!--[\s\S]*?-->/g;

function bodyProblems(item: Item): Problem[] {
  if (item.body.replace(COMMENT, "").trim()) return [];
  return [new Problem(item.path, "body", "has no prose; an item with only a title is not an item")];
}

/** Every ref that points at something that is not there. Prose could never
 * do this check. Only open items are resolved: an archived entry describes the
 * tree as it was, and it is allowed to point at things that have since been
 * renamed. */
function refProblems(item: Item, rm: Roadmap): Problem[] {
  const refs = "refs" in item.meta ? item.meta.refs : {};
  if (!isDict(refs))
    return [new Problem(item.path, "refs", "refs must be a table of lists, e.g. [refs] files = [...]")];

  const problems: string[] = [];
  for (const [kind, entries] of Object.entries(refs)) {
    if (!(Array.isArray(entries) && entries.every((e) => typeof e === "string"))) {
      problems.push(`refs.${kind} must be a list of strings`);
      continue;
    }
    if (item.archived) continue;
    const templates = rm.refKinds.get(kind);
    if (templates === undefined) {
      problems.push(`unknown ref kind ${repr(kind)}; roadmap.toml declares ${sortedNames(rm.refKinds.keys())}`);
      continue;
    }
    for (const entry of entries as string[]) {
      if (!resolves(rm.root, templates, entry)) {
        const where =
          templates.length === 1 && templates[0] === "{}"
            ? "does not exist"
            : `matches none of ${templates.join(", ")}`;
        problems.push(`refs.${kind} ${repr(entry)} ${where}`);
      }
    }
  }
  return problems.map((message) => new Problem(item.path, "refs", message));
}

function resolves(root: string, templates: readonly string[], entry: string): boolean {
  return templates.some((t) => globExists(root, t, entry));
}

type Glyph = { char: string; literal: boolean };

/** `glob.glob(root / template.replace("{}", glob.escape(entry)))` found
 * something: the template's `*`, `?` and `[...]` are patterns, the entry is
 * literal. As in Python's glob, `*` skips dotfiles unless the pattern starts
 * with a dot, and `**` is just `*`. */
function globExists(root: string, template: string, entry: string): boolean {
  const glyphs: Glyph[] = [];
  const [head, ...tails] = template.split("{}");
  const push = (text: string, literal: boolean) => {
    for (const char of text) glyphs.push({ char, literal });
  };
  push(head ?? "", false);
  for (const tail of tails) {
    push(entry, true);
    push(tail, false);
  }
  const absolute = glyphs[0]?.char === "/";
  const segments: Glyph[][] = [[]];
  for (const glyph of glyphs) {
    if (glyph.char === "/") segments.push([]);
    else segments[segments.length - 1]?.push(glyph);
  }
  const parts = segments.filter((s) => s.length);
  return walk(absolute ? "/" : root, parts);
}

function isMagic(segment: Glyph[]): boolean {
  return segment.some((g) => !g.literal && "*?[".includes(g.char));
}

function walk(base: string, parts: Glyph[][]): boolean {
  const [segment, ...rest] = parts;
  if (segment === undefined) return lexists(base);
  if (!isMagic(segment)) {
    const next = join(base, segment.map((g) => g.char).join(""));
    return rest.length ? walk(next, rest) : lexists(next);
  }
  if (!isDir(base)) return false;
  const pattern = segmentRegex(segment);
  const hidden = segment[0]?.char === ".";
  let names: string[];
  try {
    names = readdirSync(base);
  } catch {
    return false;
  }
  return names.some((name) => {
    if (!hidden && name.startsWith(".")) return false;
    if (!pattern.test(name)) return false;
    const path = join(base, name);
    return rest.length ? isDir(path) && walk(path, rest) : true;
  });
}

/** fnmatch's translation of one path segment into a regular expression. */
function segmentRegex(segment: Glyph[]): RegExp {
  let source = "";
  for (let i = 0; i < segment.length; i++) {
    const { char, literal } = segment[i] as Glyph;
    if (literal) source += escapeRegex(char);
    else if (char === "*") source += "[\\s\\S]*";
    else if (char === "?") source += "[\\s\\S]";
    else if (char === "[") {
      let j = i + 1;
      if (j < segment.length && segment[j]?.char === "!") j++;
      if (j < segment.length && segment[j]?.char === "]") j++;
      while (j < segment.length && segment[j]?.char !== "]") j++;
      if (j >= segment.length) source += "\\[";
      else {
        let body = segment
          .slice(i + 1, j)
          .map((g) => g.char)
          .join("");
        if (body.startsWith("!")) body = `^${body.slice(1)}`;
        else if (body.startsWith("^")) body = `\\${body}`;
        source += `[${body.replace(/\\/g, "\\\\")}]`;
        i = j;
      }
    } else source += escapeRegex(char);
  }
  return new RegExp(`^${source}$`);
}

function escapeRegex(char: string): string {
  return char.replace(/[.*+?^${}()|[\]\\/-]/g, "\\$&");
}

/** Two open items claiming the same position in a bucket. */
function collisionProblems(items: Item[]): Problem[] {
  const problems: Problem[] = [];
  const ranks = new Map<string, string>();
  for (const item of items) {
    if (!isBucket(item.bucket) || item.rank <= 0) continue;
    const key = `${item.bucket}\0${item.rank}`;
    const other = ranks.get(key);
    if (other === undefined) ranks.set(key, item.path);
    else if (other !== item.path) {
      problems.push(
        new Problem(item.path, "rank", `rank ${item.rank} is already taken in ${repr(item.bucket)} by ${other}`),
      );
    }
  }
  return problems;
}

/** An id is an address. A closed id cannot be reused, and an item cannot
 * be both open and closed, nor share an id with a milestone, since
 * depends_on names either. */
function idProblems(everything: Item[], milestones: Map<string, Milestone>): Problem[] {
  const problems: Problem[] = [];
  const seen = new Map<string, Item>();
  for (const item of everything) {
    if (milestones.has(item.id)) {
      problems.push(new Problem(item.path, "ids", `id ${repr(item.id)} is also a milestone in roadmap.toml`));
    }
    const first = seen.get(item.id);
    if (first === undefined) {
      seen.set(item.id, item);
      continue;
    }
    const message =
      first.archived !== item.archived
        ? `id ${repr(item.id)} is both open and archived (also ${first.path})`
        : `duplicate id ${repr(item.id)}, also in ${first.path}`;
    problems.push(new Problem(item.path, "ids", message));
  }
  return problems;
}

// --- links ------------------------------------------------------------------

const INLINE_LINK = /\]\(\s*(<[^>\n]*>|[^)\s]+)/dg;
const REFERENCE_LINK = /^ {0,3}\[[^\]\n]+\]:[ \t]*(<[^>\n]*>|\S+)/dgm;
const SCHEME = /^[A-Za-z][A-Za-z0-9+.-]*:/;

/** Blank out fenced blocks and inline code spans, keeping every offset, so a
 * link inside a code example is neither checked nor rewritten. */
function maskCode(text: string): string {
  const out: string[] = [];
  let fence: string | null = null;
  for (const line of splitlines(text, true)) {
    const marker = /^\s{0,3}(`{3,}|~{3,})/.exec(line)?.[1];
    if (fence === null && marker) {
      fence = marker;
    } else if (fence !== null) {
      if (marker && marker[0] === fence[0] && marker.length >= fence.length) fence = null;
    } else {
      out.push(line.replace(/(`+).+?\1/g, (m) => " ".repeat(m.length)));
      continue;
    }
    out.push(line.replace(/[^\n]/g, " "));
  }
  return out.join("");
}

/** [start, end, target] for every inline and reference-style link
 * destination outside code, with any <angle brackets> stripped from the
 * target. */
function links(text: string): [number, number, string][] {
  const masked = maskCode(text);
  const found: [number, number, string][] = [];
  for (const pattern of [INLINE_LINK, REFERENCE_LINK]) {
    for (const match of masked.matchAll(pattern)) {
      let [start, end] = match.indices?.[1] ?? [0, 0];
      let target = text.slice(start, end);
      if (target.startsWith("<")) [start, end, target] = [start + 1, end - 1, target.slice(1, -1)];
      found.push([start, end, target]);
    }
  }
  return found.sort((a, b) => cmp(a, b));
}

/** Split a relative link into its path and its #fragment or ?query. Returns
 * null for anything that is not a relative path: URLs, mailto:, bare anchors
 * and repo-absolute /paths. */
function localPart(target: string): [string, string] | null {
  if (!target || SCHEME.test(target) || target.startsWith("#") || target.startsWith("/")) return null;
  const cuts = [target.indexOf("#"), target.indexOf("?")].filter((i) => i !== -1);
  const cut = cuts.length ? Math.min(...cuts) : target.length;
  return target.slice(0, cut) ? [target.slice(0, cut), target.slice(cut)] : null;
}

/** Every relative link in the open items, README.md and done.md that
 * points at nothing. Archived entries are exempt, for the same reason their
 * refs are. So are the generated blocks: `index` rewrites them from the
 * files, and a stale index is reported as `generated`. Checking their links
 * too would stop `index` from repairing an index that links to a deleted
 * item. decisions.md is exempt like the archive: being append-only, it
 * could never fix a link that broke later. */
export function linkProblems(rm: Roadmap, items: Item[]): Problem[] {
  const problems: Problem[] = [];
  const generated = new Map([
    [rm.readme, [INDEX_BEGIN, INDEX_END] as const],
    [rm.done, [DONE_BEGIN, DONE_END] as const],
  ]);
  const paths = [...items.map((i) => i.path), ...[rm.readme, rm.done].filter(exists)];
  for (const path of paths) {
    const text = readText(path);
    const markers = generated.get(path);
    const skip = markers ? blockSpan(text, markers[0], markers[1]) : null;
    for (const [start, , target] of links(text)) {
      if (skip && skip[0] <= start && start < skip[1]) continue;
      const local = localPart(target);
      if (local && !exists(join(parent(path), unquote(local[0])))) {
        const line = text.slice(0, start).split("\n").length;
        problems.push(new Problem(path, "links", `links to ${repr(target)}, which does not exist`, line));
      }
    }
  }
  return problems;
}

/** Rewrite the relative links in a file's text. `before` is the directory
 * the file lived in, `after` is the one it will live in, and `moves` maps old
 * paths to new ones. Each link is kept pointing at the same file, including a
 * file that moved. */
export function retargetLinks(text: string, before: string, after: string, moves: Map<string, string>): string {
  const normal = new Map([...moves].map(([k, v]) => [normpath(k), normpath(v)]));
  const pieces: string[] = [];
  let last = 0;
  for (const [start, end, target] of links(text)) {
    const local = localPart(target);
    if (local === null) continue;
    let resolved = normpath(join(before, unquote(local[0])));
    resolved = normal.get(resolved) ?? resolved;
    if (normpath(join(after, unquote(local[0]))) === resolved) continue;
    pieces.push(text.slice(last, start), relpath(resolved, after) + local[1]);
    last = end;
  }
  return pieces.join("") + text.slice(last);
}
