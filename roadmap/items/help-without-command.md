+++
id = "help-without-command"
title = "Bare roadmap prints its help, not an error"
bucket = "next"
rank = 4
filed = 2026-11-24
+++

Raised as [#33](https://github.com/carby/simple-agentic-roadmap-skill/issues/33). Running `roadmap` with no command prints only the usage line and "the following arguments are required: command", and exits 2. Someone who just installed the CLI, or an agent trying it for the first time, gets no list of commands. They have to know to pass `--help`.

Done when bare `roadmap` prints the same help as `roadmap --help`: the commands, each with its one-line summary. Whether it still exits non-zero is part of the work. 2 tells a script it called the CLI wrongly, and 0 matches tools like git and npm. Either way it is tested.
