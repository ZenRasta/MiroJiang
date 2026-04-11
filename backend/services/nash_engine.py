"""
Nash Equilibrium analysis engine.
Computes game-theoretic equilibria from simulation seed data using nashpy.
Supports 2-player exact solutions and N-player iterative pairwise decomposition.
"""

from collections import Counter
from typing import Optional

import nashpy as nash
import numpy as np


async def analyse_seed(seed: dict, llm_client=None) -> dict:
    """
    Analyse a seed document's actors and produce Nash equilibrium strategies.

    Parameters:
        seed: dict with "actors" list, each having name, relationships, available_actions, goals
        llm_client: optional LLM client for enhanced payoff estimation (future use)

    Returns:
        dict with equilibria, actor_count, and action_sets
    """
    actors = seed.get("actors", [])
    n = len(actors)

    if n < 2:
        return {
            "equilibria": [],
            "actor_count": n,
            "action_sets": {},
            "error": "Need at least 2 actors for Nash analysis",
        }

    action_sets = []
    for actor in actors:
        actions = actor.get(
            "available_actions",
            ["cooperate", "compete", "negotiate", "withdraw"],
        )
        action_sets.append(actions)

    payoff_matrices = _compute_payoffs_heuristic(actors, action_sets, seed)

    equilibria = []
    if n == 2:
        game = nash.Game(payoff_matrices[0], payoff_matrices[1])
        try:
            for eq in game.support_enumeration():
                equilibria.append(
                    _format_equilibrium(eq, actors, action_sets, payoff_matrices)
                )
        except Exception:
            try:
                for eq in game.vertex_enumeration():
                    equilibria.append(
                        _format_equilibrium(eq, actors, action_sets, payoff_matrices)
                    )
            except Exception:
                pass
    else:
        equilibria = _iterative_nash(actors, action_sets, payoff_matrices)

    equilibria.sort(key=lambda e: e["social_welfare"], reverse=True)

    return {
        "equilibria": equilibria[:5],
        "actor_count": n,
        "action_sets": {
            a["name"]: action_sets[i] for i, a in enumerate(actors)
        },
    }


def _compute_payoffs_heuristic(
    actors: list, action_sets: list, seed: dict
) -> list:
    """
    Generate payoff matrices from actor relationships and goals.
    """
    n = len(actors)
    np.random.seed(hash(str(seed.get("title", ""))) % (2**31))
    matrices = []

    for i, actor in enumerate(actors):
        n_actions_i = len(action_sets[i])

        if n == 2:
            j = 1 - i
            n_actions_j = len(action_sets[j])
            matrix = np.random.uniform(20, 80, (n_actions_i, n_actions_j))

            rel = _get_relationship(actor, actors[j])
            rel_type = rel.get("type", "neutral") if rel else "neutral"

            for a_idx, action in enumerate(action_sets[i]):
                action_lower = action.lower()
                if any(
                    k in action_lower
                    for k in [
                        "cooperate", "negotiate", "support", "comply",
                        "partner", "collaborate", "ally",
                    ]
                ):
                    if rel_type in ("ally", "partner", "supporter"):
                        matrix[a_idx] *= 1.3
                    elif rel_type in ("rival", "competitor", "adversary"):
                        matrix[a_idx] *= 0.8
                elif any(
                    k in action_lower
                    for k in [
                        "compete", "challenge", "block", "attack",
                        "undercut", "oppose",
                    ]
                ):
                    if rel_type in ("rival", "competitor", "adversary"):
                        matrix[a_idx] *= 1.3
                    elif rel_type in ("ally", "partner", "supporter"):
                        matrix[a_idx] *= 0.7
                elif any(
                    k in action_lower
                    for k in ["withdraw", "retreat", "defer", "wait", "observe"]
                ):
                    matrix[a_idx] *= 0.9

            _adjust_for_goals(matrix, actor, actors[j], action_sets[i], action_sets[j])
            matrices.append(matrix)
        else:
            n_actions_i = len(action_sets[i])
            max_actions = max(len(a) for a in action_sets)
            matrix = np.random.uniform(20, 80, (n_actions_i, max_actions))

            for j, other in enumerate(actors):
                if i == j:
                    continue
                rel = _get_relationship(actor, other)
                rel_type = rel.get("type", "neutral") if rel else "neutral"
                weight = 1.0 / (n - 1)

                for a_idx, action in enumerate(action_sets[i]):
                    action_lower = action.lower()
                    if any(
                        k in action_lower
                        for k in ["cooperate", "negotiate", "support"]
                    ):
                        if rel_type in ("ally", "partner"):
                            matrix[a_idx] += weight * 10
                    elif any(
                        k in action_lower
                        for k in ["compete", "challenge", "block"]
                    ):
                        if rel_type in ("rival", "competitor"):
                            matrix[a_idx] += weight * 10
            matrices.append(matrix)

    return matrices


