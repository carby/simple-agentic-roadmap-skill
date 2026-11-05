+++
id = "v1-migration-gaps"
title = "Close the gaps in moving a 1.x install to 2.x (issue #27)"
bucket = "now"
rank = 1
filed = 2026-11-05

[refs]
files = ["src/install.ts", "src/migrate.ts"]
+++

[Issue #27](https://github.com/carby/simple-agentic-roadmap-skill/issues/27) lists four places where moving a 1.x install to 2.x leaves things broken or stale, even after `update` reports a clean migration. As of [update-migrations](../archive/update-migrations.md) (#29):

1. **Calls outside GitHub Actions.** `update` only flags `@v1` in `.github/workflows`. Other callers of `tools/roadmap.py`, such as `.pre-commit-config.yaml`, GitLab or Bitbucket CI and docs, aren't flagged, so CI can still break after a clean migration. Open. Suggested fix: search the tracked files (`git grep`) for `tools/roadmap.py` and list each hit with the other printed steps.
2. **Hand-written README.md sections keep their 1.x text.** Partly fixed: #29 migrates the `python tools/roadmap.py` command lines. Sections from templates older than 1.5.0 still lack `decide`, `split`, `milestone` and `supersedes`. Open: either migrations for those older template texts, or a printed note pointing at the current template.
3. **decisions.md's intro says `roadmap.py decide`, and can never be fixed,** because `check --base` holds the whole file append-only. Open, and a rule change: only the entries stay append-only, not the intro above the first entry. A migration can then rewrite the intro.
4. **No `package.json` in the repo.** `npm install -D` quietly installs into the nearest parent folder that has one (in the report, `~`). Open. Suggested fix: `init` and `update` warn when `npm prefix` isn't the repo root, the quick start creates a `package.json` first, and the CI docs cover images without Node (a separate `node:22` step). [global-install](global-install.md) may remove the cause later, but this fixes the dev-dependency path people are on now.

The gap matters because the 1.x → 2.x move is the upgrade people are making now, and each of these turns a migration that looks clean into broken CI or stale instructions.

Done looks like each of the four points either fixed or recorded here as declined, with the reason. For point 3, the changed append-only rule is recorded here and in the CHANGELOG's rule notes, and [conventions](../../references/conventions.md) is updated. Then comment on issue #27 and close it.

**Outcome, per point:**
1. **Fixed.** Every `update` runs `git grep` for `roadmap.py` over tracked config-like files (`*.yml`, `*.yaml`, `*.toml`, `*.json`, `*.cfg`, `*.ini`, `*.sh`, Makefiles, justfiles), outside `roadmap/`, and lists each `path:line`. Prose such as Markdown and the CHANGELOG is left out on purpose, since it may describe the old setup; in this repo a search of every tracked file finds about ten such harmless hits.
2. **Fixed.** A `template-sections` migration replaces each README section that matches, word for word, what the 1.0.0 or 1.1.0–1.3.1 template wrote, keeping the user's index and guiding principle. The 1.4.0–1.5.0 sections differ from today's only in the command lines that `cli-command` already migrates. The frozen texts are in `src/legacy.ts`. Sections a user edited are left alone, with no note, which would otherwise repeat on every `update`.
3. **Fixed, with a rule change.** `check --base` now holds decisions.md append-only from its first `## ` entry on; the intro above it may change. A `decisions-intro` migration replaces the 1.4.0–1.5.0 and 2.0.x intros, and this repo's own intro was migrated with it. Migrations still throw if they touch an entry.
4. **Fixed.** `init` and `update` warn when the repo has no `package.json`, naming the parent directory npm would install into, and say to run `npm init -y` first. The install docs say the same, and the CI docs cover images without Node.
