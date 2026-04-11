import { useState } from 'react';
import { DIMENSIONS, computeDivergence } from '../../data/predictiveHistorySchema';

export default function StateVectorMonitor({ stateVectors, baselineVectors, recentEvents, collapsed: initialCollapsed }) {
  const [collapsed, setCollapsed] = useState(initialCollapsed ?? false);
  const [tooltip, setTooltip] = useState(null);

  if (!stateVectors || Object.keys(stateVectors).length === 0) return null;

  const divergence = baselineVectors ? computeDivergence(stateVectors, baselineVectors) : null;

  const getDivColor = (val) => {
    if (val === undefined || val === null) return 'var(--text-dim)';
    const abs = Math.abs(val);
    if (abs <= 5) return 'var(--amber)';
    return val > 0 ? 'var(--teal)' : 'var(--red)';
  };

  const getScoreColor = (val) => {
    if (val >= 50) return 'var(--teal)';
    if (val >= 0) return 'var(--text-primary)';
    if (val >= -50) return 'var(--amber)';
    return 'var(--red)';
  };

  const handleCellClick = (actorId, dim, e) => {
    if (!recentEvents) return;
    const relevant = (recentEvents || [])
      .filter((evt) => {
        const matchActor = evt.actorId === actorId || evt.actor === actorId;
        const matchDim = (evt.dimensionsAffected || []).includes(dim);
        return matchActor || matchDim;
      })
      .slice(-3);

    if (relevant.length === 0) return;

    const rect = e.currentTarget.getBoundingClientRect();
    setTooltip({
      x: rect.left,
      y: rect.bottom + 4,
      actorId,
      dim,
      events: relevant,
    });
  };

  return (
    <div style={styles.container}>
      <div style={styles.header} onClick={() => setCollapsed(!collapsed)}>
        <span style={styles.headerIcon}>{collapsed ? '▸' : '▾'}</span>
        <span style={styles.headerTitle}>STATE VECTOR MONITOR</span>
        <span style={styles.headerBadge}>{Object.keys(stateVectors).length} ACTORS</span>
      </div>

      {!collapsed && (
        <div style={styles.tableWrap}>
          <table style={styles.table}>
            <thead>
              <tr>
                <th style={styles.th}>ACTOR</th>
                {DIMENSIONS.map((d) => (
                  <th key={d} style={styles.th}>{d.slice(0, 4)}</th>
                ))}
                {divergence && <th style={styles.th}>&#916; BASELINE</th>}
              </tr>
            </thead>
            <tbody>
              {Object.entries(stateVectors).map(([actorId, vec]) => {
                const div = divergence?.[actorId] || {};
                const totalDiv = divergence
                  ? DIMENSIONS.reduce((sum, d) => sum + Math.abs(div[d] || 0), 0)
                  : null;

                return (
                  <tr key={actorId} style={styles.tr}>
                    <td style={styles.tdActor}>
                      {actorId.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())}
                    </td>
                    {DIMENSIONS.map((d) => (
                      <td
                        key={d}
                        style={{ ...styles.td, color: getScoreColor(vec[d] || 0), cursor: recentEvents ? 'pointer' : 'default' }}
                        onClick={(e) => handleCellClick(actorId, d, e)}
                      >
                        {vec[d] > 0 ? '+' : ''}{vec[d] || 0}
                        {divergence && div[d] !== undefined && div[d] !== 0 && (
                          <span style={{ ...styles.delta, color: getDivColor(div[d]) }}>
                            {' '}({div[d] > 0 ? '+' : ''}{div[d]})
                          </span>
                        )}
                      </td>
                    ))}
                    {divergence && (
                      <td style={{ ...styles.td, color: getDivColor(totalDiv > 20 ? (totalDiv > 50 ? -1 : 1) : 0) }}>
                        <DivBar value={totalDiv} />
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Tooltip */}
      {tooltip && (
        <>
          <div style={styles.tooltipOverlay} onClick={() => setTooltip(null)} />
          <div style={{ ...styles.tooltip, left: tooltip.x, top: tooltip.y }}>
            <div style={styles.tooltipTitle}>
              {tooltip.actorId.replace(/_/g, ' ')} — {tooltip.dim}
            </div>
            {tooltip.events.map((evt, i) => (
              <div key={i} style={styles.tooltipEvent}>
                <span style={styles.tooltipDate}>{evt.date || evt.round || '?'}</span>
                <span>{evt.description || evt.message || JSON.stringify(evt)}</span>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function DivBar({ value }) {
  const width = Math.min(100, (Math.abs(value || 0) / 100) * 100);
  const color = Math.abs(value || 0) <= 20 ? 'var(--amber)' : Math.abs(value || 0) <= 50 ? 'var(--teal)' : 'var(--red)';

  return (
    <div style={styles.barContainer}>
      <div style={{ ...styles.bar, width: `${width}%`, background: color }} />
      <span style={styles.barLabel}>{value || 0}</span>
    </div>
  );
}

const styles = {
  container: {
    background: 'var(--surface)',
    border: '1px solid var(--border)',
    fontFamily: 'var(--mono)',
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '10px 14px',
    cursor: 'pointer',
    borderBottom: '1px solid var(--border)',
    userSelect: 'none',
  },
  headerIcon: {
    fontSize: '10px',
    color: 'var(--text-dim)',
  },
  headerTitle: {
    fontSize: '10px',
    letterSpacing: '0.12em',
    color: 'var(--teal)',
  },
  headerBadge: {
    marginLeft: 'auto',
    fontSize: '9px',
    padding: '2px 6px',
    background: 'var(--surface2)',
    color: 'var(--text-dim)',
    border: '1px solid var(--border)',
  },
  tableWrap: {
    overflowX: 'auto',
  },
  table: {
    width: '100%',
    borderCollapse: 'collapse',
    fontSize: '12px',
  },
  th: {
    padding: '8px 10px',
    textAlign: 'left',
    fontSize: '9px',
    letterSpacing: '0.1em',
    color: 'var(--text-dim)',
    borderBottom: '1px solid var(--border)',
    fontWeight: '400',
  },
  tr: {
    borderBottom: '1px solid var(--border)',
  },
  tdActor: {
    padding: '8px 10px',
    color: 'var(--text-primary)',
    fontSize: '11px',
    fontWeight: '500',
    whiteSpace: 'nowrap',
  },
  td: {
    padding: '8px 10px',
    fontSize: '12px',
    fontVariantNumeric: 'tabular-nums',
  },
  delta: {
    fontSize: '10px',
  },
  barContainer: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    minWidth: '80px',
  },
  bar: {
    height: '4px',
    transition: 'width 0.3s',
  },
  barLabel: {
    fontSize: '10px',
    color: 'var(--text-dim)',
  },
  tooltipOverlay: {
    position: 'fixed',
    inset: 0,
    zIndex: 999,
  },
  tooltip: {
    position: 'fixed',
    zIndex: 1000,
    background: 'var(--surface2)',
    border: '1px solid var(--border-bright)',
    padding: '10px',
    maxWidth: '320px',
    boxShadow: '0 4px 16px rgba(0,0,0,0.4)',
  },
  tooltipTitle: {
    fontSize: '10px',
    color: 'var(--teal)',
    letterSpacing: '0.08em',
    marginBottom: '6px',
    textTransform: 'uppercase',
  },
  tooltipEvent: {
    fontSize: '11px',
    color: 'var(--text-secondary)',
    lineHeight: 1.5,
    marginBottom: '4px',
  },
  tooltipDate: {
    color: 'var(--amber)',
    marginRight: '6px',
  },
};
