"""Probability-tree optimization with outcomes revealed after each deadline.

Split paths are solved jointly. Transfers, lineups and captains cannot depend
on the current gameweek's unknown outcome. A single path uses the linear solver.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Callable, Optional

import pandas as pd
import pyomo.environ as pyo

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


def _projection_diagnostics(
    base_players: Optional[pd.DataFrame],
    leaf_players: Optional[pd.DataFrame],
) -> dict[str, float | int]:
    """Describe the exact point differences handed to a leaf solve.

    These values are returned with the optimizer result so the UI can verify
    that two visually different tree branches really used different player
    projections, instead of only showing their scenario labels.
    """

    empty = {
        "changed_rows": 0,
        "signed_diff": 0.0,
        "absolute_diff": 0.0,
        "max_abs_diff": 0.0,
    }
    if base_players is None or leaf_players is None or base_players.empty or leaf_players.empty:
        return empty

    required = ["name", "GW", "Points"]

    def normalized(frame: pd.DataFrame, value_name: str) -> pd.DataFrame:
        data = frame[required].copy()
        data["name"] = data["name"].astype(str).str.strip()
        data["GW"] = pd.to_numeric(data["GW"], errors="coerce")
        data[value_name] = pd.to_numeric(data.pop("Points"), errors="coerce")
        return (
            data.dropna(subset=["name", "GW", value_name])
            .drop_duplicates(["name", "GW"], keep="last")
            .set_index(["name", "GW"])
        )

    base = normalized(base_players, "base_points")
    leaf = normalized(leaf_players, "leaf_points")
    comparison = base.join(leaf, how="outer").fillna(0.0)
    differences = comparison["leaf_points"] - comparison["base_points"]
    changed = differences[differences.abs() > 1e-9]
    if changed.empty:
        return empty
    return {
        "changed_rows": int(changed.size),
        "signed_diff": float(changed.sum()),
        "absolute_diff": float(changed.abs().sum()),
        "max_abs_diff": float(changed.abs().max()),
    }


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
    base_objectives = pd.to_numeric(result.get("solution_base_objective"), errors="coerce").dropna()
    if not base_objectives.empty:
        return float(base_objectives.iloc[0])
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


def _result_metric(result: pd.DataFrame, column: str, default: float = 0.0) -> float:
    if column not in result.columns:
        return float(default)
    values = pd.to_numeric(result.get(column), errors="coerce").dropna()
    return float(values.iloc[0]) if not values.empty else float(default)


def add_shared_deadline_constraints(joint, prepared, paths):
    """Only information from strictly earlier GWs may change a decision."""
    joint.shared_deadline = pyo.ConstraintList()
    representatives = {}
    for leaf_id, item in prepared.items():
        model = item.model
        for gw, t in item.gameweeks.items():
            known = tuple(node.node_id for node in paths[leaf_id] if node.gw < gw)
            group = (gw, known)
            if group not in representatives:
                representatives[group] = (item, t)
                continue
            reference, ref_t = representatives[group]
            other = reference.model
            # Physical team, XI, captain, bench order and transfer accounting
            # all belong to the same pre-deadline decision.
            for name, i in item.player_indices.items():
                j = reference.player_indices[name]
                for attr in ("x", "y", "c", "bench", "transfer_in", "transfer_out"):
                    joint.shared_deadline.add(getattr(model, attr)[i, t] == getattr(other, attr)[j, ref_t])
                for slot in model.BS:
                    joint.shared_deadline.add(model.bench_slot[i, t, slot] == other.bench_slot[j, ref_t, slot])
                if hasattr(model, "FH_T") and t in model.FH_T:
                    for attr in ("fh_x", "fh_y", "fh_c", "fh_bench", "fh_in", "fh_out"):
                        joint.shared_deadline.add(getattr(model, attr)[i, t] == getattr(other, attr)[j, ref_t])
                    for slot in model.BS:
                        joint.shared_deadline.add(model.fh_bench_slot[i, t, slot] == other.fh_bench_slot[j, ref_t, slot])
            for attr in ("hit", "transfers_used", "saved_transfers", "money_in_bank"):
                joint.shared_deadline.add(getattr(model, attr)[t] == getattr(other, attr)[ref_t])


def optimize_scenario_tree(
    *,
    scenario_tree: dict[str, Any],
    scenario_players_by_id: Optional[dict[str, pd.DataFrame]] = None,
    on_solution: Optional[Callable[[int, list[dict[str, Any]]], None]] = None,
    **base_kwargs: Any,
) -> pd.DataFrame:
    """Optimize all leaf paths while enforcing shared decisions at every split."""

    root_id, nodes, children, leaf_probabilities = _validate_tree(scenario_tree)
    base_forced = list(base_kwargs.get("forced_transfers") or [])
    node_forced = {}
    for index, raw_node in enumerate(scenario_tree["nodes"]):
        node_id = str(raw_node.get("id") or f"node_{index + 1}").strip()
        moves = raw_node.get("forced_transfers") or []
        for move in moves:
            if int(move.get("gw", 0)) != nodes[node_id].gw:
                raise ValueError(f"Forced transfers for '{node_id}' must use its gameweek.")
        node_forced[node_id] = moves

    def forced_for_leaf(leaf_id: str) -> list[dict[str, Any]]:
        return _merge_moves(base_forced, [
            move
            for node in _path_to_root(leaf_id, nodes)
            for move in node_forced.get(node.node_id, [])
        ])
    scenario_players_by_id = scenario_players_by_id or {}
    leaf_players_cache: dict[str, Optional[pd.DataFrame]] = {}

    def players_for_leaf(leaf_id: str) -> Optional[pd.DataFrame]:
        if leaf_id not in leaf_players_cache:
            leaf_players_cache[leaf_id] = _scenario_override_for_leaf(
                leaf_id,
                nodes,
                base_kwargs.get("players_override"),
                scenario_players_by_id,
            )
        return leaf_players_cache[leaf_id]

    leaf_ids = list(leaf_probabilities)
    paths = {leaf_id: _path_to_root(leaf_id, nodes) for leaf_id in leaf_ids}
    # A split is revealed after that GW's deadline. Its children must therefore
    # share all decisions in that GW, including chips chosen by the user.
    for child_ids in children.values():
        if len({nodes[node_id].chip for node_id in child_ids}) > 1:
            raise ValueError("All outcomes at a split must use the same chip in the split gameweek. The outcome is not known before the deadline.")

    if len(leaf_ids) == 1:
        leaf_id = leaf_ids[0]
        kwargs = dict(base_kwargs)
        kwargs.update(**_chip_kwargs(leaf_id, nodes), forced_transfers=forced_for_leaf(leaf_id),
                      players_override=players_for_leaf(leaf_id), n_solutions=1, on_solution=None)
        result = optimize_my_team(**kwargs)
        leaf_results = [LeafResult(leaf_id, result, _objective_value(result))]
        expected_objective = leaf_results[0].objective
        solver_status = "linear"
    else:
        prepared = {}
        snapshot = base_kwargs.get("_team_snapshot")

        def prepare(leaf_id, candidate_names=None):
            kwargs = dict(base_kwargs)
            kwargs.update(**_chip_kwargs(leaf_id, nodes), forced_transfers=forced_for_leaf(leaf_id),
                          players_override=players_for_leaf(leaf_id), n_solutions=1, on_solution=None,
                          _prepare_for_tree=True, _tree_candidate_names=candidate_names, _team_snapshot=snapshot)
            return optimize_my_team(**kwargs)

        for leaf_id in leaf_ids:
            prepared[leaf_id] = prepare(leaf_id)
            snapshot = prepared[leaf_id].team_snapshot
        # Scenario filtering must not remove a player who is useful in another
        # outcome: all blocks need the same candidate pool for a fair compromise.
        candidates = set().union(*(set(item.player_indices) for item in prepared.values()))
        for leaf_id in leaf_ids:
            if set(prepared[leaf_id].player_indices) != candidates:
                prepared[leaf_id] = prepare(leaf_id, sorted(candidates))
        if any(set(item.player_indices) != candidates for item in prepared.values()):
            raise ValueError("Scenario player pools could not be aligned.")

        joint = pyo.ConcreteModel()
        for index, leaf_id in enumerate(leaf_ids):
            model = prepared[leaf_id].model
            model.obj_base.deactivate()
            model.obj_risk.deactivate()
            model.obj_floor_con.deactivate()
            joint.add_component(f"path_{index}", model)
        add_shared_deadline_constraints(joint, prepared, paths)
        joint.expected_base = pyo.Expression(expr=sum(
            leaf_probabilities[leaf_id] * prepared[leaf_id].model.base_obj_expr for leaf_id in leaf_ids
        ))
        joint.objective = pyo.Objective(expr=joint.expected_base, sense=pyo.maximize)
        solver = pyo.SolverFactory("highs")
        if base_kwargs.get("time_limit", 120) is not None:
            solver.options["time_limit"] = base_kwargs.get("time_limit", 120)
        solver.options["mip_rel_gap"] = base_kwargs.get("mip_gap", 0.01)

        def solve_joint():
            result = solver.solve(joint, tee=bool(base_kwargs.get("solver_tee", False)), load_solutions=False)
            if not len(result.solution):
                raise ValueError("No feasible shared plan was found before the scenario becomes known. Check conflicting forced transfers across split outcomes, chips and budget.")
            joint.solutions.load_from(result)
            return str(result.solver.termination_condition)

        solver_status = solve_joint()
        risk = float(base_kwargs.get("risk_factor", 0) or 0)
        if risk:
            best_base = pyo.value(joint.expected_base)
            joint.risk_floor = pyo.Constraint(expr=joint.expected_base >= best_base - abs(risk) * 0.1 * best_base)
            joint.objective.deactivate()
            joint.risk_objective = pyo.Objective(expr=sum(
                leaf_probabilities[leaf_id] * prepared[leaf_id].model.risk_obj_expr for leaf_id in leaf_ids
            ), sense=pyo.minimize if risk < 0 else pyo.maximize)
            solver_status = solve_joint()
        expected_objective = float(pyo.value(joint.expected_base))
        leaf_results = []
        for leaf_id in leaf_ids:
            result = prepared[leaf_id].export_solution()
            leaf_results.append(LeafResult(leaf_id, result, _objective_value(result)))
    expected_points = sum(
        leaf_probabilities[leaf_result.leaf_id]
        * _result_metric(leaf_result.frame, "solution_TotalExpectedPoints")
        for leaf_result in leaf_results
    )
    expected_hits = sum(
        leaf_probabilities[leaf_result.leaf_id]
        * _result_metric(leaf_result.frame, "solution_hit_count")
        for leaf_result in leaf_results
    )
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
        leaf_df["tree_information_timing"] = "after_deadline"
        leaf_df["tree_solver_status"] = solver_status
        leaf_df["tree_branch_expected_points"] = _result_metric(
            leaf_result.frame, "solution_TotalExpectedPoints"
        )
        leaf_df["tree_branch_hit_count"] = _result_metric(
            leaf_result.frame, "solution_hit_count"
        )
        leaf_df["tree_expected_points"] = expected_points
        leaf_df["tree_expected_hit_count"] = expected_hits
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
        projection_diagnostics = _projection_diagnostics(
            base_kwargs.get("players_override"),
            players_for_leaf(leaf_result.leaf_id),
        )
        leaf_df["tree_projection_changed_rows"] = projection_diagnostics["changed_rows"]
        leaf_df["tree_projection_signed_diff"] = projection_diagnostics["signed_diff"]
        leaf_df["tree_projection_absolute_diff"] = projection_diagnostics["absolute_diff"]
        leaf_df["tree_projection_max_abs_diff"] = projection_diagnostics["max_abs_diff"]
        output_frames.append(leaf_df)

    output = pd.concat(output_frames, ignore_index=True)
    if on_solution is not None:
        safe_output = output.astype(object).where(pd.notna(output), None)
        on_solution(1, safe_output.to_dict(orient="records"))
    return output


__all__ = ["optimize_scenario_tree"]
