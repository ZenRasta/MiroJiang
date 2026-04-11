import { useState } from 'react';
import toast from 'react-hot-toast';
import { api } from '../../lib/api';

export default function DivergenceReportExport({
  historyFile,
  stateVectors,
  triggeredPivots,
  simulationSummary,
}) {
  const [generating, setGenerating] = useState(false);

  const handleExport = async () => {
    if (!historyFile || !stateVectors) {
      toast.error('No simulation data available for report');
      return;
    }

    setGenerating(true);
    try {
      const res = await api('/history/divergence-report', 'POST', {
        history: historyFile,
        current_vectors: stateVectors,
        triggered_pivots: triggeredPivots || {},
        simulation_summary: simulationSummary || '',
      });

      const markdown = res?.data?.markdown || res?.markdown;
      if (!markdown) {
        toast.error('Failed to generate report');
        return;
      }

      // Download as .md file
      const blob = new Blob([markdown], { type: 'text/markdown' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `divergence-report-${historyFile.title?.replace(/\s+/g, '-').toLowerCase() || 'report'}.md`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      toast.success('Report downloaded');
    } catch (err) {
      toast.error(`Report generation failed: ${err.message}`);
    } finally {
      setGenerating(false);
    }
  };

  return (
    <button
      onClick={handleExport}
      disabled={generating || !historyFile || !stateVectors}
      style={{
        ...styles.btn,
        opacity: generating || !historyFile || !stateVectors ? 0.5 : 1,
      }}
    >
      {generating ? 'GENERATING...' : 'EXPORT DIVERGENCE REPORT'}
    </button>
  );
}

const styles = {
  btn: {
    fontFamily: 'var(--mono)',
    fontSize: '10px',
    letterSpacing: '0.1em',
    padding: '8px 16px',
    background: 'var(--surface2)',
    color: 'var(--teal)',
    border: '1px solid var(--teal)',
    cursor: 'pointer',
    transition: 'all 0.2s',
    width: '100%',
    textAlign: 'center',
  },
};
