/** The commands. Each one ports the `cmd_*` function of the same name in
 * scripts/roadmap.py, prints what it printed, and returns the exit status. */

import { spawnSync } from "node:child_process";
import { mkdirSync, unlinkSync, writeFileSync } from "node:fs";
import { editFrontmatter, itemText } from "./edit.ts";
import { appendOnlyProblems, committedDate, lastCommits } from "./git.ts";
import {
  BUCKETS,
  DECISIONS_INTRO,
  DONE_BEGIN,
  DONE_END,
  FrontmatterError,
  INDEX_BEGIN,
  INDEX_END,
  type Item,
  load,
  MERGE_STANDIN,
  type Meta,
  type Milestone,
  markdownFiles,
  PLACEHOLDER,
  type Problem,
  parse,
  QUEUE_FIELDS,
  type Roadmap,
  SLUG,
  UsageError,
} from "./model.ts";
import { exists, join, name, parent, stem } from "./pathlib.ts";
import { cmp, Day, isDict, jsonDumps, readText, repr, str, truthy } from "./py.ts";
import { blockSpan, generatedProblems, splice, writeGenerated } from "./render.ts";
import {
  awaited,
  bucketProblems,
  byIdOf,
  dependsOn,
  dependsProblems,
  due,
  mustFollow,
  positionKey,
  retargetLinks,
  supersedesProblems,
  validate,
  waitsOnLater,
} from "./rules.ts";

// biome-ignore lint/suspicious/noExplicitAny: parsed arguments, typed per command by the parser in cli.ts
export type Args = Record<string, any>;

export function out(line: string): void {
  process.stdout.write(`${line}\n`);
}

export function err(line: string): void {
  process.stderr.write(`${line}\n`);
}

/** Everything `check` enforces: parse failures, `validate()`, drift in
 * the generated files, and (given a git base) append-only. */
export function check(rm: Roadmap, base: string | null = null): Problem[] {
  const [items, archived, problems] = load(rm);
  problems.push(...validate(rm, items, archived), ...generatedProblems(rm, items, archived));
  if (base !== null) problems.push(...appendOnlyProblems(rm, base));
  return problems;
}

function today(args: Args): Day {
  return args.date ?? Day.today();
}

function openItem(rm: Roadmap, itemId: string): Item {
  const path = join(rm.itemsDir, `${itemId}.md`);
  if (!exists(path)) {
    const where = exists(join(rm.archiveDir, `${itemId}.md`)) ? " it is already closed" : "";
    throw new UsageError(`no open item ${repr(itemId)} in ${rm.itemsDir}${where ? `;${where}` : ""}`);
  }
  try {
    return parse(path);
  } catch (exc) {
    if (exc instanceof FrontmatterError) throw new UsageError(exc.message);
    throw exc;
  }
}

function nextRank(rm: Roadmap, bucket: string): number {
  const [items] = load(rm);
  return 1 + Math.max(0, ...items.filter((i) => i.bucket === bucket).map((i) => i.rank));
}

/** The item files whose rank changes when each bucket is numbered 1, 2, 3...
 * in its current order. Items that share a rank, as after two branches each
 * filed one, keep what they depend on first, then go oldest first, then by id.
 * Items with an invalid bucket or rank are left for `bucket` and `rank` to report. */
function renumbered(rm: Roadmap, items: Item[], archived: Item[]): Map<string, string> {
  const byId = byIdOf([...items, ...archived]);
  const texts = new Map<string, string>();
  for (const bucket of BUCKETS) {
    const tied = new Map<number, Item[]>();
    const sorted = [...items].sort((a, b) => cmp([a.rank, str(a.meta.filed), a.id], [b.rank, str(b.meta.filed), b.id]));
    for (const item of sorted) {
      if (item.bucket === bucket && item.rank > 0) tied.set(item.rank, [...(tied.get(item.rank) ?? []), item]);
    }
    const ordered = [...tied.values()].flatMap((group) => dependenciesFirst(group, byId, rm.milestones));
    ordered.forEach((item, index) => {
      if (item.rank !== index + 1) texts.set(item.path, editFrontmatter(item.path, { assign: { rank: index + 1 } }));
    });
  }
  return texts;
}

