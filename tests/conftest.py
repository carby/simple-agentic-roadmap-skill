"""Shared helpers. The tests import scripts/roadmap.py directly, as the module a
repo vendors, and also run it as a subprocess, the way CI does."""

from __future__ import annotations

import datetime
import shutil
import subprocess
import sys
from pathlib import Path

import pytest

REPO = Path(__file__).resolve().parent.parent
SCRIPT = REPO / "scripts" / "roadmap.py"
FIXTURES = REPO / "tests" / "fixtures"

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
    return rm


def run(*args: str, cwd: Path, script: Path = SCRIPT) -> subprocess.CompletedProcess:
    return subprocess.run([sys.executable, str(script), *args], cwd=cwd, capture_output=True, text=True)


@pytest.fixture
def valid(tmp_path: Path) -> Path:
    """A writable copy of tests/fixtures/valid. Returns the fixture root, which
    is the directory commands run from."""
    shutil.copytree(FIXTURES / "valid", tmp_path / "valid")
    return tmp_path / "valid"
