/** The few Python behaviours the CLI's output depends on. The TypeScript port
 * has to print what roadmap.py printed, byte for byte, because every message
 * and generated block was written by it: `repr()` in messages, `str()` in
 * f-strings, `splitlines()`, universal newlines and `json.dumps`. */

import { readFileSync } from "node:fs";
import { TomlDate } from "smol-toml";

/** A calendar date, what a bare TOML date parses to, like Python's
 * `datetime.date`. It prints as YYYY-MM-DD and compares by day. */
export class Day {
  readonly year: number;
  readonly month: number;
  readonly day: number;

  constructor(year: number, month: number, day: number) {
    this.year = year;
    this.month = month;
    this.day = day;
  }

  static fromIso(text: string): Day | null {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text) ?? /^(\d{4})(\d{2})(\d{2})$/.exec(text);
    if (!match) return null;
    const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
    const probe = new Date(Date.UTC(year, month - 1, day));
    probe.setUTCFullYear(year);
    if (probe.getUTCMonth() !== month - 1 || probe.getUTCDate() !== day || year < 1) return null;
    return new Day(year, month, day);
  }

  static today(): Day {
    const now = new Date();
    return new Day(now.getFullYear(), now.getMonth() + 1, now.getDate());
  }

  /** Days since 0001-01-01, so two dates subtract to a number of days. */
  get ordinal(): number {
    const ms = Date.UTC(2000, this.month - 1, this.day);
    const shifted = new Date(ms);
    shifted.setUTCFullYear(this.year);
    return Math.round(shifted.getTime() / 86_400_000);
  }

  toString(): string {
    return `${String(this.year).padStart(4, "0")}-${pad(this.month)}-${pad(this.day)}`;
  }
}

/** A TOML float, kept apart from integers, which JavaScript can't tell from it. */
export class Float {
  readonly value: number;

  constructor(value: number) {
    this.value = value;
  }

  toString(): string {
    return floatRepr(this.value);
  }
}

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

export function isInt(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value);
}

export function isDay(value: unknown): value is Day {
  return value instanceof Day;
}

export function isDict(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value) && value.constructor === Object;
}

/** A parsed TOML value in the types tomllib gives: integers as numbers,
 * floats as Float, bare dates as Day, other date-times left as TomlDate. */
export function fromToml(value: unknown): unknown {
  if (typeof value === "bigint") return Number(value);
  if (typeof value === "number") return new Float(value);
  if (value instanceof TomlDate) {
    const day = value.isDate() ? Day.fromIso(value.toISOString()) : null;
    return day ?? value;
  }
  if (Array.isArray(value)) return value.map(fromToml);
  if (isDict(value)) return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, fromToml(v)]));
  return value;
}

function floatRepr(n: number): string {
  if (Number.isNaN(n)) return "nan";
  if (!Number.isFinite(n)) return n > 0 ? "inf" : "-inf";
  if (Object.is(n, -0)) return "-0.0";
  const abs = Math.abs(n);
  if (abs !== 0 && (abs >= 1e16 || abs < 1e-4)) {
    const [mantissa, exponent = "0"] = n.toExponential().split("e");
    const exp = Number(exponent);
    return `${mantissa}e${exp < 0 ? "-" : "+"}${String(Math.abs(exp)).padStart(2, "0")}`;
  }
  const text = String(n);
  return text.includes(".") || text.includes("e") ? text : `${text}.0`;
}

/** `datetime.datetime(2026, 9, 6, 10, 0)` or `datetime.time(10, 0)`: hour and
 * minute always, seconds and microseconds only when set, as Python prints them. */
function tomlDateRepr(value: TomlDate): string {
  const match = /(?:(\d{4})-(\d{2})-(\d{2}))?[T ]?(?:(\d{2}):(\d{2}):(\d{2})(?:\.(\d+))?)?/.exec(value.toISOString());
  const [y, mo, d, h, mi, s, frac] = (match ?? []).slice(1);
  const time = [Number(h), Number(mi)];
  const micro = frac ? Number(frac.padEnd(6, "0").slice(0, 6)) : 0;
  if (Number(s) || micro) time.push(Number(s));
  if (micro) time.push(micro);
  if (value.isTime()) return `datetime.time(${time.join(", ")})`;
  const tz = value.isLocal() ? "" : ", tzinfo=datetime.timezone.utc";
  return `datetime.datetime(${[Number(y), Number(mo), Number(d), ...time].join(", ")}${tz})`;
}

function tomlDateStr(value: TomlDate): string {
  return value
    .toISOString()
    .replace("T", " ")
    .replace(/\.000(?=$|[+-Z])/, "")
    .replace(/Z$/, "+00:00");
}

const UNPRINTABLE = /[\p{Cc}\p{Cf}\p{Cs}\p{Co}\p{Cn}\p{Zl}\p{Zp}\p{Zs}]/u;

/** Python's `repr()`, for the values a TOML file or a command line can hold. */
export function repr(value: unknown): string {
  if (typeof value === "string") return strRepr(value);
  if (value === null || value === undefined) return "None";
  if (typeof value === "boolean") return value ? "True" : "False";
  if (typeof value === "number") return isInt(value) ? String(value) : floatRepr(value);
  if (value instanceof Float) return floatRepr(value.value);
  if (value instanceof Day) return `datetime.date(${value.year}, ${value.month}, ${value.day})`;
  if (value instanceof TomlDate) return tomlDateRepr(value);
  if (Array.isArray(value)) return `[${value.map(repr).join(", ")}]`;
  if (isDict(value))
    return `{${Object.entries(value)
      .map(([k, v]) => `${strRepr(k)}: ${repr(v)}`)
      .join(", ")}}`;
  return String(value);
}