/** `group` reordered so no item comes before one it has to follow. A cycle,
 * which `depends` reports, keeps the order it was given. */
function dependenciesFirst(group: Item[], byId: Map<string, Item>, milestones: Map<string, Milestone>): Item[] {
  const ordered: Item[] = [];
  let rest = [...group];
  while (rest.length) {
    const ready =
      rest.find((i) => !rest.some((o) => o !== i && mustFollow(i, o, byId, milestones))) ?? (rest[0] as Item);
    ordered.push(ready);
    rest = rest.filter((i) => i !== ready);
  }
  return ordered;
}

/** Refuse a command whose result would fail `bucket`, `depends` or
 * `supersedes`. `changes` maps each path the command touches to its item
 * afterwards, or to null for a file it removes. Only problems the roadmap
 * doesn't already have count, so a command never has to fix what it didn't
 * break. */
function refuseIfBreaking(rm: Roadmap, changes: Map<string, Item | null>, doing: string): void {
  const [items, archived] = load(rm);
  const before = [...items, ...archived];
  const after = [
    ...before.filter((i) => !changes.has(i.path)),
    ...[...changes.values()].filter((i): i is Item => i !== null),
  ];
  const problems = (everything: Item[]): Problem[] => {
    const byId = byIdOf(everything);
    const found: Problem[] = [];
    for (const item of everything) {
      found.push(...dependsProblems(item, byId, rm.milestones));
      if (!item.archived) {
        found.push(...bucketProblems(item, byId, rm.milestones), ...supersedesProblems(item, byId));
      }
    }
    return found;
  };
  const known = new Set(problems(before).map((p) => p.key));
  const fresh = problems(after).filter((p) => !known.has(p.key));
  if (fresh.length) {
    throw new UsageError(`${doing} would break the roadmap:\n${fresh.map((p) => `  ${p}`).join("\n")}`);
  }
}

function parsed(texts: Map<string, string>): Map<string, Item | null> {
  return new Map([...texts].map(([path, text]) => [path, parse(path, false, text)]));
}

export function report(problems: Problem[]): number {
  if (problems.length) {
    err(`${problems.length} roadmap problem(s):`);
    err(problems.map(String).join("\n"));
    return 1;
  }
  return 0;
}

export function cmdCheck(rm: Roadmap, args: Args): number {
  const code = report(check(rm, args.base ?? null));
  if (code) return code;
  const [items, archived] = load(rm);
  out(`Roadmap OK: ${items.length} open, ${archived.length} archived.`);
  return 0;
}

/** Upkeep that `check` deliberately skips because it depends on today's
 * date: milestones that have passed, and Now and Next items nobody has
 * touched for a while. It is advice, so it exits 0 whatever it finds; an
 * exit code would only tempt someone to run it in CI, where an unchanged
 * roadmap would start failing one day. */
export function cmdReview(rm: Roadmap, args: Args): number {
  const [items, , problems] = load(rm);
  if (problems.length) {
    err("Fix these first; `check` reports them too.");
    return report(problems);
  }
  const now = today(args);
  const byId = byIdOf(items);
  let found = false;

  const passed = [...rm.milestones.values()]
    .filter((m) => m.date.ordinal < now.ordinal)
    .sort((a, b) => cmp([a.date.ordinal, a.id], [b.date.ordinal, b.id]));
  for (const m of passed) {
    const dueFor = items.filter((i) => due(i, rm.milestones) === m).map((i) => i.id);
    const waiting = items.filter((i) => awaited(i, byId, rm.milestones).includes(m)).map((i) => i.id);
    if (!(dueFor.length || waiting.length)) continue; // history: done.md lists it with what shipped for it
    if (!found) {
      out(
        "Milestones that have passed but open items still name (re-date them, or re-target the items" +
          " due for them and drop them from depends_on):",
      );
      found = true;
    }
    const names = [
      ...(dueFor.length ? [`due: ${dueFor.join(", ")}`] : []),
      ...(waiting.length ? [`waiting: ${waiting.join(", ")}`] : []),
    ];
    out(`  ${m.id}: ${m}, ${now.ordinal - m.date.ordinal} days ago${names.length ? `; ${names.join("; ")}` : ""}`);
  }

  const [committed, note] = lastCommits(rm);
  const stale: string[] = [];
  const queued = items
    .filter((i) => i.bucket === "now" || i.bucket === "next")
    .sort((a, b) => cmp(positionKey(a, 9), positionKey(b, 9)));
  for (const item of queued) {
    const dates = [item.meta.filed, item.meta.updated, committedDate(committed, item)].filter(
      (d): d is Day => d instanceof Day,
    );
    const touched = dates.reduce<Day | null>((best, d) => (best === null || d.ordinal > best.ordinal ? d : best), null);
    if (touched && now.ordinal - touched.ordinal >= args.days) {
      stale.push(
        `  ${item.bucket} ${item.rank}  ${item.id}  last touched ${touched} (${now.ordinal - touched.ordinal} days ago)`,
      );
    }
  }
  if (stale.length) {
    out(`Now and Next items untouched for ${args.days} days or more (re-argue, move or close them):`);
    out(stale.join("\n"));
    found = true;
  }
  if (note) out(note);
  if (!found) out("Nothing to review.");
  return 0;
}

