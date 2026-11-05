/** Migrations `update` runs on a roadmap's files, the way OpenSpec's `update`
 * brings a project written by an older version up to date. A migration never
 * asks which version wrote the files: it looks for the exact text an older
 * template wrote and rewrites only that, so it leaves text a user edited
 * alone, and a second run finds nothing to change. Installed version stamps
 * can't answer the question anyway: a symlinked or 1.x install has none, and
 * two tool directories can disagree.
 *
 * Migrations never touch what the roadmap holds append-only (`archive/` and
 * decisions.md's entries; its intro may change) or the generated blocks,
 * which `update` regenerates afterwards. A change to any of those is a bug in
 * the migration, and throws. */

import { join, relative, sep } from "node:path";
import { DECISIONS_INTROS, GUIDING_MASK, INDEX_MASK, README_SECTIONS } from "./legacy.ts";
import { DECISIONS_INTRO, DONE_BEGIN, DONE_END, entriesStart, INDEX_BEGIN, INDEX_END, type Roadmap } from "./model.ts";
import { PACKAGE_ROOT, templateText } from "./package.ts";
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
  {
    id: "template-sections",
    since: "2.1.0",
    summary: "sections an older template wrote are replaced with today's",
    files: { "README.md": (text) => templateSections(text) },
  },
  {
    id: "decisions-intro",
    since: "2.1.0",
    summary: "the intro above the first decision is replaced with today's",
    files: { "decisions.md": (text) => decisionsIntro(text) },
  },
];

/** README.md split at its `#`, `##` and `###` headings. Each section runs
 * from its heading to the line before the next one, so joining them with
 * "\n" gives the text back. Text before the first heading has no heading. */
function sections(text: string): { head: string | null; body: string }[] {
  const out: { head: string | null; lines: string[] }[] = [];
  for (const line of text.split("\n")) {
    if (/^#{1,3} /.test(line) || !out.length) out.push({ head: /^#{1,3} /.test(line) ? line : null, lines: [] });
    (out.at(-1) as { lines: string[] }).lines.push(line);
  }
  return out.map(({ head, lines }) => ({ head, body: lines.join("\n") }));
}

/** The guiding-principle paragraph: up to the blank line after it, or the
 * newline that ends its section. */
const GUIDING = /^\*\*Guiding principle:\*\*[\s\S]*?(?=\n\n|\n?(?![\s\S]))/m;

/** A section with the parts a user owns (the generated index and the guiding
 * principle) swapped for masks, and what each mask stood for. */
function masked(body: string): { text: string; parts: Map<string, string> } {
  const parts = new Map<string, string>();
  let text = body;
  const span = blockSpan(text, INDEX_BEGIN, INDEX_END);
  if (span) {
    parts.set(INDEX_MASK, text.slice(...span));
    text = text.slice(0, span[0]) + INDEX_MASK + text.slice(span[1]);
  }
  const guiding = GUIDING.exec(text);
  if (guiding) {
    parts.set(GUIDING_MASK, guiding[0]);
    text = text.slice(0, guiding.index) + GUIDING_MASK + text.slice(guiding.index + guiding[0].length);
  }
  return { text, parts };
}

/** Today's template sections, masked, keyed by heading. */
function currentSections(): Map<string, string> {
  const template = templateText(readText(join(PACKAGE_ROOT, "assets", "template", "README.md")));
  return new Map(
    sections(template)
      .filter((s) => s.head !== null)
      .map((s) => [s.head as string, masked(s.body).text]),
  );
}

/** Replace each section that is exactly what an older template wrote with
 * today's, keeping the user's index and guiding principle. A section the
 * user edited matches nothing, and is left alone. */
function templateSections(text: string): string {
  const current = currentSections();
  return sections(text)
    .map(({ head, body }) => {
      const now = head === null ? undefined : current.get(head);
      const old = head === null ? undefined : README_SECTIONS[head];
      if (now === undefined || old === undefined) return body;
      const { text: was, parts } = masked(body);
      if (!old.includes(was)) return body;
      const masks = [INDEX_MASK, GUIDING_MASK];
      if (masks.some((m) => was.includes(m) !== now.includes(m))) return body;
      return masks.reduce((t, m) => (parts.has(m) ? t.replace(m, parts.get(m) as string) : t), now);
    })
    .join("\n");
}

/** Replace an intro an older template wrote with today's. */
function decisionsIntro(text: string): string {
  const at = entriesStart(text);
  const intro = text.slice(0, at);
  if (!DECISIONS_INTROS.some((old) => old.trimEnd() === intro.trimEnd())) return text;
  const gap = intro.slice(intro.trimEnd().length);
  return DECISIONS_INTRO.trimEnd() + gap + text.slice(at);
}

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
  if (outside || rel === "archive" || rel.startsWith(`archive${sep}`)) {
    throw new Error(`migration ${migration.id} targets ${path}, which migrations never touch`);
  }
}

function guardBlocks(path: string, before: string, after: string, migration: Migration): void {
  if (path.endsWith(`${sep}decisions.md`) || path === "decisions.md") {
    if (before.slice(entriesStart(before)) !== after.slice(entriesStart(after))) {
      throw new Error(`migration ${migration.id} changes an entry in ${path}, which migrations never touch`);
    }
    return;
  }
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
