/**
 * Predictive History — Schema definitions and validation
 *
 * Implements the Jiang Xueqin Predictive History framework for
 * counterfactual historical analysis within Strategos.
 */

/** Four-dimension state vector: each value in [-100, +100] */
export const DIMENSIONS = ['NARRATIVE', 'POLITICAL', 'ECONOMIC', 'MILITARY'];

/** Default zero-state vector */
export const ZERO_VECTOR = { NARRATIVE: 0, POLITICAL: 0, ECONOMIC: 0, MILITARY: 0 };

/**
 * Validate a HistoryFile JSON object.
 * Returns { valid: boolean, errors: string[] }
 */
export function validateHistoryFile(data) {
  const errors = [];

  if (!data || typeof data !== 'object') {
    return { valid: false, errors: ['History file must be a JSON object'] };
  }

  // Required top-level fields
  if (!data.title || typeof data.title !== 'string') {
    errors.push('Missing or invalid "title" (string)');
  }
  if (!data.period || !data.period.start || !data.period.end) {
    errors.push('Missing "period" with "start" and "end" fields');
  }
  if (!data.description || typeof data.description !== 'string') {
    errors.push('Missing or invalid "description" (string)');
  }

  // Baseline timeline
  if (!Array.isArray(data.baselineTimeline)) {
    errors.push('Missing "baselineTimeline" array');
  } else {
    data.baselineTimeline.forEach((evt, i) => {
      if (!evt.date) errors.push(`baselineTimeline[${i}]: missing "date"`);
      if (!evt.description) errors.push(`baselineTimeline[${i}]: missing "description"`);
      if (!Array.isArray(evt.dimensionsAffected)) {
        errors.push(`baselineTimeline[${i}]: missing "dimensionsAffected" array`);
      } else {
        evt.dimensionsAffected.forEach((d) => {
          if (!DIMENSIONS.includes(d)) {
            errors.push(`baselineTimeline[${i}]: invalid dimension "${d}"`);
          }
        });
      }
    });
  }

  // Pivot points
  if (!Array.isArray(data.pivotPoints)) {
    errors.push('Missing "pivotPoints" array');
  } else {
    const pivotIds = new Set();
    data.pivotPoints.forEach((pp, i) => {
      if (!pp.id) errors.push(`pivotPoints[${i}]: missing "id"`);
      if (pivotIds.has(pp.id)) errors.push(`pivotPoints[${i}]: duplicate id "${pp.id}"`);
      pivotIds.add(pp.id);
      if (!pp.date) errors.push(`pivotPoints[${i}]: missing "date"`);
      if (!pp.description) errors.push(`pivotPoints[${i}]: missing "description"`);
      if (!pp.counterfactualPrompt) errors.push(`pivotPoints[${i}]: missing "counterfactualPrompt"`);
      if (!pp.defaultOutcome) errors.push(`pivotPoints[${i}]: missing "defaultOutcome"`);
      if (!Array.isArray(pp.alternateOutcomes) || pp.alternateOutcomes.length === 0) {
        errors.push(`pivotPoints[${i}]: must have at least one alternateOutcome`);
      } else {
        pp.alternateOutcomes.forEach((ao, j) => {
          if (!ao.id) errors.push(`pivotPoints[${i}].alternateOutcomes[${j}]: missing "id"`);
          if (!ao.description) errors.push(`pivotPoints[${i}].alternateOutcomes[${j}]: missing "description"`);
          if (!ao.stateDeltasByActor || typeof ao.stateDeltasByActor !== 'object') {
            errors.push(`pivotPoints[${i}].alternateOutcomes[${j}]: missing "stateDeltasByActor"`);
          } else {
            // Validate vector deltas
            Object.entries(ao.stateDeltasByActor).forEach(([actor, delta]) => {
              Object.keys(delta).forEach((dim) => {
                if (!DIMENSIONS.includes(dim)) {
                  errors.push(`pivotPoints[${i}].alternateOutcomes[${j}].stateDeltasByActor.${actor}: invalid dimension "${dim}"`);
                }
                if (typeof delta[dim] !== 'number') {
                  errors.push(`pivotPoints[${i}].alternateOutcomes[${j}].stateDeltasByActor.${actor}.${dim}: must be a number`);
                }
              });
            });
          }
        });
      }
    });
  }

  // Structural analogies
  if (!Array.isArray(data.structuralAnalogies)) {
    errors.push('Missing "structuralAnalogies" array');
  } else {
    data.structuralAnalogies.forEach((sa, i) => {
      if (!sa.pattern) errors.push(`structuralAnalogies[${i}]: missing "pattern"`);
      if (!sa.historicalCase) errors.push(`structuralAnalogies[${i}]: missing "historicalCase"`);
      if (!sa.relevance) errors.push(`structuralAnalogies[${i}]: missing "relevance"`);
      if (!sa.projectedConsequence) errors.push(`structuralAnalogies[${i}]: missing "projectedConsequence"`);
    });
  }

  // Initial state vectors
  if (!data.initialStateVectors || typeof data.initialStateVectors !== 'object') {
    errors.push('Missing "initialStateVectors" object');
  } else {
    Object.entries(data.initialStateVectors).forEach(([actorId, vec]) => {
      DIMENSIONS.forEach((dim) => {
        if (typeof vec[dim] !== 'number') {
          errors.push(`initialStateVectors.${actorId}: missing or non-numeric "${dim}"`);
        } else if (vec[dim] < -100 || vec[dim] > 100) {
          errors.push(`initialStateVectors.${actorId}.${dim}: value ${vec[dim]} out of range [-100, +100]`);
        }
      });
    });
  }

  // Game theory nodes
  if (!Array.isArray(data.gameTheoryNodes)) {
    errors.push('Missing "gameTheoryNodes" array');
  } else {
    data.gameTheoryNodes.forEach((gtn, i) => {
      if (!gtn.pivotPointId) errors.push(`gameTheoryNodes[${i}]: missing "pivotPointId"`);
      if (!gtn.actorId) errors.push(`gameTheoryNodes[${i}]: missing "actorId"`);
      if (!Array.isArray(gtn.options) || gtn.options.length === 0) {
        errors.push(`gameTheoryNodes[${i}]: must have at least one option`);
      } else {
        gtn.options.forEach((opt, j) => {
          if (!opt.action) errors.push(`gameTheoryNodes[${i}].options[${j}]: missing "action"`);
          if (!opt.payoffsByScenario || typeof opt.payoffsByScenario !== 'object') {
            errors.push(`gameTheoryNodes[${i}].options[${j}]: missing "payoffsByScenario"`);
          }
        });
      }
    });
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Cross-validate history file actors against seed file actors.
 * Returns { matched: string[], unmatched: string[], missing: string[] }
 *   matched:   actors in both history and seed
 *   unmatched: actors in history but not in seed
 *   missing:   actors in seed but not in history
 */
export function crossValidateActors(historyFile, seedFile) {
  const historyActorIds = Object.keys(historyFile.initialStateVectors || {});

  // Build a set of all plausible IDs from each seed actor so we can fuzzy-match
  const seedActorEntries = (seedFile.actors || []).map((a) => {
    const variants = new Set();
    if (a.id) variants.add(a.id);
    if (a.name) {
      variants.add(a.name);
      variants.add(a.name.toLowerCase().replace(/\s+/g, '_'));
      variants.add(a.name.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/(^_|_$)/g, ''));
    }
    // The canonical ID we report is the best match: explicit id, or the snake_case name
    const canonical = a.id || a.name?.toLowerCase().replace(/\s+/g, '_') || '';
    return { canonical, variants };
  });

  // For each history actor ID, check if any seed actor variant matches
  const matched = [];
  const unmatched = [];
  for (const hid of historyActorIds) {
    const hidLower = hid.toLowerCase();
    const found = seedActorEntries.some((e) =>
      [...e.variants].some((v) => v.toLowerCase() === hidLower)
    );
    if (found) matched.push(hid);
    else unmatched.push(hid);
  }

  // Seed actors that have no match in history
  const matchedSet = new Set(matched.map((m) => m.toLowerCase()));
  const missing = seedActorEntries
    .filter((e) => ![...e.variants].some((v) => matchedSet.has(v.toLowerCase())))
    .map((e) => e.canonical);

  return { matched, unmatched, missing };
}

/**
 * Apply state deltas from an alternate outcome to actor state vectors.
 * Returns a new state vectors object (immutable).
 */
export function applyStateDelta(currentVectors, stateDeltasByActor) {
  const updated = { ...currentVectors };
  for (const [actorId, delta] of Object.entries(stateDeltasByActor)) {
    const current = updated[actorId] || { ...ZERO_VECTOR };
    updated[actorId] = { ...current };
    for (const dim of DIMENSIONS) {
      if (delta[dim] !== undefined) {
        updated[actorId][dim] = Math.max(-100, Math.min(100, current[dim] + delta[dim]));
      }
    }
  }
  return updated;
}

/**
 * Compute divergence between two state vector sets.
 * Returns Record<actorId, { NARRATIVE: number, POLITICAL: number, ECONOMIC: number, MILITARY: number }>
 */
export function computeDivergence(currentVectors, baselineVectors) {
  const divergence = {};
  const allActors = new Set([...Object.keys(currentVectors), ...Object.keys(baselineVectors)]);
  for (const actorId of allActors) {
    const current = currentVectors[actorId] || ZERO_VECTOR;
    const baseline = baselineVectors[actorId] || ZERO_VECTOR;
    divergence[actorId] = {};
    for (const dim of DIMENSIONS) {
      divergence[actorId][dim] = current[dim] - baseline[dim];
    }
  }
  return divergence;
}

/**
 * Get summary stats for a history file (used in preview).
 */
export function getHistoryFileSummary(data) {
  return {
    title: data.title || 'Untitled',
    period: data.period || { start: '?', end: '?' },
    description: data.description || '',
    pivotPointCount: (data.pivotPoints || []).length,
    analogyCount: (data.structuralAnalogies || []).length,
    gameTheoryNodeCount: (data.gameTheoryNodes || []).length,
    actorCount: Object.keys(data.initialStateVectors || {}).length,
    actorIds: Object.keys(data.initialStateVectors || {}),
    timelineEventCount: (data.baselineTimeline || []).length,
  };
}
