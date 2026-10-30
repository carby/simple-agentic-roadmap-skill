/** Paths as plain strings, joined and printed the way Python's `pathlib.Path`
 * does: `roadmap/items/x.md`, never `./roadmap/items/x.md/`. Problems print
 * their path, so this decides what every message looks like. */

import { existsSync, lstatSync, realpathSync, statSync } from "node:fs";
import { posix } from "node:path";

/** `Path(a) / b / c`: an absolute part restarts the path, and `.` parts,
 * repeated slashes and a trailing slash go. `..` stays, as in pathlib. */
export function join(...parts: string[]): string {
  let out: string[] = [];
  let absolute = false;
  for (const part of parts) {
    if (part.startsWith("/")) {
      out = [];
      absolute = true;
    }
    out.push(...part.split("/").filter((p) => p && p !== "."));
  }
  const text = out.join("/");
  return absolute ? `/${text}` : text || ".";
}

/** `os.path.normpath`, which also folds `..` away. */
export function normpath(path: string): string {
  const normal = posix.normalize(path);
  return normal.length > 1 ? normal.replace(/\/$/, "") : normal;
}

export function name(path: string): string {
  const base = join(path);
  return base === "." ? "" : base.slice(base.lastIndexOf("/") + 1);
}

export function stem(path: string): string {
  const base = name(path);
  const dot = base.lastIndexOf(".");
  return dot > 0 ? base.slice(0, dot) : base;
}

export function suffix(path: string): string {
  const base = name(path);
  const dot = base.lastIndexOf(".");
  return dot > 0 ? base.slice(dot) : "";
}

export function parent(path: string): string {
  const base = join(path);
  const slash = base.lastIndexOf("/");
  if (slash === -1) return ".";
  return slash === 0 ? "/" : base.slice(0, slash);
}

/** `Path.resolve()`: absolute, with symlinks followed as far as the path exists. */
export function resolve(path: string): string {
  const absolute = posix.resolve(path);
  try {
    return realpathSync(absolute);
  } catch {
    const up = posix.dirname(absolute);
    return up === absolute ? absolute : posix.join(resolve(up), posix.basename(absolute));
  }
}

/** `os.path.relpath(path, start)`. */
export function relpath(path: string, start: string): string {
  return posix.relative(posix.resolve(start), posix.resolve(path)) || ".";
}

export function exists(path: string): boolean {
  return existsSync(path);
}

export function lexists(path: string): boolean {
  try {
    lstatSync(path);
    return true;
  } catch {
    return false;
  }
}

export function isDir(path: string): boolean {
  try {
    return statSync(path).isDirectory();
  } catch {
    return false;
  }
}

export function isFile(path: string): boolean {
  try {
    return statSync(path).isFile();
  } catch {
    return false;
  }
}
