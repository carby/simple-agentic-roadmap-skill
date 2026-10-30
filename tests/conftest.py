"""Shared helpers. The tests import scripts/roadmap.py directly, as the module a
repo vendors, and also run it as a subprocess, the way CI does.

With ROADMAP_IMPL=ts, the subprocess is the TypeScript port (bin/roadmap.js,
built with `npm run build`) instead, so every test that only goes through
`run()` checks that the port behaves the same. Tests marked `python_only`
exercise what the port leaves out, such as `init` and `upgrade`."""

from __future__ import annotations

import datetime
import os
import re
import shutil
import subprocess
import sys
from pathlib import Path

import pytest

REPO = Path(__file__).resolve().parent.parent
SCRIPT = REPO / "scripts" / "roadmap.py"
FIXTURES = REPO / "tests" / "fixtures"
BIN = REPO / "bin" / "roadmap.js"
IMPL = os.environ.get("ROADMAP_IMPL", "py")

sys.path.insert(0, str(SCRIPT.parent))

import roadmap  # noqa: E402

README = f"# Roadmap\n\n{roadmap.INDEX_BEGIN}\n{roadmap.INDEX_END}\n"
DONE = f"# Done\n\n{roadmap.DONE_BEGIN}\n{roadmap.DONE_END}\n"


def item_text(meta: dict, body: str = "Prose.", refs: dict | None = None) -> str:
    """One item file from a dict of frontmatter. A value of None leaves the key out."""
    lines = ["+++", *(f"{k} = {roadmap._toml(v)}" for k, v in meta.items() if v is not None)]
    if refs is not None:
        lines += ["[refs]", *(f"{k} = [{', '.join(roadmap._toml(e) for e in v)}]" for k, v in refs.items())]
    return "\n".join([*lines, "+++", "", body, ""])


def open_meta(**overrides) -> dict:
    meta = {"id": "sample", "title": "Sample", "bucket": "now", "rank": 1, "filed": datetime.date(2026, 9, 6)}
    return meta | overrides


def closed_meta(**overrides) -> dict:
    meta = {
        "id": "sample",
        "title": "Sample",
        "filed": datetime.date(2026, 9, 6),
        "closed": datetime.date(2026, 9, 10),
        "outcome": "shipped",
    }
    return meta | overrides


def make_roadmap(root: Path, files: dict[str, str], *, sync: bool = True) -> roadmap.Roadmap:
    """A roadmap under root/roadmap holding `files` (paths relative to the
    roadmap dir) on top of a minimal README.md and done.md. With sync, the
    generated blocks are rendered, so the only problems left are the ones the
    files cause."""
    directory = root / "roadmap"
    for name, text in {"README.md": README, "done.md": DONE, **files}.items():
        path = directory / name
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(text)
    (directory / "items").mkdir(exist_ok=True)
    (directory / "archive").mkdir(exist_ok=True)
    rm = roadmap.open_roadmap(directory)
    if sync:
        roadmap.write_generated(rm)
    if IMPL == "ts":
        roadmap.check(rm)
    return rm


def run(*args: str, cwd: Path, script: Path = SCRIPT, python: bool = False) -> subprocess.CompletedProcess:
    """Run the script in `cwd`. Under ROADMAP_IMPL=ts the skill's own copy is
    the TypeScript bin, unless `python` asks for scripts/roadmap.py, as setup
    through `init` does."""
    port = IMPL == "ts" and script == SCRIPT and not python
    command = ["node", str(BIN)] if port else [sys.executable, str(script)]
    return subprocess.run([*command, *args], cwd=cwd, capture_output=True, text=True)


def ts_check_lines(rm: roadmap.Roadmap, base: str | None = None) -> list[str]:
    """What the TypeScript bin's `check` reports for this roadmap, one problem per line."""
    command = ["node", str(BIN), "check", "--dir", str(rm.dir), *(["--base", base] if base else [])]
    result = subprocess.run(command, cwd=rm.dir, capture_output=True, text=True)
    assert result.returncode in (0, 1), result.stderr
    return result.stderr.splitlines()[1:] if result.returncode else []


def comparable(line: str) -> str:
    """A problem line with the TOML parser's own wording cut off, since
    tomllib and smol-toml describe the same syntax error differently."""
    return re.sub(r"(malformed TOML(?: frontmatter)?): .*?( \[[a-z-]+\])?$", r"\1\2", line)


def assert_same_as_ts(rm: roadmap.Roadmap, problems: list[roadmap.Problem], base: str | None = None) -> None:
    expected = [comparable(str(p)) for p in problems]
    assert [comparable(line) for line in ts_check_lines(rm, base)] == expected, "the TypeScript port disagrees"


if IMPL == "ts":
    # Every in-process `check`, and every roadmap a test builds, is also run
    # through the TypeScript bin, which has to report exactly the same
    # problems. That covers rendering too: a block the port renders
    # differently shows up as `[generated]`.
    _python_check = roadmap.check

    def _differential_check(rm: roadmap.Roadmap, base: str | None = None) -> list[roadmap.Problem]:
        problems = _python_check(rm, base)
        assert_same_as_ts(rm, problems, base)
        return problems

    roadmap.check = _differential_check


def pytest_collection_modifyitems(config: pytest.Config, items: list[pytest.Item]) -> None:
    if IMPL == "ts":
        skip = pytest.mark.skip(reason="the TypeScript port leaves this out (ROADMAP_IMPL=ts)")
        for item in items:
            if "python_only" in item.keywords:
                item.add_marker(skip)


@pytest.fixture
def valid(tmp_path: Path) -> Path:
    """A writable copy of tests/fixtures/valid. Returns the fixture root, which
    is the directory commands run from."""
    shutil.copytree(FIXTURES / "valid", tmp_path / "valid")
    return tmp_path / "valid"
