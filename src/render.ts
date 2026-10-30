/** The generated blocks: README.md's index of the open items, with its
 * Mermaid chart, and done.md's index of the archive. */

import { writeFileSync } from "node:fs";
import {
  BUCKET_TITLES,
  BUCKETS,
  DONE_BEGIN,
  DONE_END,
  INDEX_BEGIN,
  INDEX_END,
  type Item,
  load,
  type Milestone,
  Problem,
  type Roadmap,
  UsageError,
} from "./model.ts";
import { exists, name } from "./pathlib.ts";
import { cmp, len, readText, str, truthy } from "./py.ts";
import { awaited, byIdOf, dependsOn, due, isBucket } from "./rules.ts";

/** The README's index block, between its markers. There is one line per item, and
 * every one is read back out of the item files. `archived` is only consulted
 * to name the closed items that open ones depend on, and `milestones` to name
 * the milestones they wait on or are due for. */
export function renderIndex(
  items: Item[],
  archived: readonly Item[] = [],
  milestones: Map<string, Milestone> = new Map(),
): string {
  const byId = byIdOf([...items, ...archived]);
  const lines = [INDEX_BEGIN, ""];
  const graph = renderGraph(items, milestones);
  if (graph.length) lines.push(...graph, "");
  else if (items.length) lines.push("*No open item depends on another or on a milestone, so there is no chart.*", "");
  for (const bucket of BUCKETS) {
    const inBucket = items.filter((i) => i.bucket === bucket);
    lines.push(`### ${BUCKET_TITLES[bucket]} (${inBucket.length})`, "");
    if (!inBucket.length) {
      lines.push("*Empty.*", "");
      continue;
    }
    for (const item of inBucket) {
      lines.push(
        `${item.rank}. [${item.title}](items/${name(item.path)})` +
          ` — filed ${str(item.meta.filed)}${note(item, byId, milestones)}`,
      );
    }
    lines.push("");
  }
  lines.push(INDEX_END);
  return lines.join("\n");
}

/** A Mermaid flowchart of the open items, which GitHub renders in place:
 * one box per bucket, holding its items in rank order, and an arrow from each
 * dependency to the item that waits on it. A closed dependency is already
 * satisfied, so it draws no arrow. A milestone an open item names is a
 * hexagon outside the buckets, with arrows from the items due for it and to
 * the items that wait on it. Each label starts with the item's rank, and a
 * long title is shortened; the list below has it in full. An item nothing
 * holds up gets a thick border: it is not in Later and waits on no open item
 * and no milestone. A milestone counts as waiting even once its date has
 * passed, because telling would take today's date, which `check` never
 * reads. Later items get a dashed border. Nothing sets a colour, so the
 * chart reads in light and dark themes. A chart with no arrows would only
 * repeat the list as boxes, so it is left out. */
export function renderGraph(items: Item[], milestones: Map<string, Milestone> = new Map()): string[] {
  const queued = items.filter((i) => isBucket(i.bucket));
  const ids = new Set(queued.map((i) => i.id));
  const arrows = queued.flatMap((i) =>
    dependsOn(i)
      .filter((d) => ids.has(d) && d !== i.id)
      .map((d) => `  ${node(d)} --> ${node(i.id)}`),
  );
  const dueFor = queued.flatMap((i): [Item, Milestone][] => {
    const m = due(i, milestones);
    return m ? [[i, m]] : [];
  });
  const byId = byIdOf(items);
  const waits = queued.flatMap((i) => awaited(i, byId, milestones).map((m): [Item, Milestone] => [i, m]));
  if (!(arrows.length || dueFor.length || waits.length)) return [];
  const lines = ["```mermaid", "flowchart LR"];
  const buckets = BUCKETS.filter((b) => queued.some((i) => i.bucket === b));
  for (const bucket of buckets) {
    lines.push(`  subgraph b_${bucket} ["${BUCKET_TITLES[bucket]}"]`);
    for (const i of queued.filter((i) => i.bucket === bucket)) {
      lines.push(`    ${node(i.id)}["${i.rank} · ${label(short(i.title))}"]`);
    }
    lines.push("  end");
  }
  if (buckets.length > 1) lines.push(`  ${buckets.map((b) => `b_${b}`).join(" ~~~ ")}`); // invisible links keep the buckets in order
  lines.push(...arrows);
  const named = new Map([...dueFor, ...waits].map(([, m]) => [m.id, m]));
  for (const m of [...named.values()].sort((a, b) => cmp([a.date.ordinal, a.id], [b.date.ordinal, b.id]))) {
    lines.push(`  ${node(m.id, "m_")}{{"${label(String(m))}"}}`);
  }
  lines.push(...dueFor.map(([i, m]) => `  ${node(i.id)} --> ${node(m.id, "m_")}`));
  lines.push(...waits.map(([i, m]) => `  ${node(m.id, "m_")} --> ${node(i.id)}`));
  const waiting = new Set(
    queued.filter((i) => dependsOn(i).some((d) => byId.get(d) && !byId.get(d)?.archived)).map((i) => i.id),
  );
  for (const [i] of waits) waiting.add(i.id);
  const ready = queued.filter((i) => i.bucket !== "later" && !waiting.has(i.id)).map((i) => node(i.id));
  if (ready.length) lines.push("  classDef ready stroke-width: 3px", `  class ${ready.join(",")} ready`);
  const later = queued.filter((i) => i.bucket === "later").map((i) => node(i.id));
  if (later.length) lines.push("  classDef later stroke-dasharray: 5 5", `  class ${later.join(",")} later`);
  lines.push("```");
  return lines;
}

