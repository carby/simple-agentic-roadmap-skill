/** Facts about this package that both `init`/`update` and the migrations
 * need, kept apart so neither module imports the other. */

import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

/** The package's root: `src/..` in tests, `dist/..` once built. */
export const PACKAGE_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

/** The npm package this CLI ships in. */
export const PACKAGE_NAME = "simple-agentic-roadmap-skill";

/** How the generated files and the template name the CLI. */
export const COMMAND = "npx --no -- roadmap";

/** A template file's text as `init` writes it, with the CLI filled in. */
export function templateText(text: string): string {
  return text.replaceAll("{{command}}", COMMAND).replaceAll("{{script}}", COMMAND);
}