export function cmdIndex(rm: Roadmap, args: Args): number {
  let [items, archived, problems] = load(rm);
  if (args.renumber && !problems.length) {
    const texts = renumbered(rm, items, archived);
    refuseIfBreaking(rm, parsed(texts), "renumbering");
    for (const [path, text] of texts) writeFileSync(path, text);
    if (texts.size) out(`Renumbered ${[...texts.keys()].map(stem).join(", ")}.`);
    [items, archived, problems] = load(rm);
  }
  const code = report([...problems, ...validate(rm, items, archived)]);
  if (code) return code;
  const written = writeGenerated(rm);
  out(written.length ? `Wrote ${written.join(", ")}.` : "Index already up to date.");
  return 0;
}

function checkNewId(rm: Roadmap, newId: string): void {
  if (!SLUG.test(newId)) {
    throw new UsageError(`id ${repr(newId)} is not a kebab-case slug (lowercase letters, digits, single hyphens)`);
  }
  for (const existing of [join(rm.itemsDir, `${newId}.md`), join(rm.archiveDir, `${newId}.md`)]) {
    if (exists(existing)) throw new UsageError(`${existing} already exists; ids are never reused`);
  }
  if (rm.milestones.has(newId)) {
    throw new UsageError(`${repr(newId)} is a milestone in ${join(rm.dir, "roadmap.toml")}; pick another id`);
  }
}

export function cmdNew(rm: Roadmap, args: Args): number {
  checkNewId(rm, args.id);
  if (
    (args.blocked_on && args.bucket !== "later") ||
    (args.bucket === "later" && !(args.blocked_on || args.depends_on.length))
  ) {
    throw new UsageError(
      "--blocked-on is required for a 'later' item that depends on no other 'later' item," +
        " and forbidden for any other",
    );
  }

  const meta: Meta = { id: args.id, title: args.title, bucket: args.bucket, rank: nextRank(rm, args.bucket) };
  meta.filed = today(args);
  if (args.gate) meta.gate = args.gate;
  if (args.blocked_on) meta.blocked_on = args.blocked_on;
  if (args.milestone) meta.milestone = args.milestone;
  if (args.supersedes) meta.supersedes = args.supersedes;
  if (args.depends_on.length) meta.depends_on = args.depends_on;
  const refs: Record<string, string[]> = {};
  for (const ref of args.ref as string[]) {
    const sep = ref.indexOf(":");
    const [kind, value] = sep === -1 ? [ref, ""] : [ref.slice(0, sep), ref.slice(sep + 1)];
    if (sep === -1 || !kind || !value) {
      throw new UsageError(`--ref ${repr(ref)} must look like KIND:VALUE, e.g. files:src/app.py`);
    }
    refs[kind] = [...(refs[kind] ?? []), value];
  }

  const path = join(rm.itemsDir, `${args.id}.md`);
  const text = itemText(meta, refs, args.body || PLACEHOLDER);
  refuseIfBreaking(rm, parsed(new Map([[path, text]])), `filing ${args.id}`);

  mkdirSync(rm.itemsDir, { recursive: true });
  writeFileSync(path, text);
  writeGenerated(rm);
  out(`Created ${path} in ${repr(args.bucket)} at rank ${meta.rank}.`);
  if (!args.body) out("Its body is a placeholder; `check` fails until the prose is written.");
  return 0;
}

