/** Writing frontmatter: new item files, and in-place edits to existing ones
 * that leave every other line alone. */

import { TomlError } from "smol-toml";
import { FRONTMATTER, type Meta, parseTomlMeta, tomlReason, UsageError } from "./model.ts";
import { Day, eq, isInt, readText, repr } from "./py.ts";

export function toml(value: unknown): string {
  if (typeof value === "boolean") return value ? "true" : "false";
  if (isInt(value) || value instanceof Day) return String(value);
  if (typeof value === "string") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(toml).join(", ")}]`;
  throw new TypeError(`no TOML rendering for ${repr(value)}`);
}

const TOP_LEVEL_KEY = /^\s*([A-Za-z0-9_-]+)\s*=/;

/** The file's text with top-level frontmatter keys removed or set. All other
 * lines are left alone, including comments and tables. The edit is parsed back
 * and checked, so a layout it cannot handle safely (such as a multi-line
 * value) is refused rather than mangled. */
export function editFrontmatter(
  path: string,
  { remove = new Set<string>(), assign = {} }: { remove?: Set<string>; assign?: Meta } = {},
): string {
  const text = readText(path);
  const match = FRONTMATTER.exec(text);
  if (match === null) throw new UsageError(`${path}: no +++-fenced TOML frontmatter at the top of the file`);
  const lines = (match[1] ?? "").split("\n");
  const found = lines.findIndex((line) => line.trimStart().startsWith("["));
  const cut = found === -1 ? lines.length : found;
  const [top, tables] = [lines.slice(0, cut), lines.slice(cut)];

  const kept: string[] = [];
  const pending = new Map(Object.entries(assign));
  for (const line of top) {
    const key = TOP_LEVEL_KEY.exec(line)?.[1];
    if (key !== undefined && remove.has(key)) continue;
    if (key !== undefined && pending.has(key)) {
      kept.push(`${key} = ${toml(pending.get(key))}`);
      pending.delete(key);
    } else kept.push(line);
  }
  while (kept.length && !kept[kept.length - 1]?.trim()) kept.pop();
  for (const [key, value] of pending) kept.push(`${key} = ${toml(value)}`);
  if (tables.length) kept.push("");

  const head = [...kept, ...tables].join("\n");
  let meta: Meta;
  try {
    meta = parseTomlMeta(head);
  } catch (exc) {
    if (!(exc instanceof TomlError)) throw exc;
    throw new UsageError(`${path}: could not edit the frontmatter safely (${tomlReason(exc)}); edit it by hand`);
  }
  if ([...remove].some((k) => k in meta) || Object.entries(assign).some(([k, v]) => !eq(meta[k], v))) {
    throw new UsageError(`${path}: could not edit the frontmatter safely; edit it by hand`);
  }
  return `+++\n${head}\n+++\n${match[2] ?? ""}`;
}

/** A new item file: the frontmatter, any refs as a table under it, then the prose. */
export function itemText(meta: Meta, refs: Record<string, unknown[]>, body: string): string {
  const lines = ["+++", ...Object.entries(meta).map(([k, v]) => `${k} = ${toml(v)}`)];
  if (Object.keys(refs).length) {
    lines.push("", "[refs]", ...Object.entries(refs).map(([k, vs]) => `${k} = [${vs.map(toml).join(", ")}]`));
  }
  return [...lines, "+++", "", body, ""].join("\n");
}
