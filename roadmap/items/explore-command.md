+++
id = "explore-command"
title = "An explore command that turns a fuzzy problem into roadmap items"
bucket = "next"
rank = 2
filed = 2026-10-23
+++

OpenSpec's `/opsx:explore` is a thinking partner for when you don't know yet what to build. It reads the code, weighs options and shapes a plan before `/opsx:propose`. The roadmap has nothing like it: `new` assumes the problem is already understood well enough to give it an id, a title and a bucket.

An explore workflow would take a fuzzy problem, look at the code, `done.md` and `decisions.md`, and come back with pitches for one or more items, with their dependencies and suggested buckets. The human still decides what gets filed. That puts the roadmap above OpenSpec: explore finds and orders the work, and OpenSpec specifies a single change.

Done looks like an `explore` entry in SKILL.md's invocation table, ending in pitches rather than filed items, with evals covering that it never files anything unasked.
