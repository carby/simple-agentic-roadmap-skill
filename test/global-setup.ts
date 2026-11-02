// The subprocess tests run the built bin, so build it once before they start:
// a stale dist/ would test yesterday's code.

import { execFileSync } from "node:child_process";

export default function setup(): void {
  execFileSync("npm", ["run", "-s", "build"], { stdio: "inherit" });
}
