/** Everything that asks git: `check --base`'s append-only rule, and the last
 * commit to each item, which `review` counts as a touch. */

import { execFileSync } from "node:child_process";
import { type Item, Problem, type Roadmap, UsageError } from "./model.ts";
import { exists, join, relpath, resolve } from "./pathlib.ts";
import { Day, readText, splitlines, universal } from "./py.ts";

export function git(cwd: string, ...args: string[]): string {
  try {
    return universal(execFileSync("git", args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }));
  } catch (exc) {
    const error = exc as NodeJS.ErrnoException & { stderr?: string; status?: number | null };
    if (error.code === "ENOENT") throw new UsageError("--base needs git on PATH");
    throw new UsageError(`git ${args.join(" ")} failed: ${String(error.stderr ?? "").trim()}`);
  }
}

const ARCHIVE_RULE = "archived entries only take added lines (dated annotations)";
const ARCHIVE_KEPT = "archived entries are never deleted or moved";
const DECISIONS_RULE = "decisions.md only takes added lines (new entries, dated annotations)";

/** Every archived entry that existed at `base` must still exist, and it may
 * only have gained lines. That leaves room for a dated annotation added under
 * a claim that later events falsified, and for nothing else. decisions.md is
 * held to the same rule, so a decision is reversed by a new entry. */
export function appendOnlyProblems(rm: Roadmap, base: string): Problem[] {
  const top = git(rm.dir, "rev-parse", "--show-toplevel").trim();
  const archive = relpath(resolve(rm.archiveDir), top);
  const decisions = relpath(resolve(rm.decisions), top);
  const problems: Problem[] = [];
  for (const rel of splitlines(git(top, "ls-tree", "-r", "--name-only", base, "--", archive, decisions))) {
    let shown: string;
    let rule: string;
    let kept: string;
    if (rel === decisions) {
      [shown, rule, kept] = [rm.decisions, DECISIONS_RULE, "a decision is reversed by a new entry"];
    } else if (rel.endsWith(".md")) {
      [shown, rule, kept] = [join(rm.archiveDir, relpath(rel, archive)), ARCHIVE_RULE, ARCHIVE_KEPT];
    } else continue;
    problems.push(...lostLines(top, rel, base, shown, rule, kept));
  }
  return problems;
}

/** The first change to `rel` since `base` that isn't an added line, if any. */
function lostLines(top: string, rel: string, base: string, shown: string, rule: string, whyKept: string): Problem[] {
  if (!exists(join(top, rel))) return [new Problem(shown, "append-only", `existed at ${base} and is gone; ${whyKept}`)];
  const old = splitlines(git(top, "show", `${base}:${rel}`));
  const now = splitlines(readText(join(top, rel)));
  for (const [tag, i1, i2] of opcodes(old, now)) {
    if (tag === "replace" || tag === "delete") {
      const lines = i2 - i1 === 1 ? `line ${i1 + 1}` : `lines ${i1 + 1}-${i2}`;
      return [new Problem(shown, "append-only", `changes ${lines} as of ${base}; ${rule}`, i1 + 1)];
    }
  }
  return [];
}

type Opcode = ["replace" | "delete" | "insert" | "equal", number, number, number, number];

/** `difflib.SequenceMatcher(None, a, b, autojunk=False).get_opcodes()`. The
 * line a problem points at is where this diff says the file changed, so the
 * port keeps difflib's matching rather than any other diff. */
export function opcodes(a: string[], b: string[]): Opcode[] {
  const b2j = new Map<string, number[]>();
  b.forEach((line, j) => {
    b2j.set(line, [...(b2j.get(line) ?? []), j]);
  });

  const longest = (alo: number, ahi: number, blo: number, bhi: number): [number, number, number] => {
    let [besti, bestj, bestsize] = [alo, blo, 0];
    let j2len = new Map<number, number>();
    for (let i = alo; i < ahi; i++) {
      const next = new Map<number, number>();
      for (const j of b2j.get(a[i] as string) ?? []) {
        if (j < blo) continue;
        if (j >= bhi) break;
        const k = (j2len.get(j - 1) ?? 0) + 1;
        next.set(j, k);
        if (k > bestsize) [besti, bestj, bestsize] = [i - k + 1, j - k + 1, k];
      }
      j2len = next;
    }
    while (besti > alo && bestj > blo && a[besti - 1] === b[bestj - 1]) {
      besti--;
      bestj--;
      bestsize++;
    }
    while (besti + bestsize < ahi && bestj + bestsize < bhi && a[besti + bestsize] === b[bestj + bestsize]) {
      bestsize++;
    }
    return [besti, bestj, bestsize];
  };

  const queue: [number, number, number, number][] = [[0, a.length, 0, b.length]];
  const blocks: [number, number, number][] = [];
  while (queue.length) {
    const [alo, ahi, blo, bhi] = queue.pop() as [number, number, number, number];
    const [i, j, k] = longest(alo, ahi, blo, bhi);
    if (k) {
      blocks.push([i, j, k]);
      if (alo < i && blo < j) queue.push([alo, i, blo, j]);
      if (i + k < ahi && j + k < bhi) queue.push([i + k, ahi, j + k, bhi]);
    }
  }
  blocks.sort((x, y) => x[0] - y[0] || x[1] - y[1] || x[2] - y[2]);

  const merged: [number, number, number][] = [];
  let [i1, j1, k1] = [0, 0, 0];
  for (const [i2, j2, k2] of blocks) {
    if (i1 + k1 === i2 && j1 + k1 === j2) k1 += k2;
    else {
      if (k1) merged.push([i1, j1, k1]);
      [i1, j1, k1] = [i2, j2, k2];
    }
  }
  if (k1) merged.push([i1, j1, k1]);
  merged.push([a.length, b.length, 0]);

  const answer: Opcode[] = [];
  let [i, j] = [0, 0];
  for (const [ai, bj, size] of merged) {
    const tag = i < ai && j < bj ? "replace" : i < ai ? "delete" : j < bj ? "insert" : null;
    if (tag) answer.push([tag, i, ai, j, bj]);
    [i, j] = [ai + size, bj + size];
    if (size) answer.push(["equal", ai, i, bj, j]);
  }
  return answer;
}

/** The date of the last commit that changed each item file, from one `git
 * log`, and a note when git can't say, in which case only the frontmatter
 * dates count. It is the author date: a rebase or a rebase-merge resets the
 * committer date, but the change is as old as it was. */
export function lastCommits(rm: Roadmap): [Map<string, Day>, string] {
  let top: string;
  let log: string;
  try {
    top = git(rm.dir, "rev-parse", "--show-toplevel").trim();
    log = git(top, "log", "--format=%x00%as", "--name-only", "--", resolve(rm.itemsDir));
  } catch (exc) {
    if (!(exc instanceof UsageError)) throw exc;
    return [new Map(), "Not in a git repository, so only filed and updated dates count as touches."];
  }
  const committed = new Map<string, Day>();
  let date: Day | null = null;
  for (const line of splitlines(log)) {
    if (line.startsWith("\0")) date = Day.fromIso(line.slice(1));
    else if (line && date) {
      const path = resolve(join(top, line));
      if (!committed.has(path)) committed.set(path, date);
    }
  }
  return [committed, ""];
}

export function committedDate(committed: Map<string, Day>, item: Item): Day | undefined {
  return committed.get(resolve(item.path));
}