/** Hard rule 4's split: an item that turned out to be two pieces of work
 * gets a sibling directly below it, with the same place in the queue and the
 * same dependencies. The original keeps the other part, so its dependents
 * and its links stay as they are; its prose is narrowed by hand. */
export function cmdSplit(rm: Roadmap, args: Args): number {
  const item = openItem(rm, args.id);
  checkNewId(rm, args.new_id);
  const meta: Meta = { id: args.new_id, title: args.title, bucket: item.bucket, rank: item.rank + 1 };
  meta.filed = today(args);
  for (const key of ["gate", "blocked_on", "milestone", "depends_on"]) {
    if (key in item.meta) meta[key] = item.meta[key];
  }
  const refs = isDict(item.meta.refs) ? (item.meta.refs as Record<string, unknown[]>) : {};

  const path = join(rm.itemsDir, `${args.new_id}.md`);
  const [items] = load(rm);
  const below = items.filter((i) => i.bucket === item.bucket && i.rank > item.rank);
  const texts = new Map([[path, itemText(meta, refs, args.body || PLACEHOLDER)]]);
  for (const i of below) texts.set(i.path, editFrontmatter(i.path, { assign: { rank: i.rank + 1 } }));
  refuseIfBreaking(rm, parsed(texts), `splitting ${args.new_id} from ${args.id}`);

  for (const [p, text] of texts) writeFileSync(p, text);
  writeGenerated(rm);
  out(`Split ${args.new_id} from ${args.id}: rank ${meta.rank} in ${repr(item.bucket)}.`);
  if (below.length) out(`Shifted ${below.map((i) => i.id).join(", ")} down a rank, below it.`);
  out(`Narrow ${item.path}'s prose to the part it keeps.`);
  if (!args.body) out(`${path}'s body is a placeholder; \`check\` fails until the prose is written.`);
  return 0;
}

/** The open items in queue order, for an agent or a script that wants the
 * roadmap's state without parsing README.md. The item file is the detail view. */
export function cmdList(rm: Roadmap, args: Args): number {
  const [items, , problems] = load(rm);
  const code = report(problems);
  if (code) return code;
  const shown = items
    .filter((i) => !args.bucket || i.bucket === args.bucket)
    .sort((a, b) => cmp(positionKey(a, 9), positionKey(b, 9)));
  if (args.json) {
    out(jsonDumps(shown.map((i) => ({ path: i.path, ...i.meta }))));
    return 0;
  }
  for (const item of shown) {
    out(`${item.bucket} ${item.rank}  ${item.id}  ${item.title}`);
    for (const [label, key] of [
      ["blocked on", "blocked_on"],
      ["gate", "gate"],
      ["due for", "milestone"],
    ] as const) {
      if (truthy(item.meta[key])) out(`    ${label}: ${str(item.meta[key])}`);
    }
    const deps = dependsOn(item);
    if (deps.length) out(`    depends on: ${deps.join(", ")}`);
  }
  if (!shown.length) out("No open items.");
  return 0;
}

