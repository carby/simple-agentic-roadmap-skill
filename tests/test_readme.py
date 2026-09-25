"""README.md is what a person adopting the skill reads. Its client-side and
developer-side instructions must name real commands and real Action inputs."""

from __future__ import annotations

import re

from conftest import REPO, roadmap
from test_skill import COMMANDS

README = (REPO / "README.md").read_text()


def section(title: str) -> str:
    match = re.search(rf"^## {re.escape(title)}\n(.*?)(?=^## |\Z)", README, re.MULTILINE | re.DOTALL)
    assert match, f"README.md has no '## {title}' section"
    return match.group(1)


def test_client_checks_are_in_the_readme_and_developer_tests_in_contributing() -> None:
    contributing = (REPO / "CONTRIBUTING.md").read_text()

    assert "roadmap.py check" in section("Checking your roadmap")
    assert "uv run pytest" in contributing and "uv run pytest" not in README
    assert "CONTRIBUTING.md" in section("Contributing")


def test_every_command_the_readme_and_contributing_name_exists() -> None:
    for name in ("README.md", "CONTRIBUTING.md"):
        named = set(re.findall(r"roadmap\.py (?:--dir \S+ )?([a-z]+)", (REPO / name).read_text()))

        assert named, f"{name} names no commands; the regex is out of date"
        assert named <= COMMANDS, f"{name} names {named - COMMANDS}"


def test_every_action_input_the_readme_uses_exists() -> None:
    action = (REPO / "action.yml").read_text()
    inputs = set(re.findall(r"^  ([a-z-]+):$", action.split("runs:")[0], re.MULTILINE))
    used = set()
    for block in re.findall(r"uses: \S*roadmap-skill@\S+\n\s+with:\n((?:\s{10,}\S.*\n)+)", README):
        used |= set(re.findall(r"^\s+([a-z-]+):", block, re.MULTILINE))

    assert used, "README.md shows no `uses: ...roadmap-skill@...` step with inputs"
    assert used <= inputs, f"README.md uses Action inputs {used - inputs} that action.yml lacks"


def test_the_readme_points_at_the_rule_table() -> None:
    assert "references/conventions.md" in section("Checking your roadmap")


def test_every_rule_tag_is_explained_in_the_readme() -> None:
    checking = section("Checking your roadmap")
    for tag in roadmap.RULES:
        assert f"`[{tag}]`" in checking, f"README.md's failure table does not explain [{tag}]"


def test_every_slash_command_the_readme_advertises_is_handled_by_the_skill() -> None:
    advertised = set(re.findall(r"^\| `/roadmap ([a-z]+)", section("Slash commands"), re.MULTILINE))
    handled = set(re.findall(r"^\| `([a-z]+)[` ]", (REPO / "SKILL.md").read_text(), re.MULTILINE))

    assert advertised, "README.md's slash-command table is empty or the regex is out of date"
    assert advertised <= handled, f"SKILL.md does not say what to do for /roadmap {advertised - handled}"
