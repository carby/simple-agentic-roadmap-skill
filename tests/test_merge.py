"""Two branches that each change the roadmap, merged: the generated blocks in
README.md and done.md clash unless `merge-driver` takes them, and ranks that
both branches handed out collide until `index --renumber`."""

from __future__ import annotations

import subprocess
import sys
from pathlib import Path

import pytest
from conftest import FIXTURES, SCRIPT, run

AUTHOR = ("-c", "user.name=t", "-c", "user.email=t@t")


def git(repo: Path, *args: str, check: bool = True) -> subprocess.CompletedProcess:
    return subprocess.run(["git", *AUTHOR, *args], cwd=repo, check=check, capture_output=True, text=True)


@pytest.fixture
def repo(tmp_path: Path) -> Path:
    subprocess.run(["cp", "-r", str(FIXTURES / "valid"), str(tmp_path / "repo")], check=True)
    repo = tmp_path / "repo"
    git(repo, "init", "-q", "-b", "base")
    git(repo, "add", "-A")
    git(repo, "commit", "-qm", "base")
    return repo


def use_driver(repo: Path) -> None:
    (repo / ".gitattributes").write_text("roadmap/README.md merge=roadmap\nroadmap/done.md merge=roadmap\n")
    git(repo, "add", ".gitattributes")
    git(repo, "commit", "-qm", "attributes")
    git(repo, "config", "merge.roadmap.driver", f"{sys.executable} {SCRIPT} merge-driver %O %A %B %P")


def on_branch(repo: Path, name: str, *command: str) -> None:
    git(repo, "switch", "-q", "-c", name, "base")
    assert run(*command, cwd=repo).returncode == 0
    git(repo, "add", "-A")
    git(repo, "commit", "-qm", name)


def close_one_on_each_branch(repo: Path) -> subprocess.CompletedProcess:
    on_branch(repo, "a", "close", "rotate-keys", "--outcome", "declined")
    on_branch(repo, "b", "close", "split-app", "--outcome", "shipped")
    return git(repo, "merge", "-q", "a", check=False)


def test_without_the_driver_two_closes_conflict_in_the_generated_blocks(repo: Path) -> None:
    result = close_one_on_each_branch(repo)

    assert result.returncode != 0
    assert "CONFLICT" in result.stdout and "roadmap/done.md" in result.stdout


def test_with_the_driver_two_closes_merge_and_index_makes_check_pass(repo: Path) -> None:
    use_driver(repo)

    result = close_one_on_each_branch(repo)

    assert result.returncode == 0, result.stdout + result.stderr
    assert "run `roadmap.py index` once the merge is done" in result.stderr
    assert run("index", cwd=repo).returncode == 0
    assert run("check", "--base", "base", cwd=repo).returncode == 0
    done = (repo / "roadmap/done.md").read_text()
    assert "archive/rotate-keys.md" in done and "archive/split-app.md" in done


def test_the_driver_leaves_a_clash_in_hand_written_text_as_a_conflict(repo: Path) -> None:
    use_driver(repo)
    readme = repo / "roadmap/README.md"
    for branch, word in (("a", "Alpha"), ("b", "Beta")):
        git(repo, "switch", "-q", "-c", branch, "base")
        readme.write_text(readme.read_text().replace("# Roadmap", f"# Roadmap {word}", 1))
        git(repo, "commit", "-qam", branch)

    result = git(repo, "merge", "-q", "a", check=False)

    assert result.returncode != 0
    text = readme.read_text()
    assert "<<<<<<<" in text and text.count("<!-- BEGIN INDEX") == 1


def test_two_branches_filing_in_one_bucket_collide_until_renumbered(repo: Path) -> None:
    use_driver(repo)
    for name in ("first", "second"):
        on_branch(repo, name, "new", name, "--title", name, "--bucket", "now", "--body", "Prose.")

    assert git(repo, "merge", "-q", "first", check=False).returncode == 0
    run("index", cwd=repo)
    assert "[rank]" in run("check", cwd=repo).stderr

    assert run("index", "--renumber", cwd=repo).returncode == 0
    assert run("check", cwd=repo).returncode == 0