export function cmdMove(rm: Roadmap, args: Args): number {
  const item = openItem(rm, args.id);
  const above = args.above ? openItem(rm, args.above) : null;
  if (above && above.id === item.id) throw new UsageError(`${args.id} cannot go above itself`);
  if (above && args.bucket && args.bucket !== above.bucket) {
    throw new UsageError(`--above ${above.id} is in ${repr(above.bucket)}, not ${repr(args.bucket)}`);
  }
  const bucket: string = above ? above.bucket : args.bucket || item.bucket;
  if (!(args.bucket || args.rank || above)) throw new UsageError("give --bucket, --rank or --above");
  const staying = bucket === item.bucket;
  if (staying && !(args.rank || above)) throw new UsageError(`${item.path} is already in ${repr(bucket)}`);
  const [items, archived] = load(rm);
  const byId = byIdOf([...items, ...archived]);
  if (staying && args.blocked_on) {
    throw new UsageError("--blocked-on is only for moving an item into 'later' from another bucket");
  }
  if (
    !staying &&
    ((args.blocked_on && bucket !== "later") ||
      (bucket === "later" && !args.blocked_on && !waitsOnLater(item, byId, rm.milestones)))
  ) {
    throw new UsageError(
      "--blocked-on is required when moving to 'later' an item that depends on no other 'later' item," +
        " and forbidden otherwise",
    );
  }

  const inBucket = items.filter((i) => i.bucket === bucket && i.rank > 0 && i.id !== item.id);
  let rank: number;
  if (above) {
    // Within the bucket, moving down vacates a rank above `above`, which
    // then shifts up into it; the item takes the rank just above.
    rank = staying && above.rank > item.rank ? above.rank - 1 : above.rank;
  } else if (args.rank) {
    rank = args.rank;
  } else {
    // An item lands just above the first item in the bucket that has to
    // come after it. Otherwise it lands at the bottom.
    const dependents = inBucket.filter((i) => mustFollow(i, item, byId, rm.milestones));
    rank = dependents.length
      ? Math.min(...dependents.map((i) => i.rank))
      : 1 + Math.max(0, ...inBucket.map((i) => i.rank));
  }
  if (staying && rank === item.rank) throw new UsageError(`${item.path} is already at rank ${rank} in ${repr(bucket)}`);

  // The items between the old and new place shift a rank to close the gap
  // and open one; across buckets, everything from the new rank down shifts.
  let shifts: [Item, number][];
  if (!staying) shifts = inBucket.filter((i) => i.rank >= rank).map((i) => [i, 1]);
  else if (rank < item.rank) shifts = inBucket.filter((i) => rank <= i.rank && i.rank < item.rank).map((i) => [i, 1]);
  else shifts = inBucket.filter((i) => item.rank < i.rank && i.rank <= rank).map((i) => [i, -1]);

  // A move to another bucket re-argues the item; a re-rank doesn't.
  const assign: Meta = staying ? { rank } : { bucket, rank, updated: today(args) };
  if (args.blocked_on) assign.blocked_on = args.blocked_on;
  const remove = staying || !("blocked_on" in item.meta) ? new Set<string>() : new Set(["blocked_on"]);
  const texts = new Map([[item.path, editFrontmatter(item.path, { remove, assign })]]);
  for (const [i, d] of shifts) texts.set(i.path, editFrontmatter(i.path, { assign: { rank: i.rank + d } }));
  refuseIfBreaking(rm, parsed(texts), `moving ${args.id}`);

  for (const [path, text] of texts) writeFileSync(path, text);
  writeGenerated(rm);
  out(
    staying
      ? `Moved ${item.path} to rank ${rank} in ${repr(bucket)}.`
      : `Moved ${item.path} to ${repr(bucket)} at rank ${rank}.`,
  );
  const down = shifts.filter(([, d]) => d > 0).map(([i]) => i.id);
  if (down.length) out(`Shifted ${down.join(", ")} down a rank, below it.`);
  const up = shifts.filter(([, d]) => d < 0).map(([i]) => i.id);
  if (up.length) out(`Shifted ${up.join(", ")} up a rank, above it.`);
  if (remove.size) out("It was blocked on a decision; record in its prose what was decided.");
  return 0;
}

