/** The `--json` contract and `export`'s snapshot, for a GUI, scripts and
 * agents. With `--json`, stdout holds exactly one JSON document whatever
 * happens, carrying `schema`, `ok` and `warnings`; a failure adds `rule` and
 * `message`. docs/json.md documents every field. Adding a field keeps
 * SCHEMA; removing, renaming or retyping one moves it, and
 * test/fixtures/json-schema-<SCHEMA>.json holds the shape the tests keep. */

import { gitStatus, lastCommits } from "./git.ts";
import { type Item, load, type Roadmap, VERSION } from "./model.ts";
import { relpath, resolve } from "./pathlib.ts";
import { cmp, Float, isDict, jsonDumps } from "./py.ts";
import { awaited, byIdOf, dependsOn, dueIds, positionKey, waitsOf } from "./rules.ts";

export const SCHEMA = 1;

/** What a JSON-mode run has gathered to print: the warnings that would
 * otherwise go to stderr. */
export class JsonContext {
  readonly warnings: string[] = [];
}

/** A command that failed in JSON mode, carrying the rule its document names. */
export class JsonFailure extends Error {
  readonly rule: string;
  readonly code: number;
  readonly extra: Record<string, unknown>;

  constructor(rule: string, message: string, code: number, extra: Record<string, unknown> = {}) {
    super(message);
    this.rule = rule;
    this.code = code;
    this.extra = extra;
  }
}

/** One document on stdout. */
export function emit(ctx: JsonContext, doc: Record<string, unknown>): void {
  process.stdout.write(`${dumps({ schema: SCHEMA, ok: true, warnings: ctx.warnings, ...doc })}\n`);
}

export function emitFailure(ctx: JsonContext, failure: JsonFailure): number {
  process.stdout.write(
    `${dumps({
      schema: SCHEMA,
      ok: false,
      warnings: ctx.warnings,
      rule: failure.rule,
      message: failure.message,
      ...failure.extra,
    })}\n`,
  );
  return failure.code;
}

/** jsonDumps, with a non-finite TOML float (`rank = nan`) written as the
 * string TOML spells it, so the document is always valid JSON. */
export function dumps(value: unknown): string {
  return jsonDumps(finite(value));
}

function finite(value: unknown): unknown {
  if (value instanceof Float && !Number.isFinite(value.value)) return String(value);
  if (typeof value === "number" && !Number.isFinite(value)) return String(new Float(value));
  if (Array.isArray(value)) return value.map(finite);
  if (isDict(value)) return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, finite(v)]));
  return value;
}

/** Everything a GUI shows, read once: the open items in queue order, the
 * archived ones in done.md order, the milestones by date, the edges both
 * ways, each open item's readiness as the index computes it, each file's
 * last commit, and git's branch and state. A file that won't parse is
 * listed in `unreadable` and named in a warning, rather than failing the
 * whole snapshot, so one file mid-edit doesn't blank the GUI. */
export function snapshot(rm: Roadmap, ctx: JsonContext): Record<string, unknown> {
  const [open, archived, problems] = load(rm);
  open.sort((a, b) => cmp([...positionKey(a, 9), a.id], [...positionKey(b, 9), b.id]));
  const everything = [...open, ...archived];
  const byId = byIdOf(everything);
  const dir = resolve(rm.dir);
  const [committed] = lastCommits(rm, [rm.itemsDir, rm.archiveDir]);

  const dependents = new Map<string, string[]>();
  for (const item of everything) {
    for (const dep of new Set(dependsOn(item))) {
      if (dep === item.id) continue;
      dependents.set(dep, [...(dependents.get(dep) ?? []), item.id]);
    }
  }

  const common = (item: Item) => ({
    id: item.id,
    path: relpath(resolve(item.path), dir),
    archived: item.archived,
    frontmatter: item.meta,
    body: item.body,
    committed: committed.get(resolve(item.path)) ?? null,
    depends_on: dependsOn(item),
    due: dueIds(item),
    dependents: dependents.get(item.id) ?? [],
  });

  const unreadable = problems.map((p) => ({ path: relpath(resolve(p.path), dir), message: p.message }));
  for (const u of unreadable) ctx.warnings.push(`${u.path}: ${u.message}; left out of the snapshot`);

  const milestones = [...rm.milestones.values()]
    .sort((a, b) => cmp([a.date.ordinal, a.id], [b.date.ordinal, b.id]))
    .map((m) => ({
      id: m.id,
      title: m.title,
      date: m.date,
      reached: m.reached,
      due: everything.filter((i) => dueIds(i).includes(m.id)).map((i) => i.id),
      waiting: everything.filter((i) => awaited(i, byId, rm.milestones).some((w) => w.id === m.id)).map((i) => i.id),
    }));

  return {
    version: VERSION,
    dir,
    git: gitStatus(rm),
    milestones,
    items: open.map((item) => {
      const waits = waitsOf(item, byId, rm.milestones);
      return { ...common(item), state: waits.state, waits_on: { items: waits.items, milestones: waits.milestones } };
    }),
    archived: archived.map(common),
    unreadable,
  };
}
