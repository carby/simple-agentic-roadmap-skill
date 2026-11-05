/** Migrations `update` runs on a roadmap's files, the way OpenSpec's `update`
 * brings a project written by an older version up to date. A migration never
 * asks which version wrote the files: it looks for the exact text an older
 * template wrote and rewrites only that, so it leaves text a user edited
 * alone, and a second run finds nothing to change. Installed version stamps
 * can't answer the question anyway: a symlinked or 1.x install has none, and
 * two tool directories can disagree.
 *
 * Migrations never touch what the roadmap holds append-only (`archive/`,
 * `decisions.md`) or the generated blocks, which `update` regenerates
 * afterwards. A change to any of those is a bug in the migration, and throws. */

import { join, relative, sep } from "node:path";
import { DONE_BEGIN, DONE_END, INDEX_BEGIN, INDEX_END, type Roadmap } from "./model.ts";
import { isFile } from "./pathlib.ts";
import { readText } from "./py.ts";
import { blockSpan } from "./render.ts";

/** What a migration does to one file's text. Returning it unchanged means
 * nothing to do; a missing file is skipped before any rewrite runs. */
export type Rewrite = (text: string) => string;

export interface Migration {
  /** Stable name, for tests and messages. */
  id: string;
  /** The release whose template change this migration catches up with. */
  since: string;
  /** What it changes, as `update` reports it. */
  summary: string;
  /** Rewrites per file, keyed by the path relative to the roadmap directory. */
  files: Record<string, Rewrite>;
}

/** Replace whole lines that match `pattern` exactly. */
function lines(text: string, pattern: RegExp, replace: (match: RegExpExecArray) => string): string {
  return text
    .split("\n")
    .map((line) => {
      const match = pattern.exec(line);
      return match ? replace(match) : line;
    })
    .join("\n");
}

/** The command 2.0.0's template writes. Frozen here rather than imported:
 * a migration catches up with what one release wrote, and a later change to
 * the command gets a migration of its own. */
const NPX = "npx --no -- roadmap";

/** Oldest first. Each runs on the text the ones before it left. */
export const MIGRATIONS: Migration[] = [
  {
    id: "cli-command",
    since: "2.0.0",
    summary: `the CLI runs as \`${NPX}\`, not \`python …/roadmap.py\``,
    files: {
      "README.md": (text) =>
        lines(
          lines(text, /^python (\S*roadmap\.py)( .*)?$/, (m) => `${NPX}${m[2] ?? ""}`),
          /^`\S*roadmap\.py`, so don't edit it by hand\.$/,
          () => `\`${NPX}\`, so don't edit it by hand.`,
        ),
      "roadmap.toml": (text) =>
        lines(
          text,
          /^# Roadmap configuration, read by roadmap\.py\.$/,
          () => "# Roadmap configuration, read by the roadmap CLI.",
        ),
    },
  },
];

export interface Planned {
  /** The file, as a path the CLI can open (under `rm.dir`). */
  path: string;
  /** Its text once every migration has run. */
  text: string;
  /** The migrations that changed it, in the order they ran. */
  migrations: Migration[];
}

/** What every migration would change, computed without writing anything.
 * `update --dry-run` prints this; a real `update` writes it. */
export function planMigrations(rm: Roadmap, migrations: Migration[] = MIGRATIONS): Planned[] {
  const planned = new Map<string, Planned & { original: string }>();
  for (const migration of migrations) {
    for (const [name, rewrite] of Object.entries(migration.files)) {
      const path = join(rm.dir, name);
      guardPath(rm, path, migration);
      const entry = planned.get(path);
      if (entry === undefined && !isFile(path)) continue;
      const before = entry ? entry.text : readText(path);
      const after = rewrite(before);
      if (after === before) continue;
      guardBlocks(path, before, after, migration);
      if (entry) {
        entry.text = after;
        entry.migrations.push(migration);
      } else {
        planned.set(path, { path, original: before, text: after, migrations: [migration] });
      }
    }
  }
  return [...planned.values()]
    .filter((p) => p.text !== p.original)
    .map(({ path, text, migrations }) => ({ path, text, migrations }));
}

function guardPath(rm: Roadmap, path: string, migration: Migration): void {
  const rel = relative(rm.dir, path);
  const outside = rel.startsWith("..") || rel === "";
  if (outside || rel === "decisions.md" || rel === "archive" || rel.startsWith(`archive${sep}`)) {
    throw new Error(`migration ${migration.id} targets ${path}, which migrations never touch`);
  }
}

function guardBlocks(path: string, before: string, after: string, migration: Migration): void {
  for (const [begin, end] of [
    [INDEX_BEGIN, INDEX_END],
    [DONE_BEGIN, DONE_END],
  ] as const) {
    const was = blockSpan(before, begin, end);
    const is = blockSpan(after, begin, end);
    const block = (text: string, span: [number, number] | null) => (span ? text.slice(...span) : null);
    if (block(before, was) !== block(after, is)) {
      throw new Error(`migration ${migration.id} changes the generated block in ${path}`);
    }
  }
}
