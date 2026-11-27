//! The queue's gutter: dependency lanes laid out the way gitk lays out commit
//! lanes. Pure: rows in, columns and segments out. A dependency normally sits
//! above what depends on it, because `check` keeps the queue in that order;
//! when it doesn't (a roadmap that fails check, an archived item that depends
//! on an open one), the edge becomes a stub instead of a lane.

use std::collections::HashMap;

/// Columns past this one bundle into the last, so the gutter never grows
/// wider than this many lanes.
pub const MAX_LANES: usize = 8;

/// One row of the queue, as the lanes see it. Separators and folds are rows
/// with no node: lanes pass through them.
#[derive(Debug, Clone, Default)]
pub struct Input {
    pub id: String,
    /// The item ids it depends on that might be drawn: items only, never
    /// milestones.
    pub deps: Vec<String>,
    /// Whether lanes leaving this node are drawn as archived (grey).
    pub archived: bool,
    /// The caller already knows of a dependency that isn't shown.
    pub stub: bool,
}

/// A vertical piece of lane in one column.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct Seg {
    pub col: usize,
    pub archived: bool,
}

#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct Row {
    /// The node's column; None for a separator or fold.
    pub node: Option<usize>,
    /// Lanes that run the full height of the row.
    pub through: Vec<Seg>,
    /// Lanes that come in from the top and end at the node: straight when
    /// `col` is the node's column, else a curve across to it.
    pub into: Vec<Seg>,
    /// A lane leaves the node downward; `Some(archived)`.
    pub down: Option<bool>,
    /// A dependency that isn't drawn as a lane.
    pub stub: bool,
}

#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct Lanes {
    pub rows: Vec<Row>,
    /// Columns to draw, at most MAX_LANES.
    pub columns: usize,
    /// How many columns the layout needed before bundling.
    pub needed: usize,
}

impl Lanes {
    pub fn bundled(&self) -> bool {
        self.needed > MAX_LANES
    }
}

pub fn layout(rows: &[Option<Input>]) -> Lanes {
    let mut index: HashMap<&str, usize> = HashMap::new();
    for (r, row) in rows.iter().enumerate() {
        if let Some(input) = row {
            index.entry(input.id.as_str()).or_insert(r);
        }
    }
    // The dependencies drawn as lanes: those above the row. Anything else
    // that is in the queue (below, itself, or a duplicate) is a stub.
    let mut preds: Vec<Vec<usize>> = vec![Vec::new(); rows.len()];
    let mut stub = vec![false; rows.len()];
    for (r, row) in rows.iter().enumerate() {
        let Some(input) = row else { continue };
        stub[r] = input.stub;
        for dep in &input.deps {
            match index.get(dep.as_str()) {
                Some(&p) if p < r => {
                    if !preds[r].contains(&p) {
                        preds[r].push(p);
                    }
                }
                Some(_) => stub[r] = true,
                None => {}
            }
        }
    }
    let mut succs: Vec<Vec<usize>> = vec![Vec::new(); rows.len()];
    for (r, ps) in preds.iter().enumerate() {
        for &p in ps {
            succs[p].push(r);
        }
    }
    let last: Vec<Option<usize>> = succs.iter().map(|s| s.iter().copied().max()).collect();

    // Columns: a node takes the lowest column of a dependency whose lane ends
    // here, else the first free one.
    let mut col: Vec<usize> = vec![0; rows.len()];
    let mut occupied: Vec<usize> = Vec::new(); // the last row each column is busy for
    for (r, row) in rows.iter().enumerate() {
        if row.is_none() {
            continue;
        }
        let ending = preds[r].iter().filter(|&&p| last[p] == Some(r)).map(|&p| col[p]).min();
        let c = ending.unwrap_or_else(|| (0..).find(|&c| occupied.get(c).is_none_or(|&busy| busy < r)).unwrap());
        col[r] = c;
        let busy = last[r].unwrap_or(r).max(r);
        if c == occupied.len() {
            occupied.push(busy);
        } else {
            occupied[c] = busy;
        }
    }
    let needed = rows
        .iter()
        .enumerate()
        .filter(|(_, row)| row.is_some())
        .map(|(r, _)| col[r] + 1)
        .max()
        .unwrap_or(0);
    let shown = |c: usize| c.min(MAX_LANES - 1);
    let archived = |p: usize| rows[p].as_ref().is_some_and(|i| i.archived);

    let mut out = Vec::with_capacity(rows.len());
    for r in 0..rows.len() {
        let mut row = Row {
            node: rows[r].as_ref().map(|_| shown(col[r])),
            stub: stub[r],
            ..Row::default()
        };
        for p in 0..r {
            let Some(end) = last[p] else { continue };
            if end < r {
                continue;
            }
            let seg = Seg {
                col: shown(col[p]),
                archived: archived(p),
            };
            let continues = succs[p].iter().any(|&s| s > r);
            if continues {
                push(&mut row.through, seg);
            }
            if succs[p].contains(&r) && !(continues && seg.col == row.node.unwrap_or(usize::MAX)) {
                push(&mut row.into, seg);
            }
        }
        if rows[r].is_some() && last[r].is_some() {
            row.down = Some(archived(r));
        }
        out.push(row);
    }
    Lanes {
        rows: out,
        columns: needed.min(MAX_LANES),
        needed,
    }
}

