//! Watching the roadmap's files, only to say they changed. The GUI never
//! redraws from disk on its own: the person presses F5.

use std::path::{Path, PathBuf};

use notify::{EventKind, RecommendedWatcher, RecursiveMode, Watcher};

/// Whether a changed path can change what the CLI exports: item files, the
/// index and done.md, and roadmap.toml. Editors' swap, backup and lock files
/// don't count, so saving in vim raises the banner once, not four times.
pub fn relevant(path: &Path) -> bool {
    let Some(name) = path.file_name().and_then(|n| n.to_str()) else {
        return false;
    };
    if name.starts_with('.') || name.ends_with('~') || name == "4913" {
        return false;
    }
    name == "roadmap.toml" || name.ends_with(".md")
}

/// Watch `dir` recursively and call `changed` with the relevant paths of
/// each change, as notify reports them. Drop the watcher to stop.
pub fn watch(dir: &Path, changed: impl Fn(Vec<PathBuf>) + Send + 'static) -> notify::Result<RecommendedWatcher> {
    let mut watcher = notify::recommended_watcher(move |event: notify::Result<notify::Event>| {
        let Ok(event) = event else { return };
        if matches!(event.kind, EventKind::Access(_)) {
            return;
        }
        let paths: Vec<PathBuf> = event.paths.into_iter().filter(|p| relevant(p)).collect();
        if !paths.is_empty() {
            changed(paths);
        }
    })?;
    watcher.watch(dir, RecursiveMode::Recursive)?;
    Ok(watcher)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::mpsc;
    use std::time::Duration;

    #[test]
    fn only_roadmap_files_count() {
        for name in ["items/a.md", "README.md", "roadmap.toml", "archive/b.md"] {
            assert!(relevant(Path::new(name)), "{name}");
        }
        for name in [
            "items/.a.md.swp",
            "items/a.md~",
            "items/4913",
            ".#a.md",
            "items/a.txt",
            "items",
        ] {
            assert!(!relevant(Path::new(name)), "{name}");
        }
    }

    #[test]
    fn a_write_to_an_item_is_reported_and_a_swap_file_is_not() {
        let tmp = tempfile::tempdir().unwrap();
        std::fs::create_dir(tmp.path().join("items")).unwrap();
        let (tx, rx) = mpsc::channel();
        let _watcher = watch(tmp.path(), move |paths| {
            let _ = tx.send(paths);
        })
        .unwrap();

        std::fs::write(tmp.path().join("items/.a.md.swp"), "x").unwrap();
        assert!(rx.recv_timeout(Duration::from_millis(500)).is_err());
        std::fs::write(tmp.path().join("items/a.md"), "x").unwrap();
        let paths = rx.recv_timeout(Duration::from_secs(5)).unwrap();
        assert!(paths.iter().all(|p| p.ends_with("items/a.md")), "{paths:?}");
    }
}
