"""
Nash Equilibrium analysis engine.
Computes game-theoretic equilibria from simulation seed data using nashpy.
Supports 2-player exact solutions and N-player pairwise decomposition.
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

    # Deterministic seed based on scenario title
    np.random.seed(hash(str(seed.get("title", ""))) % (2**31))

    equilibria = []
    if n == 2:
        m1, m2 = _build_2player_matrices(actors, action_sets, seed)
        game = nash.Game(m1, m2)
        try:
            for eq in game.support_enumeration():
                equilibria.append(
                    _format_equilibrium(eq, actors, action_sets, [m1, m2])
                )
        except Exception:
            try:
                for eq in game.vertex_enumeration():
                    equilibria.append(
                        _format_equilibrium(eq, actors, action_sets, [m1, m2])
                    )
            except Exception:
                pass
    else:
        equilibria = _iterative_nash(actors, action_sets)

    equilibria.sort(key=lambda e: e["social_welfare"], reverse=True)

    return {
        "equilibria": equilibria[:5],
        "actor_count": n,
        "action_sets": {
            a["name"]: action_sets[i] for i, a in enumerate(actors)
        },
    }


def _build_2player_matrices(
    actors: list, action_sets: list, seed: dict
) -> tuple:
    """
    Build correctly-dimensioned payoff matrices for a 2-player game.

    Player 1's matrix: shape (n_actions_p1, n_actions_p2)
      - Row i, Col j = Player 1's payoff when P1 plays action i and P2 plays action j
    Player 2's matrix: shape (n_actions_p1, n_actions_p2)
      - Row i, Col j = Player 2's payoff when P1 plays action i and P2 plays action j

    nashpy expects both matrices to have the same shape (n_actions_p1, n_actions_p2).
    """
    n1 = len(action_sets[0])
    n2 = len(action_sets[1])

    m1 = np.random.uniform(20, 80, (n1, n2))
    m2 = np.random.uniform(20, 80, (n1, n2))

    # Adjust Player 1's payoffs based on P1's actions (rows)
    _apply_action_modifiers(m1, action_sets[0], actors[0], actors[1], axis=0)
    # Adjust Player 2's payoffs based on P2's actions (columns)
    _apply_action_modifiers(m2, action_sets[1], actors[1], actors[0], axis=1)

    # Adjust for goal alignment
    _adjust_for_goals(m1, actors[0], actors[1], action_sets[0], axis=0)
    _adjust_for_goals(m2, actors[1], actors[0], action_sets[1], axis=1)

    return m1, m2


def _apply_action_modifiers(
    matrix: np.ndarray,
    actions: list,
    actor: dict,
    opponent: dict,
    axis: int,
):
    """
    Apply relationship-based modifiers to a payoff matrix.

    axis=0: actions are rows (the actor is the row player)
    axis=1: actions are columns (the actor is the column player)
    """
    rel = _get_relationship(actor, opponent)
    rel_type = rel.get("type", "neutral") if rel else "neutral"

    cooperative_keywords = [
        "cooperate", "negotiate", "support", "comply",
        "partner", "collaborate", "ally",
    ]
    competitive_keywords = [
        "compete", "challenge", "block", "attack",
        "undercut", "oppose",
    ]
    passive_keywords = ["withdraw", "retreat", "defer", "wait", "observe"]

    for a_idx, action in enumerate(actions):
        action_lower = action.lower()

        if any(k in action_lower for k in cooperative_keywords):
            if rel_type in ("ally", "partner", "supporter"):
                multiplier = 1.3
            elif rel_type in ("rival", "competitor", "adversary"):
                multiplier = 0.8
            else:
                multiplier = 1.0
        elif any(k in action_lower for k in competitive_keywords):
            if rel_type in ("rival", "competitor", "adversary"):
                multiplier = 1.3
            elif rel_type in ("ally", "partner", "supporter"):
                multiplier = 0.7
            else:
                multiplier = 1.0
        elif any(k in action_lower for k in passive_keywords):
            multiplier = 0.9
        else:
            multiplier = 1.0

        if axis == 0:
            matrix[a_idx, :] *= multiplier
        else:
            matrix[:, a_idx] *= multiplier


def _adjust_for_goals(
    matrix: np.ndarray,
    actor: dict,
    opponent: dict,
    actions: list,
    axis: int,
):
    """Adjust payoff matrix based on goal alignment between actors."""
    my_goals = set(g.lower() for g in actor.get("goals", []))
    opp_goals = set(g.lower() for g in opponent.get("goals", []))

    if not my_goals or not opp_goals:
        return

    overlap = len(my_goals & opp_goals)
    total = len(my_goals | opp_goals)
    alignment = overlap / max(total, 1)

    cooperative_keywords = ["cooperate", "negotiate", "support"]
    competitive_keywords = ["compete", "challenge", "block"]

    for a_idx, action in enumerate(actions):
        action_lower = action.lower()
        if any(k in action_lower for k in cooperative_keywords):
            factor = 1.0 + alignment * 0.3
        elif any(k in action_lower for k in competitive_keywords):
            factor = 1.0 + (1 - alignment) * 0.3
        else:
            factor = 1.0

        if axis == 0:
            matrix[a_idx, :] *= factor
        else:
            matrix[:, a_idx] *= factor


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
    """
    Format a nashpy equilibrium result into a structured dict.

    eq_strategies is a tuple of (p1_mixed_strategy, p2_mixed_strategy)
    where each is a numpy array of probabilities over that player's actions.

    Payoff for player i = sigma_1 @ M_i @ sigma_2
    where sigma_1 is P1's mixed strategy (row vector) and sigma_2 is P2's (column vector).
    """
    sigma_1 = eq_strategies[0]
    sigma_2 = eq_strategies[1]

    actor_strategies = {}
    total_welfare = 0.0

    for i, (actor, actions) in enumerate(zip(actors, action_sets)):
        strategies = eq_strategies[i]
        dominant_idx = int(np.argmax(strategies))
        dominant_action = (
            actions[dominant_idx] if dominant_idx < len(actions) else actions[0]
        )

        # Correct expected payoff: sigma_1^T @ M_i @ sigma_2
        payoff_val = float(sigma_1 @ payoff_matrices[i] @ sigma_2)

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


def _iterative_nash(actors: list, action_sets: list) -> list:
    """
    For N>2 players: decompose into pairwise 2-player games, solve each,
    then aggregate strategies and compute payoffs from the pairwise results.
    """
    n = len(actors)
    # Store per-actor: list of (opponent_name, strategy_array, payoff_matrix, opponent_strategy)
    pairwise_results: dict[str, list] = {a["name"]: [] for a in actors}

    for i in range(n):
        for j in range(i + 1, n):
            ni = len(action_sets[i])
            nj = len(action_sets[j])

            # Both matrices have shape (ni, nj) as nashpy requires
            m1 = np.random.uniform(20, 80, (ni, nj))
            m2 = np.random.uniform(20, 80, (ni, nj))

            # Apply relationship modifiers
            _apply_action_modifiers(m1, action_sets[i], actors[i], actors[j], axis=0)
            _apply_action_modifiers(m2, action_sets[j], actors[j], actors[i], axis=1)

            game = nash.Game(m1, m2)
            eq_found = False
            try:
                for eq in game.support_enumeration():
                    sigma_i, sigma_j = eq
                    payoff_i = float(sigma_i @ m1 @ sigma_j)
                    payoff_j = float(sigma_i @ m2 @ sigma_j)

                    pairwise_results[actors[i]["name"]].append({
                        "opponent": actors[j]["name"],
                        "strategy": sigma_i,
                        "payoff": payoff_i,
                        "dominant_idx": int(np.argmax(sigma_i)),
                    })
                    pairwise_results[actors[j]["name"]].append({
                        "opponent": actors[i]["name"],
                        "strategy": sigma_j,
                        "payoff": payoff_j,
                        "dominant_idx": int(np.argmax(sigma_j)),
                    })
                    eq_found = True
                    break  # Use the first equilibrium found
            except Exception:
                pass

            if not eq_found:
                # Fallback: uniform strategies
                sigma_i = np.ones(ni) / ni
                sigma_j = np.ones(nj) / nj
                pairwise_results[actors[i]["name"]].append({
                    "opponent": actors[j]["name"],
                    "strategy": sigma_i,
                    "payoff": float(sigma_i @ m1 @ sigma_j),
                    "dominant_idx": int(np.argmax(sigma_i)),
                })
                pairwise_results[actors[j]["name"]].append({
                    "opponent": actors[i]["name"],
                    "strategy": sigma_j,
                    "payoff": float(sigma_i @ m2 @ sigma_j),
                    "dominant_idx": int(np.argmax(sigma_j)),
                })

    # Aggregate: for each actor, find the most common dominant action
    # and average the payoffs across all pairwise games
    combined = {}
    total_welfare = 0.0

    for idx, actor in enumerate(actors):
        results = pairwise_results[actor["name"]]
        actions = action_sets[idx]

        if results:
            # Find dominant action across pairwise games
            dominant_actions = [
                actions[min(r["dominant_idx"], len(actions) - 1)]
                for r in results
            ]
            dominant = Counter(dominant_actions).most_common(1)[0][0]

            # Average payoff across pairwise games
            avg_payoff = sum(r["payoff"] for r in results) / len(results)

            # Build averaged mixed strategy across pairwise games
            avg_strategy = np.zeros(len(actions))
            for r in results:
                strat = r["strategy"]
                for k in range(min(len(strat), len(actions))):
                    avg_strategy[k] += strat[k]
            avg_strategy /= len(results)
            # Renormalize
            strat_sum = avg_strategy.sum()
            if strat_sum > 0:
                avg_strategy /= strat_sum

            strategy_mix = {
                actions[k]: round(float(avg_strategy[k]), 3)
                for k in range(len(actions))
            }
        else:
            dominant = actions[0] if actions else "cooperate"
            avg_payoff = 50.0
            strategy_mix = {dominant: 1.0}

        combined[actor["name"]] = {
            "optimal_strategy": dominant,
            "strategy_mix": strategy_mix,
            "payoff": round(avg_payoff, 1),
        }
        total_welfare += avg_payoff

    return [
        {
            "actor_strategies": combined,
            "social_welfare": round(total_welfare, 1),
        }
    ]