fn push(list: &mut Vec<Seg>, seg: Seg) {
    if !list.contains(&seg) {
        list.push(seg);
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn item(id: &str, deps: &[&str]) -> Option<Input> {
        Some(Input {
            id: id.into(),
            deps: deps.iter().map(|d| d.to_string()).collect(),
            ..Input::default()
        })
    }

    fn cols(lanes: &Lanes) -> Vec<Option<usize>> {
        lanes.rows.iter().map(|r| r.node).collect()
    }

    fn seg(col: usize) -> Seg {
        Seg { col, archived: false }
    }

    #[test]
    fn a_chain_stays_in_one_column() {
        let lanes = layout(&[item("a", &[]), item("b", &["a"]), item("c", &["b"])]);
        assert_eq!(cols(&lanes), [Some(0), Some(0), Some(0)]);
        assert_eq!(lanes.columns, 1);
        assert_eq!(lanes.rows[1].into, [seg(0)]);
        assert_eq!(lanes.rows[1].down, Some(false));
        assert_eq!(lanes.rows[2].down, None);
    }

    #[test]
    fn a_fork_and_a_merge() {
        // a is needed by b and d; c is independent and needed by d.
        let lanes = layout(&[
            item("a", &[]),
            item("b", &["a"]),
            item("c", &[]),
            item("d", &["a", "c"]),
        ]);
        assert_eq!(cols(&lanes), [Some(0), Some(1), Some(1), Some(0)]);
        // a's lane runs past b, and enters b with a curve.
        assert_eq!(lanes.rows[1].through, [seg(0)]);
        assert_eq!(lanes.rows[1].into, [seg(0)]);
        // At d both lanes end: a's straight, c's curving across.
        assert_eq!(lanes.rows[3].into, [seg(0), seg(1)]);
        assert!(lanes.rows[3].through.is_empty());
    }

    #[test]
    fn a_lane_runs_only_between_a_dependency_and_its_last_dependent() {
        let lanes = layout(&[item("a", &[]), item("b", &["a"]), item("x", &[]), item("y", &[])]);
        assert!(lanes.rows[2].through.is_empty() && lanes.rows[2].into.is_empty());
        assert_eq!(cols(&lanes), [Some(0), Some(0), Some(0), Some(0)]);
    }

    #[test]
    fn lanes_pass_through_separators() {
        let lanes = layout(&[item("a", &[]), None, item("b", &["a"])]);
        assert_eq!(lanes.rows[1].node, None);
        assert_eq!(lanes.rows[1].through, [seg(0)]);
    }

    #[test]
    fn a_dependency_below_or_a_cycle_is_a_stub_not_a_lane() {
        let lanes = layout(&[item("a", &["b"]), item("b", &["a"]), item("c", &["c"])]);
        assert!(lanes.rows[0].stub);
        assert!(!lanes.rows[1].stub);
        assert_eq!(lanes.rows[1].into, [seg(0)]);
        assert!(lanes.rows[2].stub);
    }

    #[test]
    fn unknown_ids_draw_nothing_and_the_caller_can_ask_for_a_stub() {
        let mut hidden = item("b", &["gone", "a-milestone"]).unwrap();
        let lanes = layout(&[item("a", &["nowhere"]), Some(hidden.clone())]);
        assert!(!lanes.rows[0].stub && !lanes.rows[1].stub);
        hidden.stub = true;
        assert!(layout(&[Some(hidden)]).rows[0].stub);
    }

    #[test]
    fn archived_lanes_are_marked() {
        let mut a = item("a", &[]).unwrap();
        a.archived = true;
        let lanes = layout(&[Some(a), item("b", &["a"])]);
        assert_eq!(lanes.rows[0].down, Some(true));
        assert_eq!(lanes.rows[1].into, [Seg { col: 0, archived: true }]);
    }

    #[test]
    fn columns_past_the_cap_bundle_into_the_last() {
        // Ten roots, each needed by one item at the bottom: ten lanes at once.
        let ids: Vec<String> = (0..10).map(|i| format!("r{i}")).collect();
        let mut rows: Vec<Option<Input>> = ids.iter().map(|id| item(id, &[])).collect();
        let deps: Vec<&str> = ids.iter().map(String::as_str).collect();
        rows.push(item("z", &deps));
        let lanes = layout(&rows);
        assert_eq!(lanes.needed, 10);
        assert!(lanes.bundled());
        assert_eq!(lanes.columns, MAX_LANES);
        // r9 needed column 9; it is drawn in the last one.
        assert_eq!(lanes.rows[9].node, Some(MAX_LANES - 1));
        assert!(lanes.rows[10].into.iter().all(|s| s.col < MAX_LANES));
        assert_eq!(lanes.rows[10].into.len(), MAX_LANES);
    }
}