/** A Mermaid node id: `i_` for an item, `m_` for a milestone. The prefix
 * keeps a slug like `end` from being read as a keyword, and the two apart. */
function node(slug: string, prefix = "i_"): string {
  return prefix + slug.replaceAll("-", "_");
}

/** A title cut to fit a chart box, at a word break where there is one. */
export function short(title: string, limit = 40): string {
  if (len(title) <= limit) return title;
  const cut = Array.from(title)
    .slice(0, limit - 1)
    .join("");
  const word = cut.includes(" ") ? cut.slice(0, cut.lastIndexOf(" ")) : cut;
  return `${word.replace(/[ ,;:-]+$/, "")}…`;
}

/** A title as a quoted Mermaid label. `#` starts an entity code there, so it goes first. */
function label(title: string): string {
  for (const [char, code] of [
    ["#", "#35;"],
    ['"', "#quot;"],
    ["<", "#lt;"],
    [">", "#gt;"],
    ["`", "#96;"],
  ] as const) {
    title = title.replaceAll(char, code);
  }
  return title;
}

function note(item: Item, byId: Map<string, Item>, milestones: Map<string, Milestone>): string {
  let text = "";
  const { blocked_on: blocked, gate } = item.meta;
  if (truthy(blocked)) text = `<br>  **Blocked on:** ${str(blocked)}`;
  else if (truthy(gate)) text = `<br>  **Gate:** ${str(gate)}`;
  const mid = item.meta.milestone;
  if (typeof mid === "string") text += `<br>  **Due for:** ${String(milestones.get(mid) ?? mid)}`;
  const deps = dependsOn(item);
  if (deps.length) text += `<br>  **Depends on:** ${deps.map((d) => dependency(d, byId, milestones)).join(", ")}`;
  const oldId = item.meta.supersedes;
  if (typeof oldId === "string") text += `<br>  **Supersedes:** ${dependency(oldId, byId, milestones)}`;
  return text;
}

/** One dependency in the index: an item, linked, or a milestone. The index
 * is rendered before anything is validated, so an id that names nothing is
 * shown as it is, unlinked. */
function dependency(depId: string, byId: Map<string, Item>, milestones: Map<string, Milestone>): string {
  const dep = byId.get(depId);
  if (dep === undefined) return String(milestones.get(depId) ?? depId);
  if (dep.archived) return `[${dep.title}](archive/${name(dep.path)}) (${str(dep.meta.outcome)})`;
  return `[${dep.title}](items/${name(dep.path)})`;
}

/** done.md's block: one line per closed item, newest first, grouped by the
 * month it closed. Each line is short enough to grep, and it links to the full
 * entry. A declined item that another item tries again links to it, so a
 * search that finds the old idea finds the new attempt too. `items` are the
 * open items, consulted only for that.
 *
 * Milestones the archive names are listed first, newest first, with what
 * shipped for them, and each closed line names its milestone, so a passed
 * milestone stays readable as history. One roadmap.toml no longer declares
 * shows as its bare id, after the declared ones. */
