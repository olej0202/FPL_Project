"""Experimental probability-tree optimizer.

The normal linear optimizer remains the production fallback. This module is
only called when the API receives a GW-node tree containing a real split.

Each node is a decision point for one gameweek. Children are possible next
states with conditional probabilities. Transfers are locked through every
shared ancestor, so two paths cannot make different decisions before their
branch becomes known.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Callable, Optional

import pandas as pd

from Generate_Optimize_Pyrobi_test import optimize_my_team


CHIPS = {"none", "wildcard", "freehit", "bench_boost"}


@dataclass(frozen=True)
class TreeNode:
    node_id: str
    label: str
    gw: int
    parent_id: Optional[str]
    probability: float
    chip: str
    scenario_id: str


@dataclass
class LeafResult:
    leaf_id: str
    frame: pd.DataFrame
    objective: float


def _validate_tree(
    tree: dict[str, Any],
) -> tuple[str, dict[str, TreeNode], dict[str, list[str]], dict[str, float]]:
    if not isinstance(tree, dict):
        raise ValueError("scenario_tree must be an object.")
    raw_nodes = tree.get("nodes")
    if not isinstance(raw_nodes, list) or len(raw_nodes) < 1:
        raise ValueError("A probability tree must contain at least one GW node.")

    nodes: dict[str, TreeNode] = {}
    for index, raw in enumerate(raw_nodes):
        if not isinstance(raw, dict):
            raise ValueError("Every tree node must be an object.")
        node_id = str(raw.get("id") or f"node_{index + 1}").strip()
        if not node_id or node_id in nodes:
            raise ValueError("Tree node IDs must be non-empty and unique.")
        try:
            gw = int(raw.get("gw"))
            probability = float(raw.get("probability", 1.0))
        except (TypeError, ValueError):
            raise ValueError(f"Tree node '{node_id}' has an invalid GW or probability.")
        if gw < 1 or gw > 38:
            raise ValueError(f"Tree node '{node_id}' must use a GW from 1 to 38.")
        if probability <= 0:
            raise ValueError(f"Tree node '{node_id}' probability must be greater than zero.")
        parent_value = raw.get("parent_id")
        parent_id = None if parent_value in (None, "") else str(parent_value).strip()
        chip = str(raw.get("chip") or "none").strip().lower()
        if chip not in CHIPS:
            raise ValueError(f"Tree node '{node_id}' has unsupported chip '{chip}'.")
        nodes[node_id] = TreeNode(
            node_id=node_id,
            label=str(raw.get("label") or f"GW{gw}").strip(),
            gw=gw,
            parent_id=parent_id,
            probability=probability,
            chip=chip,
            scenario_id=str(raw.get("scenario_id") or "inherit").strip(),
        )

    roots = [node.node_id for node in nodes.values() if node.parent_id is None]
    if len(roots) != 1:
        raise ValueError("A probability tree must have exactly one root node.")
    root_id = roots[0]

    children: dict[str, list[str]] = {node_id: [] for node_id in nodes}
    for node in nodes.values():
        if node.parent_id is None:
            continue
        if node.parent_id not in nodes:
            raise ValueError(f"Tree node '{node.node_id}' references a missing parent.")
        parent = nodes[node.parent_id]
        if node.gw != parent.gw + 1:
            raise ValueError(
                f"Tree node '{node.node_id}' must be the next GW after its parent "
                f"(GW{parent.gw + 1})."
            )
        children[node.parent_id].append(node.node_id)

    visited: set[str] = set()
    stack = [root_id]
    while stack:
        node_id = stack.pop()
        if node_id in visited:
            raise ValueError("The GW tree contains a cycle.")
        visited.add(node_id)
        stack.extend(children[node_id])
    if len(visited) != len(nodes):
        raise ValueError("Every GW node must be connected to the root.")

    # Sibling probabilities are conditional. Normalize them to tolerate normal
    # percentage-entry rounding such as 33/33/34.
    normalized_nodes = dict(nodes)
    for parent_id, child_ids in children.items():
        if not child_ids:
            continue
        total = sum(nodes[child_id].probability for child_id in child_ids)
        if total <= 0:
            raise ValueError(f"Children of '{parent_id}' need positive probabilities.")
        for child_id in child_ids:
            node = nodes[child_id]
            normalized_nodes[child_id] = TreeNode(
                node_id=node.node_id,
                label=node.label,
                gw=node.gw,
                parent_id=node.parent_id,
                probability=node.probability / total,
                chip=node.chip,
                scenario_id=node.scenario_id,
            )
    normalized_nodes[root_id] = TreeNode(
        node_id=nodes[root_id].node_id,
        label=nodes[root_id].label,
        gw=nodes[root_id].gw,
        parent_id=None,
        probability=1.0,
        chip=nodes[root_id].chip,
        scenario_id="base",
    )
    nodes = normalized_nodes

    leaf_probabilities: dict[str, float] = {}

    def visit(node_id: str, path_probability: float, chips_on_path: set[str]) -> None:
        node = nodes[node_id]
        next_chips = set(chips_on_path)
        if node.chip != "none":
            if node.chip in next_chips:
                raise ValueError(
                    f"Chip '{node.chip}' appears more than once on the path to '{node_id}'."
                )
            next_chips.add(node.chip)
        probability = path_probability * (1.0 if node.parent_id is None else node.probability)
        if not children[node_id]:
            leaf_probabilities[node_id] = probability
            return
        for child_id in children[node_id]:
            visit(child_id, probability, next_chips)

    visit(root_id, 1.0, set())
    return root_id, nodes, children, leaf_probabilities


def _path_to_root(node_id: str, nodes: dict[str, TreeNode]) -> list[TreeNode]:
    path: list[TreeNode] = []
    current: Optional[str] = node_id
    while current is not None:
        node = nodes[current]
        path.append(node)
        current = node.parent_id
    return list(reversed(path))


def _chip_kwargs(leaf_id: str, nodes: dict[str, TreeNode]) -> dict[str, int]:
    chips = {"wildcard": 40, "freehit": 40, "bench_boost": 40}
    for node in _path_to_root(leaf_id, nodes):
        if node.chip in chips:
            chips[node.chip] = node.gw
    return {
        "wildcard_round": chips["wildcard"],
        "free_hit_round": chips["freehit"],
        "bb_round": chips["bench_boost"],
    }


def _scenario_override_for_leaf(
    leaf_id: str,
    nodes: dict[str, TreeNode],
    base_players: Optional[pd.DataFrame],
    scenario_players_by_id: dict[str, pd.DataFrame],
) -> Optional[pd.DataFrame]:
    if base_players is None or base_players.empty:
        return base_players

    required = ["name", "GW", "Points"]
    result = base_players[required].copy()
    result["name"] = result["name"].astype(str).str.strip()
    result["GW"] = pd.to_numeric(result["GW"], errors="coerce")
    result["Points"] = pd.to_numeric(result["Points"], errors="coerce")
    result = result.dropna(subset=required).drop_duplicates(["name", "GW"], keep="last")

    sources = {"base": result.copy()}
    for scenario_id, frame in scenario_players_by_id.items():
        if frame is None or frame.empty:
            continue
        source = frame[required].copy()
        source["name"] = source["name"].astype(str).str.strip()
        source["GW"] = pd.to_numeric(source["GW"], errors="coerce")
        source["Points"] = pd.to_numeric(source["Points"], errors="coerce")
        sources[str(scenario_id)] = (
            source.dropna(subset=required).drop_duplicates(["name", "GW"], keep="last")
        )

    result = result.set_index(["name", "GW"])
    active_scenario = "base"
    for node in _path_to_root(leaf_id, nodes):
        requested = str(node.scenario_id or "inherit")
        if requested == "inherit":
            continue
        active_scenario = requested
        source = sources.get(active_scenario)
        if source is None:
            raise ValueError(
                f"Statistical scenario '{active_scenario}' used by node '{node.label}' "
                "was not included in the optimizer request."
            )
        replacement = source[source["GW"] >= node.gw].set_index(["name", "GW"])
        result.update(replacement[["Points"]])
        missing = replacement.index.difference(result.index)
        if len(missing):
            result = pd.concat([result, replacement.loc[missing, ["Points"]]])

    return result.reset_index()


def _descendant_leaves(node_id: str, children: dict[str, list[str]]) -> list[str]:
    if not children[node_id]:
        return [node_id]
    leaves: list[str] = []
    for child_id in children[node_id]:
        leaves.extend(_descendant_leaves(child_id, children))
    return leaves


def _segment_endpoint(start_id: str, children: dict[str, list[str]]) -> str:
    current = start_id
    while len(children[current]) == 1:
        current = children[current][0]
    return current


def _player_name(row: dict[str, Any]) -> str:
    return str(row.get("Name") or row.get("name") or "").strip()


def _pair_transfer_rows(group: pd.DataFrame) -> list[dict[str, Any]]:
    outs = group[group["status"] == "transferred_out"].to_dict("records")
    ins = group[group["status"] == "transferred_in"].to_dict("records")
    pairs: list[dict[str, Any]] = []

    for out_row in list(outs):
        forced_id = out_row.get("Forced_transfer_id")
        if not forced_id or pd.isna(forced_id):
            continue
        match_index = next(
            (index for index, in_row in enumerate(ins) if in_row.get("Forced_transfer_id") == forced_id),
            None,
        )
        if match_index is None:
            continue
        in_row = ins.pop(match_index)
        outs.remove(out_row)
        pairs.append({"out_name": _player_name(out_row), "in_name": _player_name(in_row)})

    for out_row in outs:
        position = str(out_row.get("position") or "")
        match_index = next(
            (index for index, in_row in enumerate(ins) if str(in_row.get("position") or "") == position),
            None,
        )
        if match_index is None:
            continue
        in_row = ins.pop(match_index)
        pairs.append({"out_name": _player_name(out_row), "in_name": _player_name(in_row)})
    return pairs


def _extract_prefix(
    solution_df: pd.DataFrame, through_gw: int
) -> tuple[list[dict[str, Any]], dict[int, int]]:
    transfer_rows = solution_df[
        solution_df["status"].isin(["transferred_in", "transferred_out"])
    ].copy()
    transfer_rows["GW_num"] = pd.to_numeric(transfer_rows["GW"], errors="coerce")
    transfer_rows = transfer_rows[transfer_rows["GW_num"].between(1, through_gw)]
    moves: list[dict[str, Any]] = []
    counts: dict[int, int] = {}
    for gw, group in transfer_rows.groupby("GW_num", sort=True):
        pairs = _pair_transfer_rows(group)
        counts[int(gw)] = len(pairs)
        moves.extend({"gw": int(gw), **pair} for pair in pairs)

    numeric_gws = pd.to_numeric(solution_df.get("GW"), errors="coerce").dropna()
    for gw in sorted({int(value) for value in numeric_gws if 1 <= int(value) <= through_gw}):
        counts.setdefault(gw, 0)
    return moves, counts


def _prefix_key(
    moves: list[dict[str, Any]], counts: dict[int, int]
) -> tuple[Any, ...]:
    normalized_moves = tuple(
        sorted(
            (
                int(move["gw"]),
                str(move["out_name"]).strip().lower(),
                str(move["in_name"]).strip().lower(),
            )
            for move in moves
        )
    )
    return normalized_moves, tuple(sorted((int(gw), int(count)) for gw, count in counts.items()))


def _merge_moves(*move_groups: list[dict[str, Any]]) -> list[dict[str, Any]]:
    merged: list[dict[str, Any]] = []
    seen: set[tuple[int, str, str]] = set()
    for move in (move for group in move_groups for move in group):
        key = (
            int(move["gw"]),
            str(move["out_name"]).strip().lower(),
            str(move["in_name"]).strip().lower(),
        )
        if key not in seen:
            seen.add(key)
            merged.append(dict(move))
    return merged


def _objective_value(result: pd.DataFrame) -> float:
    if result.empty:
        raise ValueError("A tree path returned no feasible optimizer result.")
    if "Name" in result.columns:
        obj_rows = result[result["Name"] == "Obj Value"]
        if not obj_rows.empty:
            value = pd.to_numeric(obj_rows.iloc[0]["status"], errors="coerce")
            if pd.notna(value):
                return float(value)
    values = pd.to_numeric(result.get("solution_TotalExpectedPoints"), errors="coerce").dropna()
    if values.empty:
        raise ValueError("A tree path result did not contain an objective value.")
    return float(values.iloc[0])


def optimize_scenario_tree(
    *,
    scenario_tree: dict[str, Any],
    scenario_players_by_id: Optional[dict[str, pd.DataFrame]] = None,
    on_solution: Optional[Callable[[int, list[dict[str, Any]]], None]] = None,
    **base_kwargs: Any,
) -> pd.DataFrame:
    """Optimize all leaf paths while enforcing shared decisions at every split."""

    root_id, nodes, children, leaf_probabilities = _validate_tree(scenario_tree)
    max_candidates = max(1, min(4, int(scenario_tree.get("max_prefix_candidates", 2))))
    base_forced = list(base_kwargs.get("forced_transfers") or [])
    scenario_players_by_id = scenario_players_by_id or {}

    def players_for_leaf(leaf_id: str) -> Optional[pd.DataFrame]:
        return _scenario_override_for_leaf(
            leaf_id,
            nodes,
            base_kwargs.get("players_override"),
            scenario_players_by_id,
        )

    def solve_leaf(
        leaf_id: str,
        forced_moves: list[dict[str, Any]],
        locked_counts: dict[int, int],
    ) -> LeafResult:
        kwargs = dict(base_kwargs)
        kwargs.update(
            **_chip_kwargs(leaf_id, nodes),
            forced_transfers=_merge_moves(base_forced, forced_moves),
            locked_transfer_counts_by_gw=dict(locked_counts),
            players_override=players_for_leaf(leaf_id),
            n_solutions=1,
            on_solution=None,
        )
        result = optimize_my_team(**kwargs)
        return LeafResult(leaf_id, result, _objective_value(result))

    def candidate_prefixes(
        endpoint_id: str,
        forced_moves: list[dict[str, Any]],
        locked_counts: dict[int, int],
    ) -> list[tuple[list[dict[str, Any]], dict[int, int]]]:
        leaves = sorted(
            _descendant_leaves(endpoint_id, children),
            key=lambda leaf_id: leaf_probabilities[leaf_id],
            reverse=True,
        )
        candidates: list[tuple[list[dict[str, Any]], dict[int, int]]] = []
        seen: set[tuple[Any, ...]] = set()
        for leaf_id in leaves:
            kwargs = dict(base_kwargs)
            kwargs.update(
                **_chip_kwargs(leaf_id, nodes),
                forced_transfers=_merge_moves(base_forced, forced_moves),
                locked_transfer_counts_by_gw=dict(locked_counts),
                players_override=players_for_leaf(leaf_id),
                n_solutions=1,
                on_solution=None,
            )
            result = optimize_my_team(**kwargs)
            if result.empty or "solution" not in result.columns:
                continue
            moves, counts = _extract_prefix(result, nodes[endpoint_id].gw)
            key = _prefix_key(moves, counts)
            if key in seen:
                continue
            seen.add(key)
            candidates.append((moves, counts))
            if len(candidates) >= max_candidates:
                break
        if not candidates:
            raise ValueError(
                f"No feasible shared transfer plan was found through GW{nodes[endpoint_id].gw}."
            )
        return candidates

    def solve_subtree(
        start_id: str,
        inherited_moves: list[dict[str, Any]],
        inherited_counts: dict[int, int],
    ) -> tuple[float, list[LeafResult], list[dict[str, Any]], dict[int, int]]:
        endpoint_id = _segment_endpoint(start_id, children)
        endpoint_children = children[endpoint_id]
        if not endpoint_children:
            leaf = solve_leaf(endpoint_id, inherited_moves, inherited_counts)
            return leaf.objective, [leaf], inherited_moves, inherited_counts

        best_expected: Optional[float] = None
        best_results: Optional[list[LeafResult]] = None
        best_moves: Optional[list[dict[str, Any]]] = None
        best_counts: Optional[dict[int, int]] = None
        for prefix_moves, prefix_counts in candidate_prefixes(
            endpoint_id, inherited_moves, inherited_counts
        ):
            combined_moves = _merge_moves(inherited_moves, prefix_moves)
            combined_counts = {**inherited_counts, **prefix_counts}
            expected = 0.0
            results: list[LeafResult] = []
            feasible = True
            for child_id in endpoint_children:
                try:
                    child_expected, child_results, _, _ = solve_subtree(
                        child_id, combined_moves, combined_counts
                    )
                except ValueError:
                    feasible = False
                    break
                expected += nodes[child_id].probability * child_expected
                results.extend(child_results)
            if feasible and (best_expected is None or expected > best_expected):
                best_expected = expected
                best_results = results
                best_moves = combined_moves
                best_counts = combined_counts

        if best_expected is None or best_results is None:
            raise ValueError(
                f"No feasible policy was found for the split after GW{nodes[endpoint_id].gw}."
            )
        return best_expected, best_results, best_moves or [], best_counts or {}

    expected_objective, leaf_results, _, _ = solve_subtree(root_id, [], {})
    output_frames: list[pd.DataFrame] = []
    for leaf_result in leaf_results:
        path = _path_to_root(leaf_result.leaf_id, nodes)
        path_label = " → ".join(node.label for node in path)
        leaf_df = leaf_result.frame.copy()
        leaf_df["solution"] = 1
        leaf_df["tree_branch_id"] = leaf_result.leaf_id
        leaf_df["tree_branch_label"] = path_label
        leaf_df["tree_branch_probability"] = leaf_probabilities[leaf_result.leaf_id]
        leaf_df["tree_branch_objective"] = leaf_result.objective
        leaf_df["tree_expected_objective"] = expected_objective
        split_gws = [nodes[node_id].gw for node_id, child_ids in children.items() if len(child_ids) > 1]
        leaf_df["tree_split_gw"] = min(split_gws) if split_gws else nodes[root_id].gw
        leaf_df["tree_path_node_ids"] = ">".join(node.node_id for node in path)
        active_scenario = "base"
        scenario_path: list[str] = []
        for node in path:
            if node.scenario_id != "inherit":
                active_scenario = node.scenario_id
            scenario_path.append(f"GW{node.gw}:{active_scenario}")
        leaf_df["tree_scenario_id"] = active_scenario
        leaf_df["tree_scenario_path"] = ">".join(scenario_path)
        output_frames.append(leaf_df)

    output = pd.concat(output_frames, ignore_index=True)
    if on_solution is not None:
        safe_output = output.astype(object).where(pd.notna(output), None)
        on_solution(1, safe_output.to_dict(orient="records"))
    return output


__all__ = ["optimize_scenario_tree"]