function strRepr(text: string): string {
  const quote = text.includes("'") && !text.includes('"') ? '"' : "'";
  let out = quote;
  for (const char of text) {
    const code = char.codePointAt(0) ?? 0;
    if (char === "\\" || char === quote) out += `\\${char}`;
    else if (char === "\n") out += "\\n";
    else if (char === "\r") out += "\\r";
    else if (char === "\t") out += "\\t";
    else if (char !== " " && UNPRINTABLE.test(char)) {
      if (code <= 0xff) out += `\\x${code.toString(16).padStart(2, "0")}`;
      else if (code <= 0xffff) out += `\\u${code.toString(16).padStart(4, "0")}`;
      else out += `\\U${code.toString(16).padStart(8, "0")}`;
    } else out += char;
  }
  return out + quote;
}

/** Python's `str()`, as an f-string prints a value. */
export function str(value: unknown): string {
  if (typeof value === "string") return value;
  if (value instanceof Day) return value.toString();
  if (value instanceof TomlDate) return tomlDateStr(value);
  return repr(value);
}

/** Python's truthiness, for the values a TOML file can hold. */
export function truthy(value: unknown): boolean {
  if (value === null || value === undefined || value === false || value === 0 || value === "") return false;
  if (value instanceof Float) return value.value !== 0;
  if (Array.isArray(value)) return value.length > 0;
  if (isDict(value)) return Object.keys(value).length > 0;
  return true;
}

/** Python's `==` for the same values. */
export function eq(a: unknown, b: unknown): boolean {
  if (a instanceof Day && b instanceof Day) return a.ordinal === b.ordinal;
  if (a instanceof Float || b instanceof Float) {
    const x = a instanceof Float ? a.value : a;
    const y = b instanceof Float ? b.value : b;
    return typeof x === "number" && typeof y === "number" && x === y;
  }
  if (Array.isArray(a) && Array.isArray(b)) return a.length === b.length && a.every((v, i) => eq(v, b[i]));
  if (isDict(a) && isDict(b)) {
    const keys = Object.keys(a);
    return keys.length === Object.keys(b).length && keys.every((k) => k in b && eq(a[k], b[k]));
  }
  if (a instanceof TomlDate && b instanceof TomlDate) return a.toISOString() === b.toISOString();
  return a === b;
}

// biome-ignore lint/suspicious/noControlCharactersInRegex: these are the separators splitlines() breaks on
const LINE_BREAK = /\r\n|[\n\r\v\f\x1c\x1d\x1e\x85\u2028\u2029]/g;

/** Python's `str.splitlines()`, which breaks on more than `\n`. */
export function splitlines(text: string, keepends = false): string[] {
  const lines: string[] = [];
  let last = 0;
  for (const match of text.matchAll(LINE_BREAK)) {
    const end = match.index + match[0].length;
    lines.push(text.slice(last, keepends ? end : match.index));
    last = end;
  }
  if (last < text.length) lines.push(text.slice(last));
  return lines;
}

/** A text file as Python's `Path.read_text()` reads it, with universal newlines. */
export function readText(path: string): string {
  return universal(readFileSync(path, "utf8"));
}

export function universal(text: string): string {
  return text.replace(/\r\n?/g, "\n");
}

/** Python's `json.dumps(value, indent=2, default=str)`, with its ASCII escaping. */
export function jsonDumps(value: unknown, indent = 2, level = 0): string {
  const inner = " ".repeat(indent * (level + 1));
  const outer = " ".repeat(indent * level);
  if (value === null || value === undefined) return "null";
  if (typeof value === "boolean") return value ? "true" : "false";
  if (typeof value === "number") return isInt(value) ? String(value) : jsonFloat(value);
  if (value instanceof Float) return jsonFloat(value.value);
  if (typeof value === "string") return jsonString(value);
  if (Array.isArray(value)) {
    if (!value.length) return "[]";
    return `[\n${value.map((v) => inner + jsonDumps(v, indent, level + 1)).join(",\n")}\n${outer}]`;
  }
  if (isDict(value)) {
    const entries = Object.entries(value);
    if (!entries.length) return "{}";
    const body = entries.map(([k, v]) => `${inner}${jsonString(k)}: ${jsonDumps(v, indent, level + 1)}`);
    return `{\n${body.join(",\n")}\n${outer}}`;
  }
  return jsonString(str(value));
}

function jsonFloat(n: number): string {
  if (Number.isNaN(n)) return "NaN";
  if (!Number.isFinite(n)) return n > 0 ? "Infinity" : "-Infinity";
  return floatRepr(n);
}

function jsonString(text: string): string {
  return JSON.stringify(text).replace(/[\u0080-￿]/g, (c) => `\\u${c.charCodeAt(0).toString(16).padStart(4, "0")}`);
}

/** Python's `urllib.parse.unquote`: %XX sequences decoded as UTF-8, anything malformed left alone. */
export function unquote(text: string): string {
  if (!text.includes("%")) return text;
  return text.replace(/(?:%[0-9A-Fa-f]{2})+/g, (run) => {
    const bytes = Uint8Array.from(run.match(/%([0-9A-Fa-f]{2})/g) ?? [], (h) => Number.parseInt(h.slice(1), 16));
    return new TextDecoder("utf-8", { fatal: false }).decode(bytes);
  });
}

/** Compare two tuples the way Python sorts them. */
export function cmp(a: readonly (string | number)[], b: readonly (string | number)[]): number {
  for (let i = 0; i < Math.min(a.length, b.length); i++) {
    const x = a[i] as string | number;
    const y = b[i] as string | number;
    if (x < y) return -1;
    if (x > y) return 1;
  }
  return a.length - b.length;
}

/** Python's `len()` of a string, which counts code points. */
export function len(text: string): number {
  return Array.from(text).length;
}
