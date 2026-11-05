/** Facts about this package that both `init`/`update` and the migrations
 * need, kept apart so neither module imports the other. */

import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

/** The package's root: `src/..` in tests, `dist/..` once built. */
export const PACKAGE_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

/** The npm package this CLI ships in. */
export const PACKAGE_NAME = "simple-agentic-roadmap-skill";

/** How the generated files and the template name the CLI in a repo that
 * pins the package in package.json, so developers may not have it globally. */
export const COMMAND = "npx --no -- roadmap";

/** How they name it in a repo that pins the version in roadmap.toml, which
 * runs the globally installed CLI. */
export const GLOBAL_COMMAND = "roadmap";

/** A template file's text as `init` writes it, with the CLI filled in. */
export function templateText(text: string, command = COMMAND): string {
  return text.replaceAll("{{command}}", command).replaceAll("{{script}}", command);
}

/** Whether the package.json in `dir` lists this package as a dependency. */
export function pinsPackage(dir = "."): boolean {
  const path = join(dir, "package.json");
  if (!existsSync(path)) return false;
  try {
    const manifest = JSON.parse(readFileSync(path, "utf8"));
    return [manifest.dependencies, manifest.devDependencies].some(
      (deps) => typeof deps === "object" && deps !== null && PACKAGE_NAME in deps,
    );
  } catch {
    return false;
  }
}
