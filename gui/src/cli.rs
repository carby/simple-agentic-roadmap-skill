//! Running the roadmap CLI, the only way the GUI reads (and later writes)
//! a roadmap. One runner serves every command; `export` is a thin wrapper.

use std::ffi::OsString;
use std::io::Read;
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use std::sync::mpsc;
use std::thread;
use std::time::Duration;

use serde_json::Value;
use wait_timeout::ChildExt;

use crate::snapshot::{SCHEMA, Snapshot};

/// How long a command may run before it is killed.
pub const TIMEOUT: Duration = Duration::from_secs(30);

/// The parts of the environment that decide which CLI runs, passed in as a
/// value so tests never read or set the process environment.
#[derive(Debug, Clone, Default)]
pub struct Env {
    /// `--cli` on the command line, else `ROADMAP_CLI`.
    pub cli_override: Option<String>,
    pub path: Option<OsString>,
    pub cwd: PathBuf,
}

impl Env {
    pub fn from_process(cli_flag: Option<String>) -> Env {
        Env {
            cli_override: cli_flag
                .or_else(|| std::env::var("ROADMAP_CLI").ok())
                .filter(|s| !s.trim().is_empty()),
            path: std::env::var_os("PATH"),
            cwd: std::env::current_dir().unwrap_or_default(),
        }
    }
}

/// A CLI to run: a program and the arguments that come before the command.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Cli {
    pub program: PathBuf,
    pub args: Vec<String>,
    /// How the status bar names it.
    pub label: String,
}

/// Which CLI to run: the override; else `roadmap` on PATH, which hands off
/// to a copy the repo pins; else `npx --no -- roadmap`, for a repo that has
/// it as a dev dependency. `Err` lists what was tried.
pub fn resolve(env: &Env) -> Result<Cli, Vec<String>> {
    let find = |name: &str| which::which_in(name, env.path.clone(), &env.cwd).ok();
    if let Some(text) = &env.cli_override {
        let words = shell_words::split(text).map_err(|e| vec![format!("--cli {text:?}: {e}")])?;
        let (first, rest) = words.split_first().ok_or_else(|| vec!["--cli is empty".to_string()])?;
        let program = if first.contains('/') {
            PathBuf::from(first)
        } else {
            find(first).unwrap_or_else(|| first.into())
        };
        return Ok(Cli {
            program,
            args: rest.to_vec(),
            label: text.clone(),
        });
    }
    if let Some(program) = find("roadmap") {
        return Ok(Cli {
            label: "roadmap".into(),
            program,
            args: vec![],
        });
    }
    if let Some(program) = find("npx") {
        return Ok(Cli {
            label: "npx --no -- roadmap".into(),
            program,
            args: vec!["--no".into(), "--".into(), "roadmap".into()],
        });
    }
    Err(vec![
        "roadmap on PATH".into(),
        "npx on PATH, to run npx --no -- roadmap".into(),
    ])
}

/// What a command printed, kept word for word.
#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct RawOutput {
    pub command: String,
    /// None when it was killed or ended by a signal.
    pub status: Option<i32>,
    pub stdout: String,
    pub stderr: String,
    pub timed_out: bool,
}

/// Why a command didn't run or didn't answer usefully. Each keeps what the
/// CLI printed so the GUI can show it word for word, and none is a guess.
#[derive(Debug, Clone, PartialEq)]
pub enum Problem {
    /// No CLI was found, or the one named couldn't be started.
    Missing { tried: Vec<String> },
    /// A schema-1 document with `ok: false`. `stderr` is kept for `crash`,
    /// whose stack trace goes there.
    Refused {
        rule: String,
        message: String,
        warnings: Vec<String>,
        stderr: Option<String>,
    },
    /// A document with a schema this GUI doesn't read.
    UnsupportedSchema { schema: Value, raw: RawOutput },
    /// stdout isn't one JSON document: a CLI from before the schema, npx
    /// without the package, or a crash before any output.
    NoJson { raw: RawOutput },
    /// Killed after the timeout.
    TimedOut { raw: RawOutput, after: Duration },
    /// A schema-1 `ok` document that isn't the snapshot.
    BadSnapshot { error: String, raw: RawOutput },
}

