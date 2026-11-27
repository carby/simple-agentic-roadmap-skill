//! roadmap-gui: a gitk-style window onto a repo's roadmap. It reads the
//! roadmap only through the `roadmap` CLI, keeps no state between runs, and
//! never commits.

mod app;
mod cli;
mod lanes;
mod locate;
mod queue;
mod snapshot;
mod state;
mod ui;
mod watch;

use std::path::PathBuf;
use std::process::ExitCode;

const USAGE: &str = "usage: roadmap-gui [PATH] [--cli \"<command>\"]

Opens the roadmap of the repository PATH is in (default: the current folder).

options:
  --cli \"<command>\"  the roadmap CLI to run, e.g. \"node cli/bin/roadmap.js\"
                     (default: $ROADMAP_CLI, else `roadmap` on PATH, else
                     `npx --no -- roadmap`)
  -h, --help         show this help and exit
  --version          show the version and exit";

struct Args {
    path: Option<PathBuf>,
    cli: Option<String>,
}

fn parse(args: impl Iterator<Item = String>) -> Result<Option<Args>, String> {
    let mut parsed = Args { path: None, cli: None };
    let mut args = args.peekable();
    while let Some(arg) = args.next() {
        match arg.as_str() {
            "-h" | "--help" => {
                println!("{USAGE}");
                return Ok(None);
            }
            "--version" => {
                println!("roadmap-gui {}", env!("CARGO_PKG_VERSION"));
                return Ok(None);
            }
            "--cli" => parsed.cli = Some(args.next().ok_or("--cli needs a command")?),
            _ if arg.starts_with("--cli=") => parsed.cli = Some(arg["--cli=".len()..].to_string()),
            _ if arg.starts_with('-') => return Err(format!("unknown option {arg}")),
            _ if parsed.path.is_none() => parsed.path = Some(PathBuf::from(arg)),
            _ => return Err(format!("unexpected argument {arg}")),
        }
    }
    Ok(Some(parsed))
}

fn main() -> ExitCode {
    let args = match parse(std::env::args().skip(1)) {
        Ok(Some(args)) => args,
        Ok(None) => return ExitCode::SUCCESS,
        Err(message) => {
            eprintln!("{USAGE}\n\nroadmap-gui: error: {message}");
            return ExitCode::from(2);
        }
    };
    let env = cli::Env::from_process(args.cli);
    let start = args.path.unwrap_or_else(|| env.cwd.clone());
    let options = eframe::NativeOptions {
        viewport: eframe::egui::ViewportBuilder::default()
            .with_inner_size([1100.0, 720.0])
            .with_title("Roadmap"),
        ..Default::default()
    };
    match eframe::run_native(
        "roadmap-gui",
        options,
        Box::new(move |cc| Ok(Box::new(app::App::new(&cc.egui_ctx, start, env)))),
    ) {
        Ok(()) => ExitCode::SUCCESS,
        Err(e) => {
            eprintln!("roadmap-gui: {e}");
            ExitCode::FAILURE
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn args(list: &[&str]) -> Result<Option<Args>, String> {
        parse(list.iter().map(|s| s.to_string()))
    }

    #[test]
    fn parses_a_path_and_a_cli() {
        let parsed = args(&["..", "--cli", "node cli/bin/roadmap.js"]).unwrap().unwrap();
        assert_eq!(parsed.path, Some(PathBuf::from("..")));
        assert_eq!(parsed.cli.as_deref(), Some("node cli/bin/roadmap.js"));
        assert_eq!(
            args(&["--cli=roadmap"]).unwrap().unwrap().cli.as_deref(),
            Some("roadmap")
        );
    }

    #[test]
    fn rejects_what_it_doesnt_know() {
        assert!(args(&["--nope"]).is_err());
        assert!(args(&["a", "b"]).is_err());
        assert!(args(&["--cli"]).is_err());
    }
}