export function cmdClose(rm: Roadmap, args: Args): number {
  const item = openItem(rm, args.id);
  const assign: Meta = { closed: today(args), outcome: args.outcome };
  if (args.shipped_as) assign.shipped_as = args.shipped_as;
  const target = join(rm.archiveDir, name(item.path));
  if (exists(target)) throw new UsageError(`${target} already exists; ids are never reused`);

  const moves = new Map([[item.path, target]]);
  let text = editFrontmatter(item.path, { remove: QUEUE_FIELDS, assign });
  text = retargetLinks(text, parent(item.path), parent(target), moves);
  const closed = parse(target, true, text);
  refuseIfBreaking(
    rm,
    new Map<string, Item | null>([
      [item.path, null],
      [target, closed],
    ]),
    `closing ${args.id} as ${args.outcome}`,
  );

  // Links into the moved file from open items and the README follow it.
  // Archived entries are never edited, and they are exempt from the link check.
  const others = [...markdownFiles(rm.itemsDir).filter((p) => p !== item.path), rm.readme].filter(exists);
  const original = new Map(others.map((p) => [p, readText(p)]));
  const rewritten = new Map(
    others.map((p) => [p, retargetLinks(original.get(p) as string, parent(p), parent(p), moves)]),
  );

  mkdirSync(rm.archiveDir, { recursive: true });
  writeFileSync(target, text);
  unlinkSync(item.path);
  for (const [path, updated] of rewritten) {
    if (updated !== original.get(path)) writeFileSync(path, updated);
  }
  writeGenerated(rm);
  for (const path of rewritten.keys()) {
    // Report only edits to hand-written text. Regenerating the README's index
    // moves the index's own links anyway.
    let before = original.get(path) as string;
    let after = readText(path);
    if (path === rm.readme) {
      before = splice(before, INDEX_BEGIN, INDEX_END, "", path);
      after = splice(after, INDEX_BEGIN, INDEX_END, "", path);
    }
    if (before !== after) out(`Updated links in ${path}.`);
  }
  out(`Closed ${args.id} as ${args.outcome}: ${target}.`);
  if (args.outcome === "shipped" && !args.shipped_as) {
    out("No --as given, so done.md doesn't say what it shipped as. The archive is append-only, so pass it next time.");
  }
  return 0;
}

export function cmdDecide(rm: Roadmap, args: Args): number {
  const [title, body] = [String(args.title).trim(), String(args.body).trim()];
  if (!title || title.includes("\n")) throw new UsageError("--title must be one non-empty line");
  if (!body) throw new UsageError("--body must say why: the reasoning is what the log is for");
  const path = rm.decisions;
  const text = exists(path) ? readText(path) : DECISIONS_INTRO;
  mkdirSync(rm.dir, { recursive: true });
  writeFileSync(path, `${text.trimEnd()}\n\n## ${today(args)}: ${title}\n\n${body}\n`);
  out(`Recorded a decision in ${path}.`);
  return 0;
}

/** A git merge driver for README.md and done.md. Git merges the hand-written
 * text around the generated block as usual, and the block is taken from this
 * branch whole, since both sides regenerate it and their versions always
 * clash. It is likely stale after that, so run `index` once the merge is done. */
export function cmdMergeDriver(_rm: Roadmap | null, args: Args): number {
  const paths: string[] = [args.ours, args.base, args.theirs];
  const texts = paths.map(readText);
  const markers = [
    [INDEX_BEGIN, INDEX_END],
    [DONE_BEGIN, DONE_END],
  ] as const;
  const spans = texts.map((text) => {
    for (const [begin, end] of markers) {
      const span = blockSpan(text, begin, end);
      if (span) return span;
    }
    return null;
  });
  let block: string | null = null;
  if (spans.every((s) => s !== null)) {
    const [first] = spans as [number, number][];
    block = (texts[0] as string).slice(first?.[0], first?.[1]);
    paths.forEach((path, i) => {
      const [start, stop] = spans[i] as [number, number];
      const text = texts[i] as string;
      writeFileSync(path, text.slice(0, start) + MERGE_STANDIN + text.slice(stop));
    });
  }

  const result = spawnSync("git", ["merge-file", ...paths], { encoding: "utf8" });
  const status = result.status;
  if (result.error || status === null || status < 0 || status >= 128) {
    throw new UsageError(`git merge-file failed: ${String(result.stderr ?? result.error?.message ?? "").trim()}`);
  }
  if (block !== null) {
    const ours = paths[0] as string;
    writeFileSync(
      ours,
      readText(ours).replaceAll(MERGE_STANDIN, () => block as string),
    );
    err(
      `roadmap.py: kept this branch's generated block in ${args.path || args.ours};` +
        " run `roadmap.py index` once the merge is done",
    );
  }
  return status ? 1 : 0;
}
