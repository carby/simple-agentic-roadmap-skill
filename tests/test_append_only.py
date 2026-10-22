"""`check --base` holds archive/ and decisions.md append-only against a git
ref: an entry may gain lines, but it may not lose, change or move any."""

from __future__ import annotations

import subprocess
from pathlib import Path

import pytest
from conftest import FIXTURES, run


def git(repo: Path, *args: str) -> None:
    subprocess.run(["git", *args], cwd=repo, check=True, capture_output=True)


@pytest.fixture
def repo(tmp_path: Path) -> Path:
    subprocess.run(["cp", "-r", str(FIXTURES / "valid"), str(tmp_path / "repo")], check=True)
    repo = tmp_path / "repo"
    git(repo, "init", "-q")
    git(repo, "-c", "user.name=t", "-c", "user.email=t@t", "add", "-A")
    git(repo, "-c", "user.name=t", "-c", "user.email=t@t", "commit", "-qm", "base")
    return repo


ENTRY = "roadmap/archive/rewrite-in-rust.md"


def test_an_unchanged_archive_passes(repo: Path) -> None:
    assert run("check", "--base", "HEAD", cwd=repo).returncode == 0


def test_an_appended_dated_annotation_passes(repo: Path) -> None:
    entry = repo / ENTRY
    entry.write_text(entry.read_text() + "\n**2026-10-01:** the build-time figure predates incremental builds.\n")

    result = run("check", "--base", "HEAD", cwd=repo)

    assert result.returncode == 0, result.stderr


def test_a_newly_closed_item_passes(repo: Path) -> None:
    assert run("close", "cache-tokens", "--outcome", "shipped", cwd=repo).returncode == 0

    result = run("check", "--base", "HEAD", cwd=repo)

    assert result.returncode == 0, result.stderr


def test_a_changed_line_fails(repo: Path) -> None:
    entry = repo / ENTRY
    entry.write_text(entry.read_text().replace("Declined.", "Shelved."))

    result = run("check", "--base", "HEAD", cwd=repo)

    assert result.returncode == 1
    assert "archived entries only take added lines" in result.stderr
    assert f"{ENTRY}:" in result.stderr and "[append-only]" in result.stderr


def test_a_deleted_entry_fails(repo: Path) -> None:
    (repo / ENTRY).unlink()
    run("index", cwd=repo)

    result = run("check", "--base", "HEAD", cwd=repo)

    assert result.returncode == 1
    assert "existed at HEAD and is gone" in result.stderr


def test_an_entry_moved_back_to_items_fails(repo: Path) -> None:
    (repo / ENTRY).rename(repo / "roadmap/items/rewrite-in-rust.md")

    result = run("check", "--base", "HEAD", cwd=repo)

    assert "existed at HEAD and is gone" in result.stderr


DECISIONS = "roadmap/decisions.md"


def test_a_new_decision_passes(repo: Path) -> None:
    result = run("decide", "--title", "Ship weekly", "--body", "Smaller releases.", cwd=repo)
    assert result.returncode == 0, result.stderr

    assert run("check", "--base", "HEAD", cwd=repo).returncode == 0


def test_an_edited_decision_fails(repo: Path) -> None:
    decisions = repo / DECISIONS
    decisions.write_text(decisions.read_text().replace("Rules out a shared token cache.", "Allows a cache."))

    result = run("check", "--base", "HEAD", cwd=repo)

    assert result.returncode == 1
    assert "decisions.md only takes added lines" in result.stderr
    assert f"{DECISIONS}:" in result.stderr and "[append-only]" in result.stderr


def test_a_deleted_decisions_log_fails(repo: Path) -> None:
    (repo / DECISIONS).unlink()

    result = run("check", "--base", "HEAD", cwd=repo)

    assert result.returncode == 1
    assert "existed at HEAD and is gone; a decision is reversed by a new entry" in result.stderr


def test_a_decisions_log_new_since_the_base_passes(repo: Path) -> None:
    git(repo, "rm", "-q", DECISIONS)
    git(repo, "-c", "user.name=t", "-c", "user.email=t@t", "commit", "-qm", "no log")
    assert run("decide", "--title", "Ship weekly", "--body", "Smaller releases.", cwd=repo).returncode == 0

    assert run("check", "--base", "HEAD", cwd=repo).returncode == 0


def test_an_unknown_base_is_a_usage_error(repo: Path) -> None:
    result = run("check", "--base", "no-such-ref", cwd=repo)

    assert result.returncode == 2
    assert result.stderr.startswith("error: git ")