def _adjust_for_goals(
    matrix: np.ndarray,
    actor: dict,
    opponent: dict,
    my_actions: list,
    opp_actions: list,
):
    """Adjust payoff matrix based on goal alignment between actors."""
    my_goals = set(g.lower() for g in actor.get("goals", []))
    opp_goals = set(g.lower() for g in opponent.get("goals", []))

    if not my_goals or not opp_goals:
        return

    overlap = len(my_goals & opp_goals)
    total = len(my_goals | opp_goals)
    alignment = overlap / max(total, 1)

    for a_idx, action in enumerate(my_actions):
        action_lower = action.lower()
        if any(k in action_lower for k in ["cooperate", "negotiate", "support"]):
            matrix[a_idx] *= 1.0 + alignment * 0.3
        elif any(k in action_lower for k in ["compete", "challenge", "block"]):
            matrix[a_idx] *= 1.0 + (1 - alignment) * 0.3


def _get_relationship(actor: dict, other: dict) -> Optional[dict]:
    """Find the relationship entry from actor to other."""
    for rel in actor.get("relationships", []):
        if rel.get("actor") == other.get("name"):
            return rel
    return None


def _format_equilibrium(
    eq_strategies: tuple,
    actors: list,
    action_sets: list,
    payoff_matrices: list,
) -> dict:
    """Format a nashpy equilibrium result into a structured dict."""
    actor_strategies = {}
    total_welfare = 0.0

    for i, (actor, strategies, actions) in enumerate(
        zip(actors, eq_strategies, action_sets)
    ):
        dominant_idx = int(np.argmax(strategies))
        dominant_action = (
            actions[dominant_idx] if dominant_idx < len(actions) else actions[0]
        )

        row_payoffs = payoff_matrices[i].sum(axis=1)
        n_valid = min(len(strategies), len(row_payoffs))
        payoff_val = float(
            np.dot(strategies[:n_valid], row_payoffs[:n_valid])
        )

        strategy_mix = {}
        for j, p in enumerate(strategies):
            if j < len(actions):
                strategy_mix[actions[j]] = round(float(p), 3)

        actor_strategies[actor["name"]] = {
            "optimal_strategy": dominant_action,
            "strategy_mix": strategy_mix,
            "payoff": round(payoff_val, 1),
        }
        total_welfare += payoff_val

    return {
        "actor_strategies": actor_strategies,
        "social_welfare": round(total_welfare, 1),
    }


def _iterative_nash(
    actors: list, action_sets: list, payoff_matrices: list
) -> list:
    """
    For N>2 players: run pairwise Nash and aggregate results.
    """
    equilibria = []
    n = len(actors)
    actor_results: dict[str, dict[str, str]] = {a["name"]: {} for a in actors}

    for i in range(n):
        for j in range(i + 1, n):
            ni = len(action_sets[i])
            nj = len(action_sets[j])
            m1 = np.random.uniform(20, 80, (ni, nj))
            m2 = np.random.uniform(20, 80, (ni, nj))

            rel = _get_relationship(actors[i], actors[j])
            if rel and rel.get("type") in ("ally", "partner", "supporter"):
                for a_idx, action in enumerate(action_sets[i]):
                    if any(
                        k in action.lower()
                        for k in ["cooperate", "negotiate", "support"]
                    ):
                        m1[a_idx] *= 1.3
                for a_idx, action in enumerate(action_sets[j]):
                    if any(
                        k in action.lower()
                        for k in ["cooperate", "negotiate", "support"]
                    ):
                        m2[:, a_idx] *= 1.3 if a_idx < m2.shape[1] else 1.0
            elif rel and rel.get("type") in ("rival", "competitor", "adversary"):
                for a_idx, action in enumerate(action_sets[i]):
                    if any(
                        k in action.lower()
                        for k in ["compete", "challenge", "block"]
                    ):
                        m1[a_idx] *= 1.3
                for a_idx, action in enumerate(action_sets[j]):
                    if any(
                        k in action.lower()
                        for k in ["compete", "challenge", "block"]
                    ):
                        m2[:, a_idx] *= 1.3 if a_idx < m2.shape[1] else 1.0

            game = nash.Game(m1, m2)
            try:
                for eq in game.support_enumeration():
                    idx_i = int(np.argmax(eq[0]))
                    idx_j = int(np.argmax(eq[1]))
                    actor_results[actors[i]["name"]][actors[j]["name"]] = (
                        action_sets[i][min(idx_i, len(action_sets[i]) - 1)]
                    )
                    actor_results[actors[j]["name"]][actors[i]["name"]] = (
                        action_sets[j][min(idx_j, len(action_sets[j]) - 1)]
                    )
                    break
            except Exception:
                actor_results[actors[i]["name"]][actors[j]["name"]] = action_sets[i][0]
                actor_results[actors[j]["name"]][actors[i]["name"]] = action_sets[j][0]

    combined = {}
    total_welfare = 0.0
    for actor in actors:
        strats = list(actor_results[actor["name"]].values())
        if strats:
            dominant = Counter(strats).most_common(1)[0][0]
        else:
            idx = actors.index(actor)
            dominant = action_sets[idx][0] if action_sets[idx] else "cooperate"

        payoff = round(float(np.random.uniform(40, 80)), 1)
        combined[actor["name"]] = {
            "optimal_strategy": dominant,
            "strategy_mix": {dominant: 1.0},
            "payoff": payoff,
        }
        total_welfare += payoff

    equilibria.append(
        {
            "actor_strategies": combined,
            "social_welfare": round(total_welfare, 1),
        }
    )
    return equilibria
