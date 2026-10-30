/** The command line, parsed the way argparse parsed it for roadmap.py: the
 * same commands, options, defaults and dests, unique-prefix abbreviations,
 * and errors printed after a usage line with exit status 2. */

import {
  type Args,
  cmdCheck,
  cmdClose,
  cmdDecide,
  cmdIndex,
  cmdList,
  cmdMergeDriver,
  cmdMove,
  cmdNew,
  cmdReview,
  cmdSplit,
  err,
  out,
} from "./commands.ts";
import { BUCKETS, OUTCOMES, openRoadmap, type Roadmap, UsageError, VERSION } from "./model.ts";
import { Day, repr } from "./py.ts";

const PROG = "roadmap.py";
const DESCRIPTION = "A Now/Next/Later roadmap kept as one Markdown file per item, checked in CI.";

type Option = {
  flag: string;
  dest: string;
  kind?: "value" | "flag" | "append";
  type?: (text: string) => unknown;
  choices?: readonly string[];
  required?: boolean;
  default?: unknown;
  metavar?: string;
  help?: string;
};

type Positional = { dest: string; optional?: boolean; help?: string };

type Command = {
  help: string;
  run: (rm: Roadmap | null, args: Args) => number;
  options: Option[];
  positionals?: Positional[];
  exclusive?: [string, string];
};

class ArgumentError extends Error {}

function rank(text: string): number {
  if (!/^[0-9]+$/.test(text) || Number(text) < 1) throw new ArgumentError(`${repr(text)} is not a positive integer`);
  return Number(text);
}

function date(text: string): Day {
  const day = Day.fromIso(text);
  if (day === null) throw new ArgumentError(`${repr(text)} is not a YYYY-MM-DD date`);
  return day;
}

const DIR: Option = {
  flag: "--dir",
  dest: "dir",
  default: "roadmap",
  help: "the roadmap directory (default: roadmap)",
};
const DATE: Option = { flag: "--date", dest: "date", type: date, help: "use this date instead of today (YYYY-MM-DD)" };
const BLOCKED_ON: Option = {
  flag: "--blocked-on",
  dest: "blocked_on",
  help: "the undecided question (required for 'later', unless it depends on a 'later' item)",
};

export const COMMANDS: Record<string, Command> = {
  check: {
    help: "validate everything; exit 1 on any problem (for CI)",
    run: (rm, args) => cmdCheck(rm as Roadmap, args),
    options: [
      DIR,
      { flag: "--base", dest: "base", help: "git ref to hold archive/ append-only against, e.g. origin/main" },
    ],
  },
  review: {
    help: "list passed milestones and stale Now/Next items; uses today's date, so never for CI",
    run: (rm, args) => cmdReview(rm as Roadmap, args),
    options: [
      DIR,
      DATE,
      {
        flag: "--days",
        dest: "days",
        type: rank,
        default: 60,
        help: "how long untouched counts as stale (default: 60)",
      },
    ],
  },
  index: {
    help: "validate, then regenerate README.md's index and done.md",
    run: (rm, args) => cmdIndex(rm as Roadmap, args),
    options: [
      DIR,
      {
        flag: "--renumber",
        dest: "renumber",
        kind: "flag",
        help: "first number each bucket 1, 2, 3... in its current order",
      },
    ],
  },
  "merge-driver": {
    help: "git merge driver for README.md and done.md (see .gitattributes)",
    run: cmdMergeDriver,
    options: [],
    positionals: [
      { dest: "base", help: "%O" },
      { dest: "ours", help: "%A; the result is written here" },
      { dest: "theirs", help: "%B" },
      { dest: "path", optional: true, help: "%P, the file's path in the repo" },
    ],
  },
  new: {
    help: "file a new item",
    run: (rm, args) => cmdNew(rm as Roadmap, args),
    positionals: [{ dest: "id", help: "kebab-case slug; becomes items/<id>.md" }],
    options: [
      DIR,
      DATE,
      { flag: "--title", dest: "title", required: true },
      { flag: "--bucket", dest: "bucket", required: true, choices: BUCKETS },
      BLOCKED_ON,
      { flag: "--gate", dest: "gate", help: "the bar the work has to clear" },
      {
        flag: "--milestone",
        dest: "milestone",
        metavar: "ID",
        help: "a milestone from roadmap.toml that the item is due for",
      },
      {
        flag: "--depends-on",
        dest: "depends_on",
        kind: "append",
        metavar: "ID",
        help: "repeatable; an item or milestone that comes first",
      },
      { flag: "--supersedes", dest: "supersedes", metavar: "ID", help: "the declined item this one tries again" },
      { flag: "--ref", dest: "ref", kind: "append", metavar: "KIND:VALUE", help: "repeatable, e.g. files:src/app.py" },
      { flag: "--body", dest: "body", help: "the prose; a placeholder that fails `check` otherwise" },
    ],
  },
  split: {
    help: "add a sibling below an item that turned out to be two pieces of work",
    run: (rm, args) => cmdSplit(rm as Roadmap, args),
    positionals: [
      { dest: "id", help: "the open item to split; it keeps one part" },
      { dest: "new_id", help: "kebab-case slug for the other part; becomes items/<new_id>.md" },
    ],
    options: [
      DIR,
      DATE,
      { flag: "--title", dest: "title", required: true },
      { flag: "--body", dest: "body", help: "the new item's prose; a placeholder that fails `check` otherwise" },
    ],
  },
  list: {
    help: "print the open items in queue order (--json for scripts)",
    run: (rm, args) => cmdList(rm as Roadmap, args),
    options: [
      DIR,
      { flag: "--bucket", dest: "bucket", choices: BUCKETS },
      { flag: "--json", dest: "json", kind: "flag", help: "the full frontmatter and path of each item, as JSON" },
    ],
  },
  move: {
    help: "move an item to another bucket or rank: by default above its dependents there, else at the bottom",
    run: (rm, args) => cmdMove(rm as Roadmap, args),
    positionals: [{ dest: "id" }],
    options: [
      DIR,
      DATE,
      {
        flag: "--bucket",
        dest: "bucket",
        choices: BUCKETS,
        help: "default: the --above item's bucket, else the item's own",
      },
      { flag: "--rank", dest: "rank", type: rank, help: "the rank to take, shifting the items in between" },
      { flag: "--above", dest: "above", metavar: "ID", help: "land directly above this open item" },
      BLOCKED_ON,
    ],
    exclusive: ["--rank", "--above"],
  },
  decide: {
    help: "append a decision that belongs to no single item to decisions.md",
    run: (rm, args) => cmdDecide(rm as Roadmap, args),
    options: [
      DIR,
      DATE,
      { flag: "--title", dest: "title", required: true, help: "the decision, in one line" },
      { flag: "--body", dest: "body", required: true, help: "why, and what it rules out" },
    ],
  },
  close: {
    help: "archive an item that shipped or was declined",
    run: (rm, args) => cmdClose(rm as Roadmap, args),
    positionals: [{ dest: "id" }],
    options: [
      DIR,
      DATE,
      { flag: "--outcome", dest: "outcome", required: true, choices: OUTCOMES },
      { flag: "--as", dest: "shipped_as", help: "what it shipped as: a change, PR or release name" },
    ],
  },
};

