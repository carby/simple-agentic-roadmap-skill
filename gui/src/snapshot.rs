//! The snapshot `roadmap export` prints, schema 1 (see cli/docs/json.md).
//! Every field of the schema is here, so the views that come after the frame
//! never need to touch these structs. Unknown fields are ignored, because a
//! newer CLI may add some without moving the schema.

use serde::{Deserialize, Serialize};
use serde_json::Value;

/// The schema this GUI reads. A document with any other number is refused.
pub const SCHEMA: i64 = 1;

#[derive(Debug, Clone, Default, PartialEq, Deserialize, Serialize)]
#[serde(default)]
pub struct Snapshot {
    pub schema: i64,
    pub ok: bool,
    pub warnings: Vec<String>,
    /// The CLI's release.
    pub version: String,
    /// The roadmap directory, absolute; item paths are relative to it.
    pub dir: String,
    /// Null outside git.
    pub git: Option<Git>,
    pub milestones: Vec<Milestone>,
    /// Open items, in queue order.
    pub items: Vec<Item>,
    /// Closed items, newest first.
    pub archived: Vec<Item>,
    /// Files that won't parse; left out of `items` and `archived`.
    pub unreadable: Vec<Unreadable>,
}

#[derive(Debug, Clone, Default, PartialEq, Deserialize, Serialize)]
#[serde(default)]
pub struct Git {
    /// Null on a detached HEAD.
    pub branch: Option<String>,
    pub clean: bool,
}

#[derive(Debug, Clone, Default, PartialEq, Deserialize, Serialize)]
#[serde(default)]
pub struct Milestone {
    pub id: String,
    pub title: String,
    pub date: String,
    pub reached: Option<String>,
    pub due: Vec<String>,
    pub waiting: Vec<String>,
}

#[derive(Debug, Clone, Default, PartialEq, Deserialize, Serialize)]
#[serde(default)]
pub struct Item {
    pub id: String,
    pub path: String,
    pub archived: bool,
    /// Exactly as the file has it; a roadmap may declare fields of its own.
    pub frontmatter: Value,
    pub body: String,
    pub committed: Option<String>,
    pub depends_on: Vec<String>,
    pub due: Vec<String>,
    pub dependents: Vec<String>,
    /// Open items only; null for an invalid bucket.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub state: Option<State>,
    /// Open items only.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub waits_on: Option<WaitsOn>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Deserialize, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum State {
    Ready,
    Waiting,
    Later,
    /// A state this GUI doesn't know yet.
    #[serde(other)]
    Unknown,
}

#[derive(Debug, Clone, Default, PartialEq, Deserialize, Serialize)]
#[serde(default)]
pub struct WaitsOn {
    pub items: Vec<String>,
    pub milestones: Vec<String>,
}

#[derive(Debug, Clone, Default, PartialEq, Deserialize, Serialize)]
#[serde(default)]
pub struct Unreadable {
    pub path: String,
    pub message: String,
}

impl Item {
    fn field(&self, key: &str) -> Option<&Value> {
        self.frontmatter.get(key)
    }

    pub fn title(&self) -> &str {
        self.field("title").and_then(Value::as_str).unwrap_or(&self.id)
    }

    pub fn bucket(&self) -> &str {
        self.field("bucket").and_then(Value::as_str).unwrap_or("")
    }

    /// The rank as written, which may be malformed (`check` reports that).
    pub fn rank(&self) -> String {
        match self.field("rank") {
            Some(Value::Number(n)) => n.to_string(),
            Some(Value::String(s)) => s.clone(),
            _ => "?".into(),
        }
    }
}

impl State {
    pub fn word(self) -> &'static str {
        match self {
            State::Ready => "ready",
            State::Waiting => "waiting",
            State::Later => "later",
            State::Unknown => "?",
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::{Map, json};
    use std::collections::{BTreeMap, BTreeSet};
    use std::path::Path;

    fn repo() -> &'static Path {
        Path::new(env!("CARGO_MANIFEST_DIR")).parent().unwrap()
    }

    /// Every key path in a document, and the JSON types seen there, the way
    /// cli/test/export.test.ts records them: arrays as `<path>[]`, and
    /// `frontmatter` opaque.
    fn shape(value: &Value, path: String, into: &mut BTreeMap<String, BTreeSet<&'static str>>) {
        let kind = match value {
            Value::Null => "null",
            Value::Bool(_) => "boolean",
            Value::Number(_) => "number",
            Value::String(_) => "string",
            Value::Array(_) => "array",
            Value::Object(_) => "object",
        };
        into.entry(path.clone()).or_default().insert(kind);
        if path.ends_with(".frontmatter") {
            return;
        }
        match value {
            Value::Array(values) => values.iter().for_each(|v| shape(v, format!("{path}[]"), into)),
            Value::Object(map) => map.iter().for_each(|(k, v)| shape(v, format!("{path}.{k}"), into)),
            _ => {}
        }
    }

