use rustpilot_lib::domain::git_graph::{GraphEdge, LogCommit, layout_graph};

fn commit(hash: &str, parents: &[&str]) -> LogCommit {
    LogCommit {
        hash: hash.to_string(),
        parents: parents.iter().map(|p| p.to_string()).collect(),
        author: "A".into(),
        email: "a@example.invalid".into(),
        timestamp: 0,
        subject: hash.to_string(),
        refs: Vec::new(),
    }
}

fn columns(commits: &[LogCommit]) -> Vec<u32> {
    layout_graph(commits, &[]).0.iter().map(|row| row.column).collect()
}

fn edge(column: u32, color: u32) -> GraphEdge {
    GraphEdge { column, color }
}

#[test]
fn a_straight_history_stays_in_one_lane() {
    let log = [commit("c", &["b"]), commit("b", &["a"]), commit("a", &[])];
    let (rows, state) = layout_graph(&log, &[]);
    assert_eq!(rows.iter().map(|r| r.column).collect::<Vec<_>>(), vec![0, 0, 0]);
    assert!(rows.iter().all(|r| r.color == rows[0].color), "one lane keeps one color");
    assert!(state.is_empty(), "the root commit ends the lane");
}

#[test]
fn the_first_row_has_nothing_coming_in_and_the_last_has_nothing_going_out() {
    let log = [commit("b", &["a"]), commit("a", &[])];
    let (rows, _) = layout_graph(&log, &[]);
    assert!(rows[0].incoming.is_empty());
    assert_eq!(rows[0].outgoing, vec![edge(0, rows[0].color)]);
    assert_eq!(rows[1].incoming, vec![edge(0, rows[0].color)]);
    assert!(rows[1].outgoing.is_empty());
}

#[test]
fn a_merge_opens_a_second_lane_and_closes_it_where_the_branches_meet() {
    // m merges f (feature) into main; both come from base.
    let log = [commit("m", &["main1", "f"]), commit("f", &["base"]), commit("main1", &["base"]), commit("base", &[])];
    let (rows, state) = layout_graph(&log, &[]);
    // A lane never moves: main1 joins the lane that already leads to base, which is lane 1.
    assert_eq!(rows.iter().map(|r| r.column).collect::<Vec<_>>(), vec![0, 1, 0, 1]);
    // The merge fans out to two lanes.
    assert_eq!(rows[0].outgoing.len(), 2);
    // While f is drawn, the main lane passes behind it.
    assert_eq!(rows[1].through.len(), 1);
    assert_eq!(rows[1].through[0].column, 0);
    // main1 ends its own lane by joining lane 1.
    assert_eq!(rows[2].outgoing, vec![edge(1, rows[1].color)]);
    assert_eq!(rows[3].incoming.len(), 1);
    assert!(state.is_empty());
}

#[test]
fn two_lanes_that_lead_to_the_same_parent_join_into_one() {
    let log = [commit("a", &["base"]), commit("b", &["base"]), commit("base", &[])];
    let (rows, _) = layout_graph(&log, &[]);
    assert_eq!(rows[0].column, 0);
    assert_eq!(rows[1].column, 1, "b is a second tip, so it gets its own lane");
    assert_eq!(rows[1].outgoing, vec![edge(0, rows[0].color)], "b joins the lane that already leads to base");
    assert_eq!(rows[2].column, 0);
}

#[test]
fn an_octopus_merge_gets_a_lane_for_every_parent() {
    let log = [commit("m", &["a", "b", "c"]), commit("a", &[]), commit("b", &[]), commit("c", &[])];
    let (rows, _) = layout_graph(&log, &[]);
    assert_eq!(rows[0].outgoing.len(), 3);
    let mut cols: Vec<u32> = rows[0].outgoing.iter().map(|e| e.column).collect();
    cols.sort();
    cols.dedup();
    assert_eq!(cols.len(), 3, "three different lanes");
}

#[test]
fn lanes_have_distinct_colors_and_keep_theirs() {
    let log = [commit("m", &["a", "b"]), commit("a", &["x"]), commit("b", &["x"]), commit("x", &[])];
    let (rows, _) = layout_graph(&log, &[]);
    assert_ne!(rows[0].outgoing[0].color, rows[0].outgoing[1].color);
    let main_color = rows[0].outgoing[0].color;
    assert_eq!(rows[1].color, main_color, "the lane keeps its color down the page");
}

#[test]
fn freed_lanes_are_reused() {
    let log = [
        commit("m1", &["a", "f1"]),
        commit("f1", &["a"]),
        commit("a", &["m2"]),
        commit("m2", &["b", "f2"]),
        commit("f2", &["b"]),
        commit("b", &[]),
    ];
    let (rows, _) = layout_graph(&log, &[]);
    let max = rows.iter().map(|r| r.column).max().unwrap();
    assert_eq!(max, 1, "never more than two lanes at once");
}

#[test]
fn a_page_ends_with_the_lanes_still_open_and_the_next_page_continues_them() {
    let all = [commit("d", &["c"]), commit("c", &["b"]), commit("b", &["a"]), commit("a", &[])];
    let (whole, _) = layout_graph(&all, &[]);
    let (first, state) = layout_graph(&all[..2], &[]);
    assert_eq!(state.len(), 1, "the lane waiting for b stays open");
    let (second, _) = layout_graph(&all[2..], &state);
    let joined: Vec<_> = first.iter().chain(second.iter()).collect();
    assert_eq!(joined, whole.iter().collect::<Vec<_>>());
}

#[test]
fn a_parent_cut_off_by_the_page_still_gets_its_lane() {
    let (rows, state) = layout_graph(&[commit("x", &["unknown-parent"])], &[]);
    assert_eq!(rows[0].outgoing.len(), 1);
    assert_eq!(state.len(), 1);
}

#[test]
fn a_commit_listed_twice_does_not_break_the_layout() {
    let (rows, _) = layout_graph(&[commit("a", &["b"]), commit("a", &["b"]), commit("b", &[])], &[]);
    assert_eq!(rows.len(), 3);
}

#[test]
fn an_empty_log_is_empty() {
    let (rows, state) = layout_graph(&[], &[]);
    assert!(rows.is_empty() && state.is_empty());
}
