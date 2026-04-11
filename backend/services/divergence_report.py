"""
Historical Divergence Report Generator — produces markdown report
comparing counterfactual simulation outcomes against baseline timeline.
"""

from datetime import datetime
from services.history_fusion import DIMENSIONS, ZERO_VECTOR, compute_divergence


def build_divergence_report(
    history: dict,
    current_vectors: dict,
    triggered_pivots: dict,
    simulation_summary: str = "",
) -> str:
    """
    Build a comprehensive Historical Divergence Report as markdown.
    """
    lines = []
    title = history.get("title", "Untitled Scenario")
    period = history.get("period", {})

    lines.append(f"# Historical Divergence Report")
    lines.append(f"## {title}")
    lines.append(f"**Period:** {period.get('start', '?')} to {period.get('end', '?')}")
    lines.append(f"**Generated:** {datetime.utcnow().strftime('%Y-%m-%d %H:%M UTC')}")
    lines.append("")

    if simulation_summary:
        lines.append("## Executive Summary")
        lines.append(simulation_summary)
        lines.append("")

    # Section 1: Pivot Points Triggered
    lines.append("## Pivot Point Outcomes")
    lines.append("")
    lines.append("| Pivot Point | Date | Outcome | Type |")
    lines.append("|-------------|------|---------|------|")

    pivot_map = {pp["id"]: pp for pp in history.get("pivotPoints", [])}
    for pp in history.get("pivotPoints", []):
        pp_id = pp["id"]
        outcome_id = triggered_pivots.get(pp_id, "baseline")
        if outcome_id == "baseline":
            outcome_desc = pp.get("defaultOutcome", "Baseline")[:80]
            outcome_type = "BASELINE"
        else:
            alt = next(
                (ao for ao in pp.get("alternateOutcomes", []) if ao["id"] == outcome_id),
                None,
            )
            outcome_desc = alt["description"][:80] if alt else outcome_id
            outcome_type = "COUNTERFACTUAL"
        lines.append(f"| {pp.get('description', pp_id)[:50]} | {pp.get('date', '?')} | {outcome_desc}... | **{outcome_type}** |")
    lines.append("")

    # Section 2: Final State Vectors & Divergence
    initial_vectors = history.get("initialStateVectors", {})
    divergence = compute_divergence(current_vectors, initial_vectors)

    lines.append("## Final State Vectors")
    lines.append("")
    lines.append("| Actor | NARRATIVE | POLITICAL | ECONOMIC | MILITARY | Total Change |")
    lines.append("|-------|-----------|-----------|----------|----------|-------------|")

    for actor_id in sorted(current_vectors.keys()):
        vec = current_vectors[actor_id]
        init = initial_vectors.get(actor_id, ZERO_VECTOR)
        total_delta = sum(abs(vec.get(d, 0) - init.get(d, 0)) for d in DIMENSIONS)

        cells = []
        for dim in DIMENSIONS:
            val = vec.get(dim, 0)
            delta = vec.get(dim, 0) - init.get(dim, 0)
            sign = "+" if delta >= 0 else ""
            cells.append(f"{val} ({sign}{delta})")

        actor_display = actor_id.replace("_", " ").title()
        lines.append(f"| {actor_display} | {' | '.join(cells)} | {total_delta} |")
    lines.append("")

    # Section 3: Actor Narratives
    lines.append("## Actor Evolution Narratives")
    lines.append("")

    for actor_id in sorted(current_vectors.keys()):
        vec = current_vectors[actor_id]
        init = initial_vectors.get(actor_id, ZERO_VECTOR)
        actor_display = actor_id.replace("_", " ").title()

        lines.append(f"### {actor_display}")
        lines.append("")

        changes = {}
        for dim in DIMENSIONS:
            changes[dim] = vec.get(dim, 0) - init.get(dim, 0)

        strongest_gain = max(changes, key=lambda d: changes[d])
        strongest_loss = min(changes, key=lambda d: changes[d])

        lines.append(f"**Starting position:** N={init.get('NARRATIVE', 0)}, "
                      f"P={init.get('POLITICAL', 0)}, E={init.get('ECONOMIC', 0)}, "
                      f"M={init.get('MILITARY', 0)}")
        lines.append(f"**Final position:** N={vec.get('NARRATIVE', 0)}, "
                      f"P={vec.get('POLITICAL', 0)}, E={vec.get('ECONOMIC', 0)}, "
                      f"M={vec.get('MILITARY', 0)}")
        lines.append("")

        if changes[strongest_gain] > 0:
            lines.append(f"Greatest gain in **{strongest_gain}** (+{changes[strongest_gain]}). ")
        if changes[strongest_loss] < 0:
            lines.append(f"Greatest loss in **{strongest_loss}** ({changes[strongest_loss]}). ")

        baseline_div = divergence.get(actor_id, {})
        total_div = sum(abs(v) for v in baseline_div.values())
        if total_div > 50:
            lines.append(f"**Significant divergence from baseline** (total: {total_div}).")
        elif total_div > 20:
            lines.append(f"Moderate divergence from baseline (total: {total_div}).")
        else:
            lines.append(f"Minimal divergence from baseline (total: {total_div}).")
        lines.append("")

    # Section 4: Structural Analogies Verdict
    lines.append("## Structural Analogies Verdict")
    lines.append("")

    for sa in history.get("structuralAnalogies", []):
        pattern = sa.get("pattern", "Unknown")
        case = sa.get("historicalCase", "")
        consequence = sa.get("projectedConsequence", "")

        lines.append(f"### {pattern}")
        lines.append(f"**Historical Case:** {case}")
        lines.append(f"**Projected Consequence:** {consequence}")
        lines.append("")
        lines.append("**Assessment:** Requires analysis of simulation tick data to determine "
                      "whether this pattern held, broke, or partially applied. Review the "
                      "simulation event log for structural analogy references.")
        lines.append("")

    # Section 5: Game Theory Assessment
    lines.append("## Game Theory Assessment")
    lines.append("")

    for gtn in history.get("gameTheoryNodes", []):
        pp_id = gtn.get("pivotPointId", "")
        actor_id = gtn.get("actorId", "")
        pp = pivot_map.get(pp_id, {})

        actor_display = actor_id.replace("_", " ").title()
        lines.append(f"### {actor_display} at {pp.get('description', pp_id)[:60]}")
        lines.append(f"**Pivot Date:** {pp.get('date', '?')}")
        lines.append("")

        lines.append("| Action | Payoffs | Conditions |")
        lines.append("|--------|---------|------------|")
        for opt in gtn.get("options", []):
            payoffs = opt.get("payoffsByScenario", {})
            payoff_str = ", ".join(f"{k}: {v}" for k, v in payoffs.items())
            conditions = "; ".join(opt.get("conditions", []))[:80]
            lines.append(f"| {opt.get('action', '?')} | {payoff_str} | {conditions} |")
        lines.append("")

        outcome_id = triggered_pivots.get(pp_id, "baseline")
        lines.append(f"**Chosen path:** {'Baseline' if outcome_id == 'baseline' else outcome_id}")
        lines.append("")

        best_action = max(gtn.get("options", [{}]),
                          key=lambda o: max(o.get("payoffsByScenario", {}).values(), default=0),
                          default={})
        if best_action:
            lines.append(f"**Highest expected payoff action:** {best_action.get('action', '?')}")
            actor_vec = current_vectors.get(actor_id, ZERO_VECTOR)
            narrative = actor_vec.get("NARRATIVE", 0)
            political = actor_vec.get("POLITICAL", 0)
            if narrative < -20 or political < -20:
                lines.append(f"**Note:** Actor's low NARRATIVE ({narrative}) or POLITICAL ({political}) "
                             f"scores suggest domestic constraints may have overridden strategic rationality.")
        lines.append("")

    # Footer
    lines.append("---")
    lines.append("*Report generated by MiroJiang Predictive History Engine*")
    lines.append(f"*Framework: Jiang Xueqin Predictive History Analysis*")

    return "\n".join(lines)
