import { useState } from 'react';
import toast from 'react-hot-toast';
import { applyStateDelta, DIMENSIONS } from '../../data/predictiveHistorySchema';
import BranchDivergenceMeter from './BranchDivergenceMeter';

export default function CounterfactualInjector({
  historyFile,
  stateVectors,
  baselineVectors,
  currentDate,
  triggeredPivots,
  onInject,
  onRewindAndBranch,
}) {
  const [expandedPivot, setExpandedPivot] = useState(null);
  const [queuedInjections, setQueuedInjections] = useState({});

  if (!historyFile || !historyFile.pivotPoints) return null;

  const pivots = historyFile.pivotPoints;

  // Track which pivots are blocked
  const blockedPivots = new Set();
  const unlockedPivots = new Set();
  Object.entries(triggeredPivots || {}).forEach(([ppId, outcomeId]) => {
    if (outcomeId !== 'baseline') {
      const pp = pivots.find((p) => p.id === ppId);
      if (pp) {
        const ao = pp.alternateOutcomes.find((a) => a.id === outcomeId);
        if (ao) {
          (ao.blockedByPivotPoints || []).forEach((b) => blockedPivots.add(b));
          (ao.unlocksPivotPoints || []).forEach((u) => unlockedPivots.add(u));
        }
      }
    }
  });

  const isPast = (ppDate) => {
    if (!currentDate) return false;
    return ppDate <= currentDate;
  };

  const handleInject = (pp, ao) => {
    // Check blocked
    if (blockedPivots.has(ao.id)) {
      toast.error('This outcome is blocked by a prior pivot point decision');
      return;
    }

    if (!isPast(pp.date)) {
      // Queue for future
      setQueuedInjections((prev) => ({ ...prev, [pp.id]: ao.id }));
      toast.success(`Queued counterfactual for ${pp.date}`);
      if (onInject) onInject(pp.id, ao.id, 'queued');
    } else {
      // Past — offer rewind
      if (onRewindAndBranch) {
        onRewindAndBranch(pp.id, ao.id);
      } else if (onInject) {
        onInject(pp.id, ao.id, 'immediate');
      }
      toast.success(`Injected counterfactual: ${ao.description.slice(0, 60)}...`);
    }
  };

  const getStatus = (pp) => {
    const triggered = triggeredPivots?.[pp.id];
    if (triggered && triggered !== 'baseline') return 'counterfactual';
    if (triggered === 'baseline') return 'baseline';
    if (queuedInjections[pp.id]) return 'queued';
    if (blockedPivots.has(pp.id)) return 'blocked';
    return 'available';
  };

  const statusColors = {
    counterfactual: 'var(--violet)',
    baseline: 'var(--text-dim)',
    queued: 'var(--amber)',
    blocked: 'var(--red)',
    available: 'var(--teal)',
  };

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <span style={styles.headerTitle}>COUNTERFACTUAL INJECTOR</span>
      </div>

      {/* Timeline */}
      <div style={styles.timeline}>
        {pivots.map((pp, i) => {
          const status = getStatus(pp);
          const isExpanded = expandedPivot === pp.id;

          return (
            <div key={pp.id} style={styles.pivotNode}>
              {/* Connector line */}
              {i > 0 && <div style={styles.connector} />}

              {/* Node dot */}
              <div style={{
                ...styles.dot,
                background: statusColors[status],
                boxShadow: status === 'counterfactual' ? `0 0 8px ${statusColors[status]}` : 'none',
              }} />

              {/* Content */}
              <div style={styles.pivotContent}>
                <div
                  style={styles.pivotHeaderRow}
                  onClick={() => setExpandedPivot(isExpanded ? null : pp.id)}
                >
                  <span style={styles.pivotDate}>{pp.date}</span>
                  <span style={{ ...styles.statusBadge, color: statusColors[status], borderColor: statusColors[status] }}>
                    {status.toUpperCase()}
                  </span>
                  <span style={styles.chevron}>{isExpanded ? '▾' : '▸'}</span>
                </div>
                <div style={styles.pivotDesc}>{pp.description.slice(0, 80)}</div>

                {isExpanded && (
                  <div style={styles.expanded}>
                    {/* Default outcome */}
                    <div style={styles.outcomeRow}>
                      <span style={styles.baselineBadge}>BASELINE</span>
                      <span style={styles.outcomeText}>{pp.defaultOutcome}</span>
                    </div>

                    {/* Alternate outcomes */}
                    {pp.alternateOutcomes.map((ao) => {
                      const isBlocked = blockedPivots.has(ao.id);
                      const isTriggered = triggeredPivots?.[pp.id] === ao.id;
                      const isQueued = queuedInjections[pp.id] === ao.id;

                      return (
                        <div key={ao.id} style={styles.outcomeRow}>
                          <div style={styles.outcomeHeader}>
                            {isTriggered ? (
                              <span style={styles.activeBadge}>ACTIVE</span>
                            ) : isQueued ? (
                              <span style={styles.queuedBadge}>QUEUED</span>
                            ) : isBlocked ? (
                              <span style={styles.blockedBadge}>BLOCKED</span>
                            ) : (
                              <button
                                style={styles.injectBtn}
                                onClick={() => handleInject(pp, ao)}
                              >
                                {isPast(pp.date) ? 'REWIND & BRANCH' : 'INJECT'}
                              </button>
                            )}
                          </div>
                          <span style={styles.outcomeText}>{ao.description}</span>

                          {/* State delta preview */}
                          <div style={styles.deltaPreview}>
                            {Object.entries(ao.stateDeltasByActor || {}).slice(0, 3).map(([aid, delta]) => (
                              <span key={aid} style={styles.deltaChip}>
                                {aid.replace(/_/g, ' ').slice(0, 8)}:
                                {DIMENSIONS.map((d) => delta[d] ? ` ${d[0]}${delta[d] > 0 ? '+' : ''}${delta[d]}` : '').join('')}
                              </span>
                            ))}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Branch Divergence Meters */}
      {stateVectors && baselineVectors && (
        <div style={styles.divergenceSection}>
          <div style={styles.divSectionTitle}>BRANCH DIVERGENCE</div>
          <BranchDivergenceMeter
            stateVectors={stateVectors}
            baselineVectors={baselineVectors}
          />
        </div>
      )}
    </div>
  );
}

const styles = {
  container: {
    background: 'var(--surface)',
    border: '1px solid var(--border)',
    fontFamily: 'var(--mono)',
    maxHeight: '80vh',
    overflowY: 'auto',
  },
  header: {
    padding: '10px 14px',
    borderBottom: '1px solid var(--border)',
  },
  headerTitle: {
    fontSize: '10px',
    letterSpacing: '0.12em',
    color: 'var(--violet)',
  },
  timeline: {
    padding: '12px 14px',
    position: 'relative',
  },
  pivotNode: {
    position: 'relative',
    paddingLeft: '24px',
    marginBottom: '4px',
  },
  connector: {
    position: 'absolute',
    left: '7px',
    top: '-8px',
    width: '1px',
    height: '16px',
    background: 'var(--border)',
  },
  dot: {
    position: 'absolute',
    left: '3px',
    top: '4px',
    width: '10px',
    height: '10px',
    border: '1px solid var(--border-bright)',
  },
  pivotContent: {
    paddingBottom: '8px',
    borderBottom: '1px solid var(--border)',
  },
  pivotHeaderRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    cursor: 'pointer',
    padding: '4px 0',
  },
  pivotDate: {
    fontSize: '11px',
    color: 'var(--amber)',
    flexShrink: 0,
  },
  statusBadge: {
    fontSize: '8px',
    letterSpacing: '0.08em',
    padding: '1px 4px',
    border: '1px solid',
  },
  chevron: {
    marginLeft: 'auto',
    fontSize: '10px',
    color: 'var(--text-dim)',
  },
  pivotDesc: {
    fontSize: '11px',
    color: 'var(--text-secondary)',
    lineHeight: 1.4,
    paddingTop: '2px',
  },
  expanded: {
    padding: '8px 0',
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
  },
  outcomeRow: {
    padding: '6px 8px',
    background: 'var(--surface2)',
    border: '1px solid var(--border)',
  },
  outcomeHeader: {
    marginBottom: '4px',
  },
  outcomeText: {
    fontSize: '11px',
    color: 'var(--text-secondary)',
    lineHeight: 1.5,
    display: 'block',
  },
  baselineBadge: {
    fontSize: '8px',
    padding: '1px 4px',
    background: 'var(--surface2)',
    color: 'var(--text-dim)',
    border: '1px solid var(--border)',
    marginBottom: '4px',
    display: 'inline-block',
  },
  activeBadge: {
    fontSize: '8px',
    padding: '1px 4px',
    background: 'var(--violet-dim)',
    color: 'var(--violet)',
    border: '1px solid var(--violet)',
  },
  queuedBadge: {
    fontSize: '8px',
    padding: '1px 4px',
    background: 'var(--amber-dim)',
    color: 'var(--amber)',
    border: '1px solid var(--amber)',
  },
  blockedBadge: {
    fontSize: '8px',
    padding: '1px 4px',
    background: 'var(--red-dim)',
    color: 'var(--red)',
    border: '1px solid var(--red)',
  },
  injectBtn: {
    fontSize: '9px',
    letterSpacing: '0.08em',
    padding: '3px 8px',
    background: 'var(--violet-dim)',
    color: 'var(--violet)',
    border: '1px solid var(--violet)',
    cursor: 'pointer',
    transition: 'all 0.2s',
    fontFamily: 'var(--mono)',
  },
  deltaPreview: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '4px',
    marginTop: '4px',
  },
  deltaChip: {
    fontSize: '9px',
    padding: '1px 4px',
    background: 'var(--surface)',
    color: 'var(--text-dim)',
    border: '1px solid var(--border)',
  },
  divergenceSection: {
    borderTop: '1px solid var(--border)',
    padding: '12px 14px',
  },
  divSectionTitle: {
    fontSize: '10px',
    letterSpacing: '0.1em',
    color: 'var(--text-dim)',
    marginBottom: '8px',
  },
};