/// Run `cli args...` in `cwd`. stdin is null so nothing can prompt; stdout
/// and stderr are read on their own threads so a big answer can't fill a
/// pipe; and after `timeout` the whole process group is killed, since `npx`
/// or a shell leaves children behind. The readers are then not waited for,
/// because a grandchild may still hold the pipes.
pub fn run(cli: &Cli, args: &[&str], cwd: &Path, timeout: Duration) -> Result<RawOutput, Problem> {
    let command = std::iter::once(cli.program.display().to_string())
        .chain(cli.args.iter().cloned())
        .chain(args.iter().map(|a| a.to_string()))
        .map(|w| shell_words::quote(&w).into_owned())
        .collect::<Vec<_>>()
        .join(" ");
    let mut cmd = Command::new(&cli.program);
    cmd.args(&cli.args)
        .args(args)
        .current_dir(cwd)
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    #[cfg(unix)]
    {
        use std::os::unix::process::CommandExt;
        cmd.process_group(0);
    }
    let mut child = cmd.spawn().map_err(|e| Problem::Missing {
        tried: vec![format!("{command}: {e}")],
    })?;
    let out = reader(child.stdout.take());
    let err = reader(child.stderr.take());
    let waited = child.wait_timeout(timeout).map_err(|e| Problem::Missing {
        tried: vec![format!("{command}: {e}")],
    })?;
    let (status, timed_out, grace) = match waited {
        Some(status) => (status.code(), false, Duration::from_secs(5)),
        None => {
            kill_group(&mut child);
            let _ = child.wait();
            (None, true, Duration::from_millis(200))
        }
    };
    Ok(RawOutput {
        command,
        status,
        stdout: out.recv_timeout(grace).unwrap_or_default(),
        stderr: err.recv_timeout(grace).unwrap_or_default(),
        timed_out,
    })
}

fn reader(pipe: Option<impl Read + Send + 'static>) -> mpsc::Receiver<String> {
    let (tx, rx) = mpsc::channel();
    if let Some(mut pipe) = pipe {
        thread::spawn(move || {
            let mut bytes = Vec::new();
            let _ = pipe.read_to_end(&mut bytes);
            let _ = tx.send(String::from_utf8_lossy(&bytes).into_owned());
        });
    }
    rx
}

fn kill_group(child: &mut std::process::Child) {
    #[cfg(unix)]
    {
        // The child leads its own group (process_group(0)), so -pid is the group.
        // SAFETY: kill() has no memory effects; a stale pid is at worst ESRCH.
        unsafe {
            libc::kill(-(child.id() as i32), libc::SIGKILL);
        }
    }
    let _ = child.kill();
}

/// The envelope every `--json` answer has, from stdout alone: `Ok` with the
/// document for schema 1 and `ok: true`, else the problem.
pub fn document(raw: RawOutput, timeout: Duration) -> Result<Value, Problem> {
    if raw.timed_out {
        return Err(Problem::TimedOut { raw, after: timeout });
    }
    let doc: Value = match serde_json::from_str(raw.stdout.trim()) {
        Ok(doc @ Value::Object(_)) => doc,
        _ => return Err(Problem::NoJson { raw }),
    };
    let Some(schema) = doc.get("schema").cloned() else {
        return Err(Problem::NoJson { raw });
    };
    if schema.as_i64() != Some(SCHEMA) {
        return Err(Problem::UnsupportedSchema { schema, raw });
    }
    if doc.get("ok") == Some(&Value::Bool(true)) {
        return Ok(doc);
    }
    let text = |key: &str| doc.get(key).and_then(Value::as_str).unwrap_or("").to_string();
    let rule = text("rule");
    let warnings = doc
        .get("warnings")
        .and_then(Value::as_array)
        .map(|w| w.iter().filter_map(|v| v.as_str().map(String::from)).collect())
        .unwrap_or_default();
    let stderr = (rule == "crash").then(|| raw.stderr.clone());
    Err(Problem::Refused {
        message: text("message"),
        rule,
        warnings,
        stderr,
    })
}

/// `export` for the roadmap at `dir`, run from its parent so that a hand-off
/// to a pinned copy and npx both resolve from the repo.
pub fn export(cli: &Cli, dir: &Path, timeout: Duration) -> Result<Snapshot, Problem> {
    let cwd = dir.parent().unwrap_or(dir);
    let dir_arg = dir.display().to_string();
    let raw = run(cli, &["export", "--dir", &dir_arg], cwd, timeout)?;
    let doc = document(raw.clone(), timeout)?;
    serde_json::from_value(doc).map_err(|e| Problem::BadSnapshot {
        error: e.to_string(),
        raw,
    })
}

#[cfg(all(test, unix))]
mod tests {
    use super::*;
    use std::fs;
    use std::os::unix::fs::PermissionsExt;

    /// A fake CLI: a shell script that ignores its arguments.
    fn fake(dir: &Path, name: &str, script: &str) -> PathBuf {
        let path = dir.join(name);
        fs::write(&path, format!("#!/bin/sh\n{script}\n")).unwrap();
        fs::set_permissions(&path, fs::Permissions::from_mode(0o755)).unwrap();
        path
    }

    fn cli(program: PathBuf) -> Cli {
        Cli {
            label: program.display().to_string(),
            program,
            args: vec![],
        }
    }

    fn answer(script: &str) -> Result<Value, Problem> {
        let tmp = tempfile::tempdir().unwrap();
        let raw = run(
            &cli(fake(tmp.path(), "roadmap", script)),
            &["export"],
            tmp.path(),
            TIMEOUT,
        )?;
        document(raw, TIMEOUT)
    }

