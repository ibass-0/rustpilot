//! The commit graph of `git log`: what a commit row is, and how commits are laid out in lanes.

use serde::{Deserialize, Serialize};

#[derive(Clone, Copy, Debug, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum RefKind {
    Head,
    Branch,
    Remote,
    Tag,
    Stash,
}

/// A branch, tag or `HEAD` pointing at a commit.
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RefLabel {
    pub name: String,
    pub kind: RefKind,
    /// The branch that is checked out.
    pub current: bool,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LogCommit {
    pub hash: String,
    pub parents: Vec<String>,
    pub author: String,
    pub email: String,
    /// Seconds since the Unix epoch.
    pub timestamp: i64,
    pub subject: String,
    pub refs: Vec<RefLabel>,
}

/// A line segment of the graph that ends in (or starts from) a lane at the given column.
#[derive(Clone, Copy, Debug, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GraphEdge {
    pub column: u32,
    pub color: u32,
}

/// How one commit is drawn.
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GraphRow {
    /// The lane the commit dot sits on.
    pub column: u32,
    pub color: u32,
    /// Lanes that arrive from above and end at this commit.
    pub incoming: Vec<GraphEdge>,
    /// Lanes that pass by this row without touching the commit.
    pub through: Vec<GraphEdge>,
    /// Lanes the commit continues into, one per parent.
    pub outgoing: Vec<GraphEdge>,
    /// How many lanes are drawn at this row, for the width of the graph column.
    pub width: u32,
}

/// A lane that is waiting for the commit `hash`. The color is the lane's column when it was opened.
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LaneSlot {
    pub hash: String,
    pub color: u32,
}

pub type Lanes = Vec<Option<LaneSlot>>;

fn lane_of(lanes: &Lanes, hash: &str) -> Option<usize> {
    lanes.iter().position(|slot| slot.as_ref().is_some_and(|s| s.hash == hash))
}

fn first_free(lanes: &mut Lanes) -> usize {
    match lanes.iter().position(Option::is_none) {
        Some(index) => index,
        None => {
            lanes.push(None);
            lanes.len() - 1
        }
    }
}

/// Lay `commits` (newest first, parents after their children) out in lanes. `open` is the lane state
/// left by the previous page, empty for the first one. Gives a row per commit and the lanes still open
/// after the last one, to continue the next page with. A lane never moves to another column.
pub fn layout_graph(commits: &[LogCommit], open: &[Option<LaneSlot>]) -> (Vec<GraphRow>, Lanes) {
    let mut lanes: Lanes = open.to_vec();
    let mut rows = Vec::with_capacity(commits.len());

    for commit in commits {
        let matching: Vec<usize> = lanes
            .iter()
            .enumerate()
            .filter(|(_, slot)| slot.as_ref().is_some_and(|s| s.hash == commit.hash))
            .map(|(index, _)| index)
            .collect();

        let (column, color) = match matching.first() {
            Some(&index) => (index, lanes[index].as_ref().map_or(index as u32, |s| s.color)),
            None => {
                let index = first_free(&mut lanes);
                (index, index as u32)
            }
        };
        let incoming: Vec<GraphEdge> = matching
            .iter()
            .filter_map(|&i| lanes[i].as_ref().map(|s| GraphEdge { column: i as u32, color: s.color }))
            .collect();
        let through: Vec<GraphEdge> = lanes
            .iter()
            .enumerate()
            .filter(|(i, slot)| slot.is_some() && !matching.contains(i))
            .filter_map(|(i, slot)| slot.as_ref().map(|s| GraphEdge { column: i as u32, color: s.color }))
            .collect();
        let width_before = lanes.iter().rposition(Option::is_some).map_or(0, |i| i + 1).max(column + 1);

        for &index in &matching {
            lanes[index] = None;
        }

        let mut outgoing = Vec::new();
        for (position, parent) in commit.parents.iter().enumerate() {
            if let Some(existing) = lane_of(&lanes, parent) {
                let color = lanes[existing].as_ref().map_or(existing as u32, |s| s.color);
                outgoing.push(GraphEdge { column: existing as u32, color });
            } else if position == 0 {
                lanes[column] = Some(LaneSlot { hash: parent.clone(), color });
                outgoing.push(GraphEdge { column: column as u32, color });
            } else {
                let index = first_free(&mut lanes);
                lanes[index] = Some(LaneSlot { hash: parent.clone(), color: index as u32 });
                outgoing.push(GraphEdge { column: index as u32, color: index as u32 });
            }
        }

        let width_after = lanes.iter().rposition(Option::is_some).map_or(0, |i| i + 1);
        rows.push(GraphRow {
            column: column as u32,
            color,
            incoming,
            through,
            outgoing,
            width: width_before.max(width_after) as u32,
        });
    }

    while lanes.last().is_some_and(Option::is_none) {
        lanes.pop();
    }
    (rows, lanes)
}