class Exit {
  readonly code: number;

  constructor(code: number) {
    this.code = code;
  }
}

function metavar(option: Option): string {
  if (option.choices) return `{${option.choices.join(",")}}`;
  return option.metavar ?? option.dest.toUpperCase();
}

function usage(command?: string): string {
  if (command === undefined) return `usage: ${PROG} [-h] [--version] command ...`;
  const spec = COMMANDS[command] as Command;
  const parts = ["[-h]"];
  for (const option of spec.options) {
    const shown = option.kind === "flag" ? option.flag : `${option.flag} ${metavar(option)}`;
    parts.push(option.required ? shown : `[${shown}]`);
  }
  for (const positional of spec.positionals ?? [])
    parts.push(positional.optional ? `[${positional.dest}]` : positional.dest);
  return `usage: ${PROG} ${command} ${parts.join(" ")}`;
}

function fail(message: string, command?: string): never {
  err(usage(command));
  err(`${command === undefined ? PROG : `${PROG} ${command}`}: error: ${message}`);
  throw new Exit(2);
}

function help(command?: string): never {
  const lines = [usage(command), ""];
  if (command === undefined) {
    lines.push(DESCRIPTION, "", "positional arguments:", "  command");
    for (const [name, spec] of Object.entries(COMMANDS)) lines.push(`    ${name.padEnd(14)}${spec.help}`);
    lines.push(
      "",
      "options:",
      "  -h, --help    show this help message and exit",
      "  --version     show program's version number and exit",
    );
  } else {
    const spec = COMMANDS[command] as Command;
    if (spec.positionals?.length) {
      lines.push("positional arguments:");
      for (const p of spec.positionals) lines.push(`  ${p.dest.padEnd(22)}${p.help ?? ""}`);
      lines.push("");
    }
    lines.push("options:", `  ${"-h, --help".padEnd(22)}show this help message and exit`);
    for (const o of spec.options) {
      const shown = o.kind === "flag" ? o.flag : `${o.flag} ${metavar(o)}`;
      lines.push(`  ${shown.padEnd(22)}${o.help ?? ""}`);
    }
  }
  out(lines.join("\n"));
  throw new Exit(0);
}

/** Whether argparse would read `arg` as an option rather than a value. */
function looksLikeOption(arg: string): boolean {
  return arg.startsWith("-") && arg !== "-" && !/^-\d+$|^-\d*\.\d+$/.test(arg) && !arg.includes(" ");
}