    #[test]
    fn resolve_prefers_the_override_then_roadmap_then_npx() {
        let tmp = tempfile::tempdir().unwrap();
        let bin = tmp.path().join("bin");
        fs::create_dir(&bin).unwrap();
        let env = |over: Option<&str>| Env {
            cli_override: over.map(String::from),
            path: Some(bin.clone().into_os_string()),
            cwd: tmp.path().into(),
        };

        assert!(resolve(&env(None)).is_err());
        let npx = fake(&bin, "npx", "");
        assert_eq!(resolve(&env(None)).unwrap().args, ["--no", "--", "roadmap"]);
        assert_eq!(resolve(&env(None)).unwrap().program, npx);
        let roadmap = fake(&bin, "roadmap", "");
        assert_eq!(
            resolve(&env(None)).unwrap(),
            Cli {
                program: roadmap,
                args: vec![],
                label: "roadmap".into()
            }
        );

        let over = resolve(&env(Some("node '/a b/roadmap.js' --x"))).unwrap();
        assert_eq!(over.args, ["/a b/roadmap.js", "--x"]);
        assert_eq!(over.label, "node '/a b/roadmap.js' --x");
        assert_eq!(
            resolve(&env(Some("./bin/roadmap"))).unwrap().program,
            PathBuf::from("./bin/roadmap")
        );
        assert!(resolve(&env(Some("'unclosed"))).is_err());
    }

    #[test]
    fn a_schema_1_document_is_ok() {
        let doc = answer(r#"echo '{"schema": 1, "ok": true, "warnings": [], "items": []}'"#).unwrap();
        assert_eq!(doc["items"], Value::Array(vec![]));
    }

    #[test]
    fn another_schema_is_unsupported() {
        let problem = answer(r#"echo '{"schema": 2, "ok": true}'"#).unwrap_err();
        assert!(matches!(problem, Problem::UnsupportedSchema { schema, .. } if schema == 2));
    }

    #[test]
    fn a_refusal_keeps_its_words_and_a_crash_its_stack() {
        let problem = answer(r#"echo '{"schema": 1, "ok": false, "warnings": ["w"], "rule": "no-roadmap", "message": "no roadmap at x"}'"#).unwrap_err();
        assert_eq!(
            problem,
            Problem::Refused {
                rule: "no-roadmap".into(),
                message: "no roadmap at x".into(),
                warnings: vec!["w".into()],
                stderr: None
            }
        );
        let crash = answer(r#"echo '{"schema": 1, "ok": false, "warnings": [], "rule": "crash", "message": "boom"}'; echo 'at foo.js:1' >&2; exit 1"#).unwrap_err();
        assert!(matches!(crash, Problem::Refused { stderr: Some(s), .. } if s == "at foo.js:1\n"));
    }

    #[test]
    fn a_cli_from_before_the_schema_answers_without_json() {
        // What roadmap 2.2.0 prints for `export`: a usage error on stderr, exit 2.
        let script = "echo 'usage: roadmap [-h] [--version] command ...' >&2\necho \"roadmap: error: argument command: invalid choice: 'export'\" >&2\nexit 2";
        let Err(Problem::NoJson { raw }) = answer(script) else {
            panic!("expected NoJson")
        };
        assert_eq!(raw.status, Some(2));
        assert_eq!(raw.stdout, "");
        assert!(raw.stderr.contains("invalid choice: 'export'"), "{}", raw.stderr);
        assert!(raw.command.ends_with("roadmap export"), "{}", raw.command);
    }

    #[test]
    fn a_hung_cli_is_killed_with_its_children() {
        let tmp = tempfile::tempdir().unwrap();
        let program = fake(tmp.path(), "roadmap", "echo started\nsleep 30 &\nsleep 30");
        let begun = std::time::Instant::now();
        let raw = run(&cli(program), &[], tmp.path(), Duration::from_secs(1)).unwrap();
        assert!(begun.elapsed() < Duration::from_secs(5), "took {:?}", begun.elapsed());
        assert!(raw.timed_out);
        assert!(matches!(
            document(raw, Duration::from_secs(1)),
            Err(Problem::TimedOut { .. })
        ));
    }

    #[test]
    fn a_missing_program_is_missing() {
        let tmp = tempfile::tempdir().unwrap();
        let problem = run(&cli(tmp.path().join("nope")), &[], tmp.path(), TIMEOUT).unwrap_err();
        assert!(matches!(problem, Problem::Missing { tried } if tried[0].contains("nope")));
    }

    #[test]
    fn export_runs_from_the_roadmaps_parent_and_parses_the_snapshot() {
        let tmp = tempfile::tempdir().unwrap();
        let dir = tmp.path().join("roadmap");
        fs::create_dir(&dir).unwrap();
        let script = r#"echo "{\"schema\": 1, \"ok\": true, \"warnings\": [], \"dir\": \"$(pwd)|$*\"}""#;
        let snapshot = export(&cli(fake(tmp.path(), "fake-cli", script)), &dir, TIMEOUT).unwrap();
        let parent = tmp.path().display().to_string();
        assert_eq!(snapshot.dir, format!("{parent}|export --dir {}", dir.display()));
    }
}
