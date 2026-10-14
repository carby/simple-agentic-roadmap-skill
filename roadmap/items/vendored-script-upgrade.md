+++
id = "vendored-script-upgrade"
title = "Upgrade path for the vendored roadmap.py"
bucket = "now"
rank = 1
filed = 2026-10-14

[refs]
files = ["scripts/roadmap.py"]
+++

Updating the skill (e.g. `git submodule update --remote`) leaves the vendored `tools/roadmap.py` at the old version. The only upgrade path is copying the script over by hand, which is easy to forget, and nothing reports that the two copies have drifted. `init` can't help: it refuses as soon as any template file exists, before it copies the script.

Done looks like an `upgrade` command, run from the skill's copy, that replaces the vendored script, refuses a downgrade without `--force`, and runs `check` straight after. When the skill's copy runs next to an older vendored one, it warns. Pitched in [issue #1](https://github.com/carby/simple-agentic-roadmap-skill/issues/1).
