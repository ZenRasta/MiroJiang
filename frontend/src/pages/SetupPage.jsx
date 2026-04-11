import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { HistoryFileUpload } from '../components/PredictiveHistory';
import useSimulationStore from '../store/simulationStore';
import { api } from '../lib/api';

export default function SetupPage() {
  const navigate = useNavigate();
  const { historyFile, setHistoryFile, config, setConfig, nashResult, setNashResult } = useSimulationStore();
  const [launching, setLaunching] = useState(false);
  const [runningNash, setRunningNash] = useState(false);

  const handleHistoryLoaded = (data) => {
    setHistoryFile(data);
    setConfig({ name: data.title || 'Untitled Simulation' });
  };

  const handleRunNash = async () => {
    if (!historyFile) return;
    setRunningNash(true);
    try {
      // Build actors from history file for Nash analysis
      const actors = Object.entries(historyFile.initialStateVectors || {}).map(([id, vec]) => {
        const gameNodes = (historyFile.gameTheoryNodes || []).filter(g => g.actorId === id);
        const actions = gameNodes.flatMap(g => (g.options || []).map(o => o.action)).filter(Boolean);
        return {
          id,
          name: id.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()),
          available_actions: actions.length > 0 ? [...new Set(actions)] : ['cooperate', 'compete', 'negotiate', 'withdraw'],
          goals: [],
          relationships: [],
        };
      });

      const result = await api('/nash/analyse', 'POST', {
        seed: { actors, title: historyFile.title },
      });
      setNashResult(result);
      toast.success('Nash equilibrium analysis complete');
    } catch (err) {
      toast.error(`Nash analysis failed: ${err.message}`);
    } finally {
      setRunningNash(false);
    }
  };

  const handleLaunch = async () => {
    if (!historyFile) {
      toast.error('Please load a history file first');
      return;
    }
    setLaunching(true);
    try {
      const result = await api('/simulations', 'POST', {
        name: config.name || historyFile.title || 'Untitled Simulation',
        history_file: historyFile,
        rounds: config.rounds,
        use_nash: config.useNash,
        nash_result: nashResult,
      });

      if (result?.id) {
        toast.success('Simulation created');
        navigate(`/simulate/${result.id}`);
      } else {
        toast.error('Failed to create simulation');
      }
    } catch (err) {
      toast.error(err.message);
    } finally {
      setLaunching(false);
    }
  };

  return (
    <div style={styles.container}>
      <div style={styles.header} className="fade-up">
        <h2 style={styles.title}>New Simulation</h2>
        <p style={styles.subtitle}>Load a history file to configure your predictive history simulation</p>
      </div>

      <div style={styles.grid}>
        {/* Left: Upload + Config */}
        <div style={styles.leftCol} className="fade-up-d1">
          <HistoryFileUpload onHistoryLoaded={handleHistoryLoaded} />

          {historyFile && (
            <div style={styles.configPanel}>
              <div style={styles.configHeader}>SIMULATION CONFIG</div>

              <div style={styles.field}>
                <label style={styles.fieldLabel}>Name</label>
                <input
                  className="input"
                  value={config.name}
                  onChange={(e) => setConfig({ name: e.target.value })}
                  placeholder="Simulation name"
                />
              </div>

              <div style={styles.field}>
                <label style={styles.fieldLabel}>Rounds: {config.rounds}</label>
                <input
                  type="range"
                  min="10"
                  max="100"
                  value={config.rounds}
                  onChange={(e) => setConfig({ rounds: parseInt(e.target.value) })}
                />
              </div>

              <div style={styles.toggleRow}>
                <label style={styles.fieldLabel}>Nash Equilibrium Analysis</label>
                <div
                  className={`toggle ${config.useNash ? 'active' : ''}`}
                  onClick={() => setConfig({ useNash: !config.useNash })}
                />
              </div>

              {config.useNash && !nashResult && (
                <button
                  className="btn-ghost btn-sm"
                  onClick={handleRunNash}
                  disabled={runningNash}
                  style={{ width: '100%' }}
                >
                  {runningNash ? 'Running Nash Analysis...' : 'Run Nash Analysis Now'}
                </button>
              )}

              <button
                className="btn-primary"
                onClick={handleLaunch}
                disabled={launching}
                style={{ width: '100%', marginTop: '8px' }}
              >
                {launching ? 'Creating Simulation...' : 'Launch Simulation'}
              </button>
            </div>
          )}
        </div>

        {/* Right: Nash Results */}
        <div style={styles.rightCol} className="fade-up-d2">
          {nashResult && nashResult.equilibria && (
            <div style={styles.nashPanel}>
              <div style={styles.nashHeader}>
                <span style={styles.nashTitle}>NASH EQUILIBRIUM RESULTS</span>
                <span style={styles.nashBadge}>{nashResult.actor_count} ACTORS</span>
              </div>

              {nashResult.equilibria.map((eq, idx) => (
                <div key={idx} style={styles.eqBlock}>
                  <div style={styles.eqTitle}>
                    Equilibrium {idx + 1}
                    <span style={styles.welfare}>Social Welfare: {eq.social_welfare}</span>
                  </div>

                  <table style={styles.eqTable}>
                    <thead>
                      <tr>
                        <th style={styles.eqTh}>Actor</th>
                        <th style={styles.eqTh}>Optimal Strategy</th>
                        <th style={styles.eqTh}>Payoff</th>
                      </tr>
                    </thead>
                    <tbody>
                      {Object.entries(eq.actor_strategies).map(([name, info]) => (
                        <tr key={name}>
                          <td style={styles.eqTd}>{name}</td>
                          <td style={{ ...styles.eqTd, color: 'var(--teal)' }}>{info.optimal_strategy}</td>
                          <td style={styles.eqTd}>{info.payoff}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ))}
            </div>
          )}

          {!nashResult && historyFile && (
            <div style={styles.placeholder}>
              <span style={styles.placeholderIcon}>&#8723;</span>
              <span style={styles.placeholderText}>
                Enable Nash Equilibrium Analysis to see game-theoretic strategy predictions
              </span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

const styles = {
  container: { maxWidth: '1200px', margin: '0 auto', padding: '32px' },
  header: { marginBottom: '32px' },
  title: { fontFamily: 'var(--display)', fontSize: '28px', fontWeight: '600', marginBottom: '8px' },
  subtitle: { fontFamily: 'var(--mono)', fontSize: '12px', color: 'var(--text-dim)' },
  grid: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '32px', alignItems: 'start' },
  leftCol: { display: 'flex', flexDirection: 'column', gap: '16px' },
  rightCol: { display: 'flex', flexDirection: 'column', gap: '16px' },
  configPanel: {
    background: 'var(--surface)',
    border: '1px solid var(--border)',
    padding: '20px',
    display: 'flex',
    flexDirection: 'column',
    gap: '16px',
  },
  configHeader: {
    fontFamily: 'var(--mono)',
    fontSize: '10px',
    letterSpacing: '0.12em',
    color: 'var(--teal)',
  },
  field: { display: 'flex', flexDirection: 'column', gap: '6px' },
  fieldLabel: {
    fontFamily: 'var(--mono)',
    fontSize: '11px',
    color: 'var(--text-secondary)',
    letterSpacing: '0.5px',
  },
  toggleRow: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  nashPanel: {
    background: 'var(--surface)',
    border: '1px solid var(--border)',
    padding: '16px',
  },
  nashHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    marginBottom: '16px',
  },
  nashTitle: {
    fontFamily: 'var(--mono)',
    fontSize: '10px',
    letterSpacing: '0.12em',
    color: 'var(--violet)',
  },
  nashBadge: {
    marginLeft: 'auto',
    fontFamily: 'var(--mono)',
    fontSize: '9px',
    padding: '2px 6px',
    background: 'var(--surface2)',
    color: 'var(--text-dim)',
    border: '1px solid var(--border)',
  },
  eqBlock: { marginBottom: '16px' },
  eqTitle: {
    fontFamily: 'var(--mono)',
    fontSize: '11px',
    color: 'var(--text-primary)',
    marginBottom: '8px',
    display: 'flex',
    justifyContent: 'space-between',
  },
  welfare: {
    color: 'var(--amber)',
    fontSize: '10px',
  },
  eqTable: {
    width: '100%',
    borderCollapse: 'collapse',
    fontFamily: 'var(--mono)',
    fontSize: '11px',
  },
  eqTh: {
    padding: '6px 8px',
    textAlign: 'left',
    fontSize: '9px',
    letterSpacing: '0.08em',
    color: 'var(--text-dim)',
    borderBottom: '1px solid var(--border)',
    fontWeight: '400',
  },
  eqTd: {
    padding: '6px 8px',
    borderBottom: '1px solid var(--border)',
    color: 'var(--text-secondary)',
  },
  placeholder: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '12px',
    padding: '48px 24px',
    background: 'var(--surface)',
    border: '1px solid var(--border)',
    textAlign: 'center',
  },
  placeholderIcon: {
    fontSize: '32px',
    color: 'var(--text-dim)',
    opacity: 0.4,
  },
  placeholderText: {
    fontFamily: 'var(--mono)',
    fontSize: '12px',
    color: 'var(--text-dim)',
    maxWidth: '280px',
  },
};
