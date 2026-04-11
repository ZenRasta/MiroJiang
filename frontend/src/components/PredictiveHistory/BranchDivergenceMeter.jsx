import { DIMENSIONS, computeDivergence } from '../../data/predictiveHistorySchema';

/**
 * Spider/radar chart showing current vs. baseline state vectors per actor.
 * Uses inline SVG for the four-axis visualization.
 */
export default function BranchDivergenceMeter({ stateVectors, baselineVectors }) {
  if (!stateVectors || !baselineVectors) return null;

  const actorIds = Object.keys(stateVectors);
  const divergence = computeDivergence(stateVectors, baselineVectors);

  return (
    <div style={styles.grid}>
      {actorIds.map((actorId) => (
        <RadarCard
          key={actorId}
          actorId={actorId}
          current={stateVectors[actorId]}
          baseline={baselineVectors[actorId] || { NARRATIVE: 0, POLITICAL: 0, ECONOMIC: 0, MILITARY: 0 }}
          divergence={divergence[actorId]}
        />
      ))}
    </div>
  );
}

function RadarCard({ actorId, current, baseline, divergence }) {
  const size = 100;
  const center = size / 2;
  const radius = 36;

  // Map dimension to angle (4 axes, 90 degrees apart)
  const angles = DIMENSIONS.map((_, i) => (i * Math.PI * 2) / 4 - Math.PI / 2);

  const valueToRadius = (val) => ((val + 100) / 200) * radius;

  const getPoints = (vec) =>
    DIMENSIONS.map((d, i) => {
      const r = valueToRadius(vec[d] || 0);
      return `${center + r * Math.cos(angles[i])},${center + r * Math.sin(angles[i])}`;
    }).join(' ');

  const totalDiv = DIMENSIONS.reduce((s, d) => s + Math.abs(divergence?.[d] || 0), 0);
  const divLevel = totalDiv <= 20 ? 'LOW' : totalDiv <= 50 ? 'MED' : 'HIGH';
  const divColor = totalDiv <= 20 ? 'var(--amber)' : totalDiv <= 50 ? 'var(--teal)' : 'var(--red)';

  return (
    <div style={styles.card}>
      <div style={styles.cardHeader}>
        <span style={styles.actorName}>
          {actorId.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())}
        </span>
        <span style={{ ...styles.divBadge, color: divColor, borderColor: divColor }}>
          {divLevel}
        </span>
      </div>

      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={styles.svg}>
        {/* Grid circles */}
        {[0.25, 0.5, 0.75, 1].map((scale) => (
          <circle
            key={scale}
            cx={center}
            cy={center}
            r={radius * scale}
            fill="none"
            stroke="var(--border)"
            strokeWidth="0.5"
          />
        ))}

        {/* Axis lines */}
        {angles.map((angle, i) => (
          <line
            key={i}
            x1={center}
            y1={center}
            x2={center + radius * Math.cos(angle)}
            y2={center + radius * Math.sin(angle)}
            stroke="var(--border)"
            strokeWidth="0.5"
          />
        ))}

        {/* Baseline polygon */}
        <polygon
          points={getPoints(baseline)}
          fill="rgba(255,255,255,0.05)"
          stroke="var(--text-dim)"
          strokeWidth="1"
          strokeDasharray="2,2"
        />

        {/* Current polygon */}
        <polygon
          points={getPoints(current)}
          fill="rgba(0,212,170,0.1)"
          stroke="var(--teal)"
          strokeWidth="1.5"
        />

        {/* Axis labels */}
        {DIMENSIONS.map((d, i) => {
          const labelR = radius + 12;
          const x = center + labelR * Math.cos(angles[i]);
          const y = center + labelR * Math.sin(angles[i]);
          return (
            <text
              key={d}
              x={x}
              y={y}
              textAnchor="middle"
              dominantBaseline="middle"
              style={{ fontSize: '6px', fill: 'var(--text-dim)', fontFamily: 'var(--mono)' }}
            >
              {d.slice(0, 1)}
            </text>
          );
        })}
      </svg>

      {/* Dimension deltas */}
      <div style={styles.dimDeltas}>
        {DIMENSIONS.map((d) => {
          const val = divergence?.[d] || 0;
          const color = Math.abs(val) <= 5 ? 'var(--amber)' : val > 0 ? 'var(--teal)' : 'var(--red)';
          return (
            <span key={d} style={{ ...styles.dimDelta, color }}>
              {d[0]}{val > 0 ? '+' : ''}{val}
            </span>
          );
        })}
      </div>
    </div>
  );
}

const styles = {
  grid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))',
    gap: '8px',
  },
  card: {
    background: 'var(--surface2)',
    border: '1px solid var(--border)',
    padding: '8px',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '4px',
  },
  cardHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    width: '100%',
  },
  actorName: {
    fontFamily: 'var(--mono)',
    fontSize: '9px',
    color: 'var(--text-primary)',
    letterSpacing: '0.04em',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    flex: 1,
  },
  divBadge: {
    fontFamily: 'var(--mono)',
    fontSize: '7px',
    padding: '1px 3px',
    border: '1px solid',
    letterSpacing: '0.08em',
    flexShrink: 0,
  },
  svg: {
    display: 'block',
  },
  dimDeltas: {
    display: 'flex',
    gap: '4px',
    flexWrap: 'wrap',
    justifyContent: 'center',
  },
  dimDelta: {
    fontFamily: 'var(--mono)',
    fontSize: '8px',
    fontVariantNumeric: 'tabular-nums',
  },
};
