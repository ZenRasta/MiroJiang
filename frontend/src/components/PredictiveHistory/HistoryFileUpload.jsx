import { useState, useCallback } from 'react';
import { useDropzone } from 'react-dropzone';
import toast from 'react-hot-toast';
import { validateHistoryFile, getHistoryFileSummary } from '../../data/predictiveHistorySchema';

export default function HistoryFileUpload({ onHistoryLoaded }) {
  const [historyData, setHistoryData] = useState(null);
  const [validation, setValidation] = useState(null);
  const [expandedPivots, setExpandedPivots] = useState(new Set());

  const onDrop = useCallback((acceptedFiles) => {
    const file = acceptedFiles[0];
    if (!file) return;

    if (!file.name.endsWith('.json')) {
      toast.error('History file must be a .json file');
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = JSON.parse(e.target.result);
        const result = validateHistoryFile(data);
        setValidation(result);
        setHistoryData(data);

        if (result.valid) {
          toast.success('History file validated successfully');
          if (onHistoryLoaded) onHistoryLoaded(data);
        } else {
          toast.error(`History file has ${result.errors.length} validation error(s)`);
        }
      } catch (err) {
        toast.error(`Invalid JSON: ${err.message}`);
        setValidation({ valid: false, errors: [`JSON parse error: ${err.message}`] });
      }
    };
    reader.readAsText(file);
  }, [onHistoryLoaded]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { 'application/json': ['.json'] },
    maxFiles: 1,
  });

  const loadSample = async () => {
    try {
      const res = await fetch('/api/history/sample');
      const json = await res.json();
      if (json.success && json.data) {
        const data = json.data;
        setHistoryData(data);
        setValidation({ valid: true, errors: [] });
        toast.success('Loaded Iran Trap sample history');
        if (onHistoryLoaded) onHistoryLoaded(data);
      }
    } catch (err) {
      toast.error('Failed to load sample history file');
    }
  };

  const togglePivot = (id) => {
    setExpandedPivots((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const summary = historyData ? getHistoryFileSummary(historyData) : null;

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <span style={styles.label}>HISTORY FILE</span>
        <span style={styles.badge}>.json</span>
      </div>

      <div {...getRootProps()} style={{
        ...styles.dropzone,
        borderColor: isDragActive ? 'var(--teal)' : validation?.valid ? 'var(--teal-dim)' : 'var(--border)',
        background: isDragActive ? 'var(--teal-dim)' : 'var(--surface)',
      }}>
        <input {...getInputProps()} />
        {!historyData ? (
          <div style={styles.dropContent}>
            <span style={styles.dropIcon}>&#9776;</span>
            <span style={styles.dropText}>
              {isDragActive ? 'Drop history file here' : 'Drag & drop history file (.json)'}
            </span>
            <span style={styles.dropHint}>or click to browse</span>
          </div>
        ) : (
          <div style={styles.loadedBadge}>
            <span style={{ color: 'var(--teal)' }}>&#10003;</span>
            <span>{summary?.title}</span>
            <button onClick={(e) => { e.stopPropagation(); setHistoryData(null); setValidation(null); }}
              style={styles.clearBtn}>&#10005;</button>
          </div>
        )}
      </div>

      <button onClick={loadSample} style={styles.sampleBtn}>
        Load Sample: Iran Trap Scenario
      </button>

      {validation && !validation.valid && (
        <div style={styles.errorBox}>
          <span style={styles.errorTitle}>VALIDATION ERRORS</span>
          {validation.errors.slice(0, 10).map((err, i) => (
            <div key={i} style={styles.errorItem}>&#8226; {err}</div>
          ))}
          {validation.errors.length > 10 && (
            <div style={styles.errorItem}>...and {validation.errors.length - 10} more</div>
          )}
        </div>
      )}

      {summary && validation?.valid && (
        <div style={styles.preview}>
          <div style={styles.previewHeader}>HISTORY FILE PREVIEW</div>
          <div style={styles.previewGrid}>
            <div style={styles.stat}>
              <span style={styles.statValue}>{summary.pivotPointCount}</span>
              <span style={styles.statLabel}>Pivot Points</span>
            </div>
            <div style={styles.stat}>
              <span style={styles.statValue}>{summary.analogyCount}</span>
              <span style={styles.statLabel}>Analogies</span>
            </div>
            <div style={styles.stat}>
              <span style={styles.statValue}>{summary.gameTheoryNodeCount}</span>
              <span style={styles.statLabel}>Game Theory Nodes</span>
            </div>
            <div style={styles.stat}>
              <span style={styles.statValue}>{summary.actorCount}</span>
              <span style={styles.statLabel}>Actors</span>
            </div>
          </div>

          <div style={styles.periodLine}>
            <span style={styles.dimText}>Period:</span> {summary.period.start} — {summary.period.end}
          </div>
          <div style={styles.descLine}>{summary.description.slice(0, 200)}...</div>

          <div style={styles.pivotsSection}>
            <div style={styles.pivotsSectionTitle}>PIVOT POINTS</div>
            {historyData.pivotPoints.map((pp) => (
              <div key={pp.id} style={styles.pivotItem}>
                <div onClick={() => togglePivot(pp.id)} style={styles.pivotHeader}>
                  <span style={styles.pivotDate}>{pp.date}</span>
                  <span style={styles.pivotDesc}>{pp.description.slice(0, 60)}</span>
                  <span style={styles.chevron}>{expandedPivots.has(pp.id) ? '\u25BE' : '\u25B8'}</span>
                </div>
                {expandedPivots.has(pp.id) && (
                  <div style={styles.pivotExpanded}>
                    <div style={styles.cfPrompt}>{pp.counterfactualPrompt}</div>
                    <div style={styles.defaultOutcome}>
                      <span style={styles.baselineBadge}>BASELINE</span>
                      {pp.defaultOutcome.slice(0, 120)}...
                    </div>
                    {pp.alternateOutcomes.map((ao) => (
                      <div key={ao.id} style={styles.altOutcome}>
                        <span style={styles.altBadge}>ALT</span>
                        {ao.description.slice(0, 120)}...
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

const styles = {
  container: { display: 'flex', flexDirection: 'column', gap: '12px' },
  header: { display: 'flex', alignItems: 'center', gap: '8px' },
  label: { fontFamily: 'var(--mono)', fontSize: '11px', letterSpacing: '0.1em', color: 'var(--text-secondary)', textTransform: 'uppercase' },
  badge: { fontFamily: 'var(--mono)', fontSize: '10px', padding: '2px 6px', background: 'var(--teal-dim)', color: 'var(--teal)', border: '1px solid var(--teal)' },
  dropzone: { border: '1px dashed var(--border)', padding: '24px', cursor: 'pointer', textAlign: 'center', transition: 'all 0.2s' },
  dropContent: { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px' },
  dropIcon: { fontSize: '24px', color: 'var(--text-dim)' },
  dropText: { fontFamily: 'var(--mono)', fontSize: '13px', color: 'var(--text-secondary)' },
  dropHint: { fontFamily: 'var(--mono)', fontSize: '11px', color: 'var(--text-dim)' },
  loadedBadge: { display: 'flex', alignItems: 'center', gap: '8px', fontFamily: 'var(--mono)', fontSize: '13px' },
  clearBtn: { marginLeft: 'auto', background: 'none', color: 'var(--text-dim)', cursor: 'pointer', fontSize: '14px', padding: '2px 6px' },
  sampleBtn: { fontFamily: 'var(--mono)', fontSize: '11px', padding: '8px 12px', background: 'var(--surface2)', color: 'var(--teal)', border: '1px solid var(--border)', cursor: 'pointer', textAlign: 'center', transition: 'all 0.2s' },
  errorBox: { background: 'var(--red-dim)', border: '1px solid var(--red)', padding: '12px' },
  errorTitle: { fontFamily: 'var(--mono)', fontSize: '10px', color: 'var(--red)', letterSpacing: '0.1em', display: 'block', marginBottom: '8px' },
  errorItem: { fontFamily: 'var(--mono)', fontSize: '11px', color: 'var(--text-secondary)', lineHeight: 1.6 },
  preview: { background: 'var(--surface)', border: '1px solid var(--border)', padding: '16px' },
  previewHeader: { fontFamily: 'var(--mono)', fontSize: '10px', letterSpacing: '0.1em', color: 'var(--teal)', marginBottom: '12px' },
  previewGrid: { display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '8px', marginBottom: '12px' },
  stat: { display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '8px', background: 'var(--surface2)', border: '1px solid var(--border)' },
  statValue: { fontFamily: 'var(--mono)', fontSize: '20px', fontWeight: '500', color: 'var(--teal)' },
  statLabel: { fontFamily: 'var(--mono)', fontSize: '9px', letterSpacing: '0.1em', color: 'var(--text-dim)', textTransform: 'uppercase' },
  periodLine: { fontFamily: 'var(--mono)', fontSize: '12px', color: 'var(--text-primary)', marginBottom: '4px' },
  dimText: { color: 'var(--text-dim)' },
  descLine: { fontFamily: 'var(--mono)', fontSize: '11px', color: 'var(--text-secondary)', lineHeight: 1.5, marginBottom: '12px' },
  pivotsSection: { borderTop: '1px solid var(--border)', paddingTop: '12px' },
  pivotsSectionTitle: { fontFamily: 'var(--mono)', fontSize: '10px', letterSpacing: '0.1em', color: 'var(--text-dim)', marginBottom: '8px' },
  pivotItem: { borderBottom: '1px solid var(--border)' },
  pivotHeader: { display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 0', cursor: 'pointer', fontFamily: 'var(--mono)', fontSize: '12px' },
  pivotDate: { color: 'var(--amber)', flexShrink: 0, minWidth: '90px' },
  pivotDesc: { color: 'var(--text-secondary)', flex: 1 },
  chevron: { color: 'var(--text-dim)', flexShrink: 0 },
  pivotExpanded: { padding: '0 0 12px 98px', display: 'flex', flexDirection: 'column', gap: '6px' },
  cfPrompt: { fontFamily: 'var(--mono)', fontSize: '11px', color: 'var(--teal)', fontStyle: 'italic' },
  defaultOutcome: { fontFamily: 'var(--mono)', fontSize: '11px', color: 'var(--text-secondary)', display: 'flex', alignItems: 'flex-start', gap: '8px' },
  baselineBadge: { fontFamily: 'var(--mono)', fontSize: '9px', padding: '1px 4px', background: 'var(--surface2)', color: 'var(--text-dim)', border: '1px solid var(--border)', flexShrink: 0 },
  altOutcome: { fontFamily: 'var(--mono)', fontSize: '11px', color: 'var(--text-secondary)', display: 'flex', alignItems: 'flex-start', gap: '8px' },
  altBadge: { fontFamily: 'var(--mono)', fontSize: '9px', padding: '1px 4px', background: 'var(--violet-dim)', color: 'var(--violet)', border: '1px solid var(--violet)', flexShrink: 0 },
};