export function renderDone(
  archived: Item[],
  items: readonly Item[] = [],
  milestones: Map<string, Milestone> = new Map(),
): string {
  const retries = new Map<string, Item[]>();
  for (const other of [...items, ...archived]) {
    const oldId = other.meta.supersedes;
    if (typeof oldId === "string") retries.set(oldId, [...(retries.get(oldId) ?? []), other]);
  }
  const lines = [DONE_BEGIN, ""];
  if (!archived.length) lines.push("*Empty.*", "");
  const named = doneMilestones(archived, milestones);
  if (named.size) {
    lines.push(`### Milestones (${named.size})`, "");
    for (const [mid, group] of named) {
      const counts = (["shipped", "declined"] as const)
        .map((o) => [group.filter((i) => str(i.meta.outcome) === o).length, o] as const)
        .filter(([n]) => n)
        .map(([n, o]) => `${n} ${o}`)
        .join(", ");
      const m = milestones.get(mid);
      lines.push(`- **${m ? m.title : mid}**${m ? ` — ${m.date}` : ""}: ${counts}`);
    }
    lines.push("");
  }
  const groups = new Map<string, Item[]>();
  for (const item of archived) {
    const month = Array.from("closed" in item.meta ? str(item.meta.closed) : "undated")
      .slice(0, 7)
      .join("");
    groups.set(month, [...(groups.get(month) ?? []), item]);
  }
  for (const [month, group] of groups) {
    lines.push(`### ${month} (${group.length})`, "");
    for (const item of group) {
      const shippedAs = truthy(item.meta.shipped_as) ? ` as \`${str(item.meta.shipped_as)}\`` : "";
      let superseded = "";
      const by = retries.get(item.id);
      if (item.meta.outcome === "declined" && by?.length) {
        const linked = by.map((o) => `[${o.title}](${o.archived ? "archive" : "items"}/${name(o.path)})`);
        superseded = ` — superseded by ${linked.join(", ")}`;
      }
      const mid = item.meta.milestone;
      const dueFor = typeof mid === "string" ? ` — for ${String(milestones.get(mid) ?? mid)}` : "";
      lines.push(
        `- **${str(item.meta.outcome)}** [${item.title}](archive/${name(item.path)})` +
          ` — closed ${str(item.meta.closed)}${shippedAs}${dueFor}${superseded}`,
      );
    }
    lines.push("");
  }
  lines.push(DONE_END);
  return lines.join("\n");
}

/** The milestones closed items were due for, each with those items: the
 * declared ones newest first, then any roadmap.toml no longer declares, by id. */
function doneMilestones(archived: Item[], milestones: Map<string, Milestone>): Map<string, Item[]> {
  const named = new Map<string, Item[]>();
  for (const item of archived) {
    const mid = item.meta.milestone;
    if (typeof mid === "string") named.set(mid, [...(named.get(mid) ?? []), item]);
  }
  const keys = [...named.keys()];
  const declared = keys
    .filter((mid) => milestones.has(mid))
    .sort((a, b) => {
      const [x, y] = [milestones.get(a) as Milestone, milestones.get(b) as Milestone];
      return cmp([y.date.ordinal, b], [x.date.ordinal, a]);
    });
  const undeclared = keys.filter((mid) => !milestones.has(mid)).sort((a, b) => cmp([a], [b]));
  return new Map([...declared, ...undeclared].map((mid) => [mid, named.get(mid) as Item[]]));
}

/** Where the generated block sits in `text`, markers included, or null if
 * the markers are missing. The begin marker is matched by its prefix
 * (`<!-- BEGIN INDEX`), so older wording still counts. */
export function blockSpan(text: string, begin: string, end: string): [number, number] | null {
  const prefix = (begin.split(":")[0] ?? begin).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const opening = new RegExp(`${prefix}.*?-->`).exec(text);
  const stop = opening ? text.indexOf(end, opening.index + opening[0].length) : -1;
  return opening && stop !== -1 ? [opening.index, stop + end.length] : null;
}

/** `text` with the block between the markers replaced, markers included. It
 * refuses a file that is missing the markers rather than guessing where the
 * block goes. A marker in older wording is rewritten, not rejected. */
export function splice(text: string, begin: string, end: string, block: string, path: string): string {
  const span = blockSpan(text, begin, end);
  if (span === null) throw new UsageError(`${path}: generated-block markers not found; expected ${begin} ... ${end}`);
  return text.slice(0, span[0]) + block + text.slice(span[1]);
}

function generatedTargets(rm: Roadmap, items: Item[], archived: Item[]): [string, string, string, string][] {
  return [
    [rm.readme, INDEX_BEGIN, INDEX_END, renderIndex(items, archived, rm.milestones)],
    [rm.done, DONE_BEGIN, DONE_END, renderDone(archived, items, rm.milestones)],
  ];
}

export function generatedProblems(rm: Roadmap, items: Item[], archived: Item[]): Problem[] {
  const problems: Problem[] = [];
  for (const [path, begin, end, block] of generatedTargets(rm, items, archived)) {
    if (!exists(path)) {
      problems.push(new Problem(path, "generated", "is missing; `roadmap.py init` writes one"));
      continue;
    }
    const text = readText(path);
    let stale: boolean;
    try {
      stale = text !== splice(text, begin, end, block, path);
    } catch (exc) {
      if (!(exc instanceof UsageError)) throw exc;
      problems.push(new Problem(path, "generated", `markers not found; expected ${begin} ... ${end}`));
      continue;
    }
    if (stale) problems.push(new Problem(path, "generated", "generated block is stale; run `roadmap.py index`"));
  }
  return problems;
}

/** Regenerate README.md's index and done.md. Returns the files that changed. */
export function writeGenerated(rm: Roadmap): string[] {
  const [items, archived] = load(rm);
  const written: string[] = [];
  for (const [path, begin, end, block] of generatedTargets(rm, items, archived)) {
    const text = readText(path);
    const updated = splice(text, begin, end, block, path);
    if (updated !== text) {
      writeFileSync(path, updated);
      written.push(path);
    }
  }
  return written;
}
