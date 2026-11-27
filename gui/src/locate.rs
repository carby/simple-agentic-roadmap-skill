//! Finding the roadmap to open, the way gitk finds its repo: walk up from
//! where the GUI was started.

use std::path::{Path, PathBuf};

/// The roadmap directory for `start`: `start` itself if it is one, else the
/// first `roadmap/` in it or an ancestor. The walk stops after a directory
/// with a `.git` entry (a directory, or a file in a worktree or submodule),
/// so a repo nested in another never borrows the outer one's roadmap.
/// Paths are made absolute but never canonicalised.
pub fn find_roadmap(start: &Path) -> Option<PathBuf> {
    let start = std::path::absolute(start).ok()?;
    if is_roadmap(&start) {
        return Some(start);
    }
    for dir in start.ancestors() {
        let candidate = dir.join("roadmap");
        if is_roadmap(&candidate) {
            return Some(candidate);
        }
        if dir.join(".git").exists() {
            break;
        }
    }
    None
}

/// A directory with `items/` and either `roadmap.toml` or an item file, so
/// that any folder that happens to hold an `items/` doesn't count.
pub fn is_roadmap(dir: &Path) -> bool {
    let items = dir.join("items");
    if !items.is_dir() {
        return false;
    }
    if dir.join("roadmap.toml").is_file() {
        return true;
    }
    std::fs::read_dir(&items)
        .map(|entries| {
            entries
                .flatten()
                .any(|e| e.path().extension().is_some_and(|x| x == "md"))
        })
        .unwrap_or(false)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

    fn roadmap_in(root: &Path) -> PathBuf {
        let dir = root.join("roadmap");
        fs::create_dir_all(dir.join("items")).unwrap();
        fs::create_dir_all(dir.join("archive")).unwrap();
        fs::write(dir.join("roadmap.toml"), "").unwrap();
        dir
    }

    #[test]
    fn finds_the_roadmap_from_a_subfolder_of_the_repo() {
        let tmp = tempfile::tempdir().unwrap();
        fs::create_dir(tmp.path().join(".git")).unwrap();
        let dir = roadmap_in(tmp.path());
        let deep = tmp.path().join("src/a/b");
        fs::create_dir_all(&deep).unwrap();
        assert_eq!(find_roadmap(&deep), Some(dir));
    }

    #[test]
    fn takes_a_roadmap_directory_or_a_folder_inside_it() {
        let tmp = tempfile::tempdir().unwrap();
        let dir = roadmap_in(tmp.path());
        assert_eq!(find_roadmap(&dir), Some(dir.clone()));
        assert_eq!(find_roadmap(&dir.join("items")), Some(dir.clone()));
        assert_eq!(find_roadmap(&dir.join("archive")), Some(dir));
    }

    #[test]
    fn an_item_file_counts_without_roadmap_toml() {
        let tmp = tempfile::tempdir().unwrap();
        let dir = tmp.path().join("roadmap");
        fs::create_dir_all(dir.join("items")).unwrap();
        assert_eq!(find_roadmap(tmp.path()), None);
        fs::write(dir.join("items/a.md"), "+++\n+++\n").unwrap();
        assert_eq!(find_roadmap(tmp.path()), Some(dir));
    }

    #[test]
    fn a_stray_items_folder_is_not_a_roadmap() {
        let tmp = tempfile::tempdir().unwrap();
        fs::create_dir_all(tmp.path().join("shop/items")).unwrap();
        fs::write(tmp.path().join("shop/items/x.txt"), "").unwrap();
        assert_eq!(find_roadmap(&tmp.path().join("shop")), None);
    }

    #[test]
    fn stops_at_a_git_directory_or_file() {
        for git_is_file in [false, true] {
            let tmp = tempfile::tempdir().unwrap();
            roadmap_in(tmp.path());
            let inner = tmp.path().join("vendor/lib");
            fs::create_dir_all(&inner).unwrap();
            if git_is_file {
                fs::write(inner.join(".git"), "gitdir: ../../.git/modules/lib\n").unwrap();
            } else {
                fs::create_dir(inner.join(".git")).unwrap();
            }
            assert_eq!(find_roadmap(&inner.join("src")), None, "git_is_file={git_is_file}");
        }
    }

    #[test]
    fn finds_nothing_where_there_is_no_roadmap() {
        let tmp = tempfile::tempdir().unwrap();
        fs::create_dir(tmp.path().join(".git")).unwrap();
        assert_eq!(find_roadmap(tmp.path()), None);
    }
}