function findOption(spec: Command, flag: string, command: string): Option | "help" {
  if (flag === "-h" || flag === "--help") return "help";
  const exact = spec.options.find((o) => o.flag === flag);
  if (exact) return exact;
  const prefixed = [...spec.options.map((o) => o.flag), "--help"].filter(
    (f) => flag.startsWith("--") && f.startsWith(flag),
  );
  if (prefixed.length === 1) {
    return prefixed[0] === "--help" ? "help" : (spec.options.find((o) => o.flag === prefixed[0]) as Option);
  }
  if (prefixed.length > 1) fail(`ambiguous option: ${flag} could match ${prefixed.join(", ")}`, command);
  fail(`unrecognized arguments: ${flag}`);
}

function convert(option: Option, text: string, command: string): unknown {
  if (option.choices && !option.choices.includes(text)) {
    fail(
      `argument ${option.flag}: invalid choice: ${repr(text)} (choose from ${option.choices.map(repr).join(", ")})`,
      command,
    );
  }
  if (!option.type) return text;
  try {
    return option.type(text);
  } catch (exc) {
    if (exc instanceof ArgumentError) fail(`argument ${option.flag}: ${exc.message}`, command);
    throw exc;
  }
}

/** The parsed arguments, with `command` set, or an Exit carrying the status. */
export function parseArgs(argv: string[]): Args {
  const index = 0;
  while (index < argv.length && looksLikeOption(argv[index] as string)) {
    const arg = argv[index] as string;
    const flag = arg === "-h" ? "--help" : ["--help", "--version"].find((f) => arg.length > 2 && f.startsWith(arg));
    if (flag === "--help") help();
    if (flag === "--version") {
      out(`${PROG} ${VERSION}`);
      throw new Exit(0);
    }
    fail(`unrecognized arguments: ${arg}`);
  }
  const command = argv[index];
  if (command === undefined) fail("the following arguments are required: command");
  const spec = COMMANDS[command];
  if (spec === undefined) {
    fail(`argument command: invalid choice: ${repr(command)} (choose from ${Object.keys(COMMANDS).join(", ")})`);
  }

  const args: Args = { command };
  for (const option of spec.options) {
    args[option.dest] = option.kind === "flag" ? false : option.kind === "append" ? [] : (option.default ?? null);
  }
  for (const positional of spec.positionals ?? []) args[positional.dest] = null;
  const seen: Option[] = [];
  const positionals: string[] = [];
  const rest = argv.slice(index + 1);
  let onlyPositionals = false;
  for (let i = 0; i < rest.length; i++) {
    const arg = rest[i] as string;
    if (onlyPositionals || !looksLikeOption(arg)) {
      positionals.push(arg);
      continue;
    }
    if (arg === "--") {
      onlyPositionals = true;
      continue;
    }
    const [flag, inline] = arg.includes("=")
      ? [arg.slice(0, arg.indexOf("=")), arg.slice(arg.indexOf("=") + 1)]
      : [arg];
    const option = findOption(spec, flag as string, command);
    if (option === "help") help(command);
    const other = spec.exclusive?.find((f) => f !== option.flag);
    if (spec.exclusive?.includes(option.flag) && seen.some((o) => o.flag === other)) {
      fail(`argument ${option.flag}: not allowed with argument ${other}`, command);
    }
    seen.push(option);
    if (option.kind === "flag") {
      if (inline !== undefined) fail(`argument ${option.flag}: ignored explicit argument ${repr(inline)}`, command);
      args[option.dest] = true;
      continue;
    }
    let value = inline;
    if (value === undefined) {
      const next = rest[i + 1];
      if (next === undefined || looksLikeOption(next)) fail(`argument ${option.flag}: expected one argument`, command);
      value = next;
      i++;
    }
    const converted = convert(option, value, command);
    if (option.kind === "append") args[option.dest].push(converted);
    else args[option.dest] = converted;
  }

  const wanted = spec.positionals ?? [];
  const missing = [
    ...wanted.filter((p, i) => !p.optional && i >= positionals.length).map((p) => p.dest),
    ...spec.options.filter((o) => o.required && !seen.includes(o)).map((o) => o.flag),
  ];
  if (missing.length) fail(`the following arguments are required: ${missing.join(", ")}`, command);
  wanted.forEach((p, i) => {
    if (i < positionals.length) args[p.dest] = positionals[i];
  });
  if (positionals.length > wanted.length) fail(`unrecognized arguments: ${positionals.slice(wanted.length).join(" ")}`);
  return args;
}

export function main(argv: string[]): number {
  let args: Args;
  try {
    args = parseArgs(argv);
  } catch (exc) {
    if (exc instanceof Exit) return exc.code;
    throw exc;
  }
  const spec = COMMANDS[args.command] as Command;
  try {
    return spec.run("dir" in args ? openRoadmap(args.dir) : null, args);
  } catch (exc) {
    if (exc instanceof UsageError) {
      err(`error: ${exc.message}`);
      return 2;
    }
    throw exc;
  }
}