    /// A snapshot with every field and every list filled, once with each
    /// optional field set and once with it null.
    fn samples() -> Vec<Snapshot> {
        let item = |archived: bool, set: bool| Item {
            id: "a".into(),
            path: "items/a.md".into(),
            archived,
            frontmatter: Value::Object(Map::new()),
            body: "\nProse.\n".into(),
            committed: set.then(|| "2026-11-26".into()),
            depends_on: vec!["b".into()],
            due: vec!["m".into()],
            dependents: vec!["c".into()],
            state: (!archived).then_some(State::Ready),
            waits_on: (!archived).then(|| WaitsOn {
                items: vec!["b".into()],
                milestones: vec!["m".into()],
            }),
        };
        [true, false]
            .into_iter()
            .map(|set| Snapshot {
                schema: 1,
                ok: true,
                warnings: vec!["w".into()],
                version: "2.3.0".into(),
                dir: "/r/roadmap".into(),
                git: set.then(|| Git {
                    branch: set.then(|| "main".into()),
                    clean: true,
                }),
                milestones: vec![Milestone {
                    id: "m".into(),
                    title: "M".into(),
                    date: "2026-12-31".into(),
                    reached: set.then(|| "2027-01-02".into()),
                    due: vec!["a".into()],
                    waiting: vec!["c".into()],
                }],
                items: vec![item(false, set)],
                archived: vec![item(true, set)],
                unreadable: vec![Unreadable {
                    path: "items/x.md".into(),
                    message: "bad".into(),
                }],
            })
            .collect()
    }

    #[test]
    fn every_field_the_gui_reads_is_in_the_recorded_schema() {
        let file = repo().join("cli/test/fixtures/json-schema-1.json");
        let recorded: Value = serde_json::from_str(&std::fs::read_to_string(&file).unwrap()).unwrap();
        // What cli::document reads from a failure.
        for path in ["$.schema", "$.ok", "$.rule", "$.message", "$.warnings[]"] {
            assert!(recorded["failure"][path].is_string(), "failure {path}");
        }
        let recorded = recorded["export"].as_object().unwrap();
        let mut ours = BTreeMap::new();
        for sample in samples() {
            shape(&serde_json::to_value(sample).unwrap(), "$".into(), &mut ours);
        }
        for (path, kinds) in ours {
            let Some(theirs) = recorded.get(&path).and_then(Value::as_str) else {
                panic!("{path} is not in {}", file.display());
            };
            let theirs: BTreeSet<&str> = theirs.split('|').collect();
            assert!(
                kinds.iter().all(|k| theirs.contains(k)),
                "{path}: the GUI expects {kinds:?}, the schema records {theirs:?}"
            );
        }
    }

    #[test]
    fn a_document_with_unknown_fields_and_states_still_reads() {
        let doc = json!({"schema": 1, "ok": true, "new_field": 1,
            "items": [{"id": "a", "state": "someday", "frontmatter": {"title": "A", "bucket": "now", "rank": 3}}]});
        let snapshot: Snapshot = serde_json::from_value(doc).unwrap();
        let item = &snapshot.items[0];
        assert_eq!((item.title(), item.bucket(), item.rank().as_str()), ("A", "now", "3"));
        assert_eq!(item.state, Some(State::Unknown));
    }

    /// The real CLI, when CI (or you) name it in ROADMAP_CLI: its exports of
    /// the CLI's fixture and of this repo's roadmap parse.
    #[test]
    fn the_real_cli_exports_parse() {
        let Ok(text) = std::env::var("ROADMAP_CLI") else {
            eprintln!("skipped: set ROADMAP_CLI, e.g. \"node cli/bin/roadmap.js\", to run it");
            return;
        };
        let env = crate::cli::Env {
            cli_override: Some(text),
            path: std::env::var_os("PATH"),
            cwd: repo().into(),
        };
        let cli = crate::cli::resolve(&env).unwrap();
        for dir in ["cli/test/fixtures/valid/roadmap", "roadmap"] {
            let snapshot = crate::cli::export(&cli, &repo().join(dir), crate::cli::TIMEOUT)
                .unwrap_or_else(|p| panic!("{dir}: {p:?}"));
            assert!(!snapshot.items.is_empty(), "{dir}");
            assert!(snapshot.items.iter().all(|i| i.state.is_some()), "{dir}");
        }
    }
}
