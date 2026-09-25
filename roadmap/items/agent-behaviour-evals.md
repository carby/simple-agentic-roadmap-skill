+++
id = "agent-behaviour-evals"
title = "Evals for how an agent uses the skill, not just for the script"
bucket = "later"
rank = 1
filed = 2026-09-25
blocked_on = "whether evals that call a model run in CI (cost, nondeterminism) or only on demand"
+++

The test suite proves the script enforces every rule. It cannot prove that an
agent loading SKILL.md *follows* the conventions. Examples of what it can't see:
- searching done.md before proposing a cleanup,
- refusing to close a scaffolded item,
- adding an annotation to an archived entry rather than editing it.

skill-creator style evals could test that behaviour: give the agent a fixture
roadmap and a prompt, then grade the transcript.

What is undecided is where these run. In CI they cost money on every push and
give nondeterministic results, which invites flaky-test fatigue. On demand
they are cheap, but they rot silently. The suite for the script itself is
unaffected either way.
