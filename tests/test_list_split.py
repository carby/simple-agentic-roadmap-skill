"""`list` prints the queue for agents and scripts. `split` gives an item that
turned out to be two pieces of work a sibling directly below it."""

from __future__ import annotations

import datetime
import json
from pathlib import Path

import pytest
from conftest import closed_meta, item_text, make_roadmap, open_meta, roadmap, run


def test_list_prints_the_queue_in_order_with_what_holds_each_item(valid: Path) -> None:
    result = run("list", cwd=valid)

    assert result.returncode == 0, result.stderr
    assert result.stdout.splitlines() == [
        "now 1  cache-tokens  Cache auth tokens",
        "    gate: p99 login under 50ms",
        "next 1  split-app  Split app.py",
        "    depends on: cache-tokens, drop-legacy-login",
        "later 1  rotate-keys  Rotate signing keys",
        "    blocked on: whether rotation is manual or scheduled",
    ]


def test_list_filters_by_bucket(valid: Path) -> None:
    assert run("list", "--bucket", "next", cwd=valid).stdout.splitlines()[0] == "next 1  split-app  Split app.py"
    assert run("list", "--bucket", "now", "--json", cwd=valid).stdout.count('"id"') == 1


def test_list_json_holds_the_frontmatter_and_path_of_open_items_only(valid: Path) -> None:
    result = run("list", "--json", cwd=valid)

    items = json.loads(result.stdout)
    assert [i["id"] for i in items] == ["cache-tokens", "split-app", "rotate-keys"]
    assert items[0]["path"] == "roadmap/items/cache-tokens.md"
    assert items[0]["filed"] == "2026-08-01"
    assert items[0]["refs"] == {"files": ["src/app.py"], "specs": ["auth"]}


def test_list_says_when_there_is_nothing_open(tmp_path: Path) -> None:
    make_roadmap(tmp_path, {})

    assert run("list", cwd=tmp_path).stdout == "No open items.\n"


def test_split_adds_a_sibling_below_the_original_with_its_place_and_dependencies(tmp_path: Path) -> None:
    make_roadmap(
        tmp_path,
        {
            "roadmap.toml": '[milestones]\nbeta = { title = "Beta", date = 2026-12-01 }\n',
            "items/base.md": item_text(open_meta(id="base")),
            "items/big.md": item_text(
                open_meta(id="big", rank=2, gate="fast", milestone="beta", depends_on=["base"], supersedes="x"),
                refs={"files": ["README.md"]},
            ),
            "items/after.md": item_text(open_meta(id="after", rank=3)),
            "archive/x.md": item_text(closed_meta(id="x", outcome="declined")),
        },
    )
    (tmp_path / "README.md").write_text("")

    result = run("split", "big", "big-two", "--title", "Second half", "--body", "The rest.", "--date", "2026-10-22",
                 cwd=tmp_path)  # fmt: skip

    assert result.returncode == 0, result.stderr
    assert result.stdout.splitlines() == [
        "Split big-two from big: rank 3 in 'now'.",
        "Shifted after down a rank, below it.",
        f"Narrow {Path('roadmap/items/big.md')}'s prose to the part it keeps.",
    ]
    new = roadmap.parse(tmp_path / "roadmap/items/big-two.md")
    assert new.meta == {
        "id": "big-two",
        "title": "Second half",
        "bucket": "now",
        "rank": 3,
        "filed": datetime.date(2026, 10, 22),
        "gate": "fast",
        "milestone": "beta",
        "depends_on": ["base"],
        "refs": {"files": ["README.md"]},
    }
    assert new.body.strip() == "The rest."
    assert roadmap.parse(tmp_path / "roadmap/items/after.md").meta["rank"] == 4
    assert run("check", cwd=tmp_path).returncode == 0


def test_split_of_a_later_item_copies_what_it_is_blocked_on(valid: Path) -> None:
    result = run("split", "rotate-keys", "rotate-certs", "--title", "Rotate certificates", cwd=valid)

    assert result.returncode == 0, result.stderr
    assert "body is a placeholder" in result.stdout
    meta = roadmap.parse(valid / "roadmap/items/rotate-certs.md").meta
    assert (meta["bucket"], meta["rank"], meta["blocked_on"]) == ("later", 2, "whether rotation is manual or scheduled")


@pytest.mark.parametrize(
    ("new_id", "expected"),
    [
        ("split-app", "already exists; ids are never reused"),
        ("rewrite-in-rust", "already exists; ids are never reused"),
        ("Not_A_Slug", "is not a kebab-case slug"),
    ],
)
def test_split_refuses_a_bad_id_and_writes_nothing(valid: Path, new_id: str, expected: str) -> None:
    before = {p: p.read_text() for p in sorted((valid / "roadmap").rglob("*.md"))}

    result = run("split", "cache-tokens", new_id, "--title", "T", cwd=valid)

    assert result.returncode == 2
    assert expected in result.stderr
    assert {p: p.read_text() for p in sorted((valid / "roadmap").rglob("*.md"))} == before
