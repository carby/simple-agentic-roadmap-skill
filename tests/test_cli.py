"""The script as CI runs it: a subprocess, an exit status, and problems printed to stderr."""

from __future__ import annotations

from pathlib import Path

from conftest import roadmap, run


def test_check_passes_on_the_valid_fixture(valid: Path) -> None:
    result = run("check", cwd=valid)

    assert result.returncode == 0, result.stderr
    assert result.stdout == "Roadmap OK: 3 open, 2 archived.\n"


def test_check_fails_with_one_tagged_line_per_problem(valid: Path) -> None:
    (valid / "roadmap/items/cache-tokens.md").write_text(
        (valid / "roadmap/items/cache-tokens.md").read_text().replace('bucket = "now"', 'bucket = "later"')
    )
    (valid / "src/app.py").unlink()

    result = run("check", cwd=valid)

    assert result.returncode == 1
    lines = result.stderr.splitlines()
    assert lines[0] == "4 roadmap problem(s):"
    assert any(line.endswith("must name what it is blocked_on [bucket]") for line in lines)
    assert any(line.endswith("refs.files 'src/app.py' does not exist [refs]") for line in lines)
    assert sum(line.endswith("[generated]") for line in lines) == 1  # the index now puts it under Later
    assert any(
        line.endswith("rank 1 is already taken in 'later' by roadmap/items/cache-tokens.md [rank]") for line in lines
    )


def test_index_repairs_a_stale_index(valid: Path) -> None:
    item = valid / "roadmap/items/cache-tokens.md"
    item.write_text(item.read_text().replace("Cache auth tokens", "Cache the auth tokens"))
    assert run("check", cwd=valid).returncode == 1

    result = run("index", cwd=valid)

    assert result.returncode == 0, result.stderr
    assert run("check", cwd=valid).returncode == 0
    assert "[Cache the auth tokens](items/cache-tokens.md)" in (valid / "roadmap/README.md").read_text()


def test_index_repairs_the_index_after_an_item_is_deleted_by_hand(valid: Path) -> None:
    """The stale index still links to the deleted file. That is a [generated]
    problem for `index` to fix, not a [links] problem that stops it."""
    (valid / "roadmap/items/cache-tokens.md").unlink()

    result = run("index", cwd=valid)

    assert result.returncode == 0, result.stderr
    assert run("check", cwd=valid).returncode == 0


def test_index_refuses_to_render_an_invalid_roadmap(valid: Path) -> None:
    (valid / "roadmap/items/broken.md").write_text("no fence\n")
    readme = (valid / "roadmap/README.md").read_text()

    result = run("index", cwd=valid)

    assert result.returncode == 1
    assert "[frontmatter]" in result.stderr
    assert (valid / "roadmap/README.md").read_text() == readme


def test_dir_points_at_a_roadmap_elsewhere(valid: Path) -> None:
    result = run("check", "--dir", "valid/roadmap", cwd=valid.parent)

    assert result.returncode == 0, result.stderr


def test_a_broken_config_is_a_usage_error(valid: Path) -> None:
    (valid / "roadmap/roadmap.toml").write_text("[refs\n")

    result = run("check", cwd=valid)

    assert result.returncode == 2
    assert result.stderr.startswith("error: ") and "[config]" in result.stderr


def test_version() -> None:
    result = run("--version", cwd=Path.cwd())

    assert result.stdout.strip() == f"roadmap.py {roadmap.__version__}"


def test_new_refuses_a_reused_id(valid: Path) -> None:
    result = run("new", "rewrite-in-rust", "--title", "Again", "--bucket", "now", cwd=valid)

    assert result.returncode == 2
    assert "ids are never reused" in result.stderr


def test_new_enforces_the_bucket_criterion_up_front(valid: Path) -> None:
    result = run("new", "some-call", "--title", "T", "--bucket", "later", cwd=valid)

    assert result.returncode == 2
    assert "--blocked-on is required" in result.stderr


def test_new_takes_the_next_free_rank_and_refs(valid: Path) -> None:
    result = run(
        "new", "more-work", "--title", "More", "--bucket", "now", "--ref", "specs:auth", "--body", "Why.", cwd=valid
    )

    assert result.returncode == 0, result.stderr
    item = roadmap.parse(valid / "roadmap/items/more-work.md")
    assert item.meta["rank"] == 2
    assert item.meta["refs"] == {"specs": ["auth"]}
    assert run("check", cwd=valid).returncode == 0


def test_move_goes_to_the_bottom_of_the_target_bucket(valid: Path) -> None:
    result = run("move", "cache-tokens", "--bucket", "next", cwd=valid)

    assert result.returncode == 0, result.stderr
    moved = roadmap.parse(valid / "roadmap/items/cache-tokens.md")
    assert (moved.meta["bucket"], moved.meta["rank"]) == ("next", 2)
    assert run("check", cwd=valid).returncode == 0


def test_move_out_of_later_drops_blocked_on_and_asks_for_the_decision(valid: Path) -> None:
    result = run("move", "rotate-keys", "--bucket", "now", cwd=valid)

    assert result.returncode == 0, result.stderr
    assert "record in its prose what was decided" in result.stdout
    assert "blocked_on" not in roadmap.parse(valid / "roadmap/items/rotate-keys.md").meta
    assert run("check", cwd=valid).returncode == 0


def test_move_into_later_needs_the_open_question(valid: Path) -> None:
    refused = run("move", "cache-tokens", "--bucket", "later", cwd=valid)
    moved = run("move", "cache-tokens", "--bucket", "later", "--blocked-on", "which cache", cwd=valid)

    assert refused.returncode == 2 and "--blocked-on is required" in refused.stderr
    assert moved.returncode == 0, moved.stderr
    assert roadmap.parse(valid / "roadmap/items/cache-tokens.md").meta["blocked_on"] == "which cache"
    assert run("check", cwd=valid).returncode == 0


def test_move_refuses_a_no_op(valid: Path) -> None:
    result = run("move", "split-app", "--bucket", "next", cwd=valid)

    assert result.returncode == 2
    assert "is already in 'next'" in result.stderr


def test_there_is_no_wip_tracking_command(valid: Path) -> None:
    result = run("claim", "cache-tokens", cwd=valid)

    assert result.returncode == 2
    assert "invalid choice: 'claim'" in result.stderr


def test_move_and_close_refuse_an_archived_item(valid: Path) -> None:
    for args in (["move", "rewrite-in-rust", "--bucket", "now"], ["close", "rewrite-in-rust", "--outcome", "shipped"]):
        result = run(*args, cwd=valid)

        assert result.returncode == 2
        assert "it is already closed" in result.stderr
