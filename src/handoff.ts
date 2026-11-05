/** A globally installed `roadmap` hands off to the copy a repo pins in its
 * package.json, the way globally installed tools defer to a project's own
 * version, so everyone in the repo runs the version its lockfile names. */

import { existsSync, realpathSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { PACKAGE_NAME, PACKAGE_ROOT, pinsPackage } from "./package.ts";

/** Set in the environment of a handed-off run, so it never hands off again. */
export const NO_HANDOFF = "ROADMAP_NO_HANDOFF";

/** The bin of the copy the repo around `cwd` pins, if it isn't this one.
 * Only the nearest package.json counts: a copy installed above the repo, such
 * as a stray one in `~/node_modules`, is never used. */
export function localInstall(cwd = process.cwd(), self = PACKAGE_ROOT): string | null {
  let dir = resolve(cwd);
  while (!existsSync(join(dir, "package.json"))) {
    const up = dirname(dir);
    if (up === dir) return null;
    dir = up;
  }
  if (!pinsPackage(dir)) return null;
  const root = join(dir, "node_modules", PACKAGE_NAME);
  const bin = join(root, "bin", "roadmap.js");
  if (!existsSync(bin)) return null;
  return realpathSync(root) === realpathSync(self) ? null : bin;
}
