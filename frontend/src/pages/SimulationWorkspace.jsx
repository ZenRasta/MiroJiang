import { useState, useEffect, useRef } from 'react';
import { useParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import { api, sseStream } from '../lib/api';
import useSimulationStore from '../store/simulationStore';
import EventLogFeed from '../components/EventLogFeed';
import {
  StateVectorMonitor,
  CounterfactualInjector,
  DivergenceReportExport,
} from '../components/PredictiveHistory';

const PHASE_LABELS = {
  creating: 'Creating',
  building_graph: 'Building Graph',
  creating_sim: 'Creating Simulation',
  preparing: 'Preparing Agents',
  running: 'Running',
  completed: 'Completed',
  failed: 'Failed',
};

export default function SimulationWorkspace() {
  const { simId } = useParams();
  const {
    stateVectors, baselineVectors, triggeredPivots,
    events, addEvent, setSimulationStatus, triggerPivot,
    updateStateVectors,
  } = useSimulationStore();

  const [simulation, setSimulation] = useState(null);
  const [loading, setLoading] = useState(true);
  const [progress, setProgress] = useState(null);
  const [historyFile, setHistoryFile] = useState(null);
  const sseRef = useRef(null);

  // Load simulation data
  useEffect(() => {
    const load = async () => {
      try {
        const sim = await api(`/simulations/${simId}`);
        setSimulation(sim);

        // Parse history file
        let hf = {};
        try {
          hf = typeof sim.history_file === 'string' ? JSON.parse(sim.history_file) : sim.history_file;
        } catch { hf = {}; }
        setHistoryFile(hf);

        // Set state vectors from simulation
        let sv = {};
        try {
          sv = typeof sim.state_vectors === 'string' ? JSON.parse(sim.state_vectors) : sim.state_vectors;
        } catch { sv = {}; }
        if (sv && Object.keys(sv).length > 0) {
          updateStateVectors(sv);
        }

        // Parse config
        let config = {};
        try {
          config = typeof sim.config === 'string' ? JSON.parse(sim.config) : sim.config;
        } catch { config = {}; }
        setSimulation(prev => ({ ...prev, _config: config }));

        setSimulationStatus(sim.status);

        addEvent({
          timestamp: new Date().toISOString(),
          type: 'system',
          actor: 'MiroJiang',
          message: `Simulation loaded: ${sim.name} (${sim.status})`,
        });
      } catch (err) {
        toast.error(`Failed to load simulation: ${err.message}`);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [simId]);

  // Connect SSE for progress
  useEffect(() => {
    if (!simulation || simulation.status === 'completed' || simulation.status === 'failed') return;

    const cleanup = sseStream(
      `/simulations/${simId}/stream`,
      (data) => {
        setProgress(data);

        if (data.status === 'running' || data.pipeline_phase === 'running') {
          setSimulationStatus('running');
        }

        if (data.current_round > 0) {
          addEvent({
            timestamp: new Date().toISOString(),
            type: 'agent',
            actor: 'Simulation',
            message: `Round ${data.current_round}/${data.total_rounds} — ${data.action_count || 0} actions`,
          });
        } else if (data.pipeline_message) {
          addEvent({
            timestamp: new Date().toISOString(),
            type: 'system',
            actor: 'Pipeline',
            message: data.pipeline_message,
          });
        }

        // Handle completion
        if (data.status === 'completed') {
          setSimulationStatus('completed');
          toast.success('Simulation completed');
          setSimulation(prev => ({ ...prev, status: 'completed' }));
        } else if (data.status === 'failed' || data.status === 'error') {
          setSimulationStatus('failed');
          toast.error('Simulation failed');
          setSimulation(prev => ({ ...prev, status: 'failed' }));
        }
      },
      (err) => {
        console.error('SSE error:', err);
      }
    );

    sseRef.current = cleanup;
    return () => { if (sseRef.current) sseRef.current(); };
  }, [simulation?.status]);

  const handleInjectCounterfactual = async (pivotId, outcomeId, mode) => {
    if (!historyFile) return;
    try {
      const result = await api('/history/inject-counterfactual', 'POST', {
        current_vectors: stateVectors || historyFile.initialStateVectors,
        alternate_outcome_id: outcomeId,
        history: historyFile,
      });

      if (result?.updatedVectors) {
        updateStateVectors(result.updatedVectors);
        triggerPivot(pivotId, outcomeId);
        toast.success('Counterfactual injected');
      }
    } catch (err) {
      toast.error(err.message);
    }
  };

  const getProgressPercent = () => {
    if (!progress) return 0;
    if (progress.total_rounds > 0) {
      return Math.round((progress.current_round / progress.total_rounds) * 100);
    }
    return progress.pipeline_progress || 0;
  };

  if (loading) {
    return (
      <div style={styles.loading}>
        <div className="status-dot status-dot--live" />
        <span style={styles.loadingText}>Loading simulation...</span>
      </div>
    );
  }

  if (!simulation) {
    return (
      <div style={styles.loading}>
        <span style={styles.loadingText}>Simulation not found</span>
      </div>
    );
  }

  const status = simulation.status || 'unknown';
  const isActive = !['completed', 'failed'].includes(status);

  return (
    <div style={styles.container}>
      {/* Header Bar */}
      <div style={styles.headerBar}>
        <div style={styles.headerLeft}>
          <h2 style={styles.simTitle}>{simulation.name}</h2>
          <span className={`badge ${status === 'completed' ? 'badge-teal' : status === 'failed' ? 'badge-red' : status === 'running' ? 'badge-violet' : 'badge-amber'}`}>
            {isActive && <span className="status-dot status-dot--live" style={{ marginRight: '6px' }} />}
            {PHASE_LABELS[status] || status}
          </span>
        </div>
        <div style={styles.headerRight}>
          {progress && (
            <span style={styles.progressText}>
              {progress.current_round > 0
                ? `Round ${progress.current_round}/${progress.total_rounds}`
                : progress.pipeline_message || ''
              }
            </span>
          )}
        </div>
      </div>

      {/* Progress Bar */}
      {isActive && (
        <div className="progress-bar" style={{ margin: '0 0 16px 0' }}>
          <div
            className={`progress-fill ${status === 'running' ? '' : 'progress-fill--amber'}`}
            style={{ width: `${getProgressPercent()}%` }}
          />
        </div>
      )}

      {/* Main Grid */}
      <div style={styles.mainGrid}>
        {/* Left: Event Log */}
        <div style={styles.leftPanel}>
          <div style={styles.panelHeader}>EVENT LOG</div>
          <EventLogFeed events={events} maxHeight={600} />
        </div>

        {/* Right: State Vectors + Counterfactual */}
        <div style={styles.rightPanel}>
          <StateVectorMonitor
            stateVectors={stateVectors || historyFile?.initialStateVectors}
            baselineVectors={baselineVectors || historyFile?.initialStateVectors}
            recentEvents={events}
          />

          {historyFile && (
            <CounterfactualInjector
              historyFile={historyFile}
              stateVectors={stateVectors || historyFile?.initialStateVectors}
              baselineVectors={baselineVectors || historyFile?.initialStateVectors}
              currentDate={null}
              triggeredPivots={triggeredPivots}
              onInject={handleInjectCounterfactual}
            />
          )}

          <DivergenceReportExport
            historyFile={historyFile}
            stateVectors={stateVectors}
            triggeredPivots={triggeredPivots}
            simulationSummary=""
          />
        </div>
      </div>
    </div>
  );
}

const styles = {
  container: { maxWidth: '1400px', margin: '0 auto', padding: '24px' },
  loading: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '12px',
    height: 'calc(100vh - 52px)',
  },
  loadingText: {
    fontFamily: 'var(--mono)',
    fontSize: '13px',
    color: 'var(--text-dim)',
  },
  headerBar: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: '16px',
  },
  headerLeft: { display: 'flex', alignItems: 'center', gap: '12px' },
  headerRight: { display: 'flex', alignItems: 'center', gap: '12px' },
  simTitle: {
    fontFamily: 'var(--display)',
    fontSize: '22px',
    fontWeight: '600',
  },
  progressText: {
    fontFamily: 'var(--mono)',
    fontSize: '11px',
    color: 'var(--text-secondary)',
  },
  mainGrid: {
    display: 'grid',
    gridTemplateColumns: '1fr 400px',
    gap: '24px',
    alignItems: 'start',
  },
  leftPanel: { display: 'flex', flexDirection: 'column', gap: '12px' },
  rightPanel: { display: 'flex', flexDirection: 'column', gap: '12px' },
  panelHeader: {
    fontFamily: 'var(--mono)',
    fontSize: '10px',
    letterSpacing: '0.12em',
    color: 'var(--text-dim)',
  },
};
