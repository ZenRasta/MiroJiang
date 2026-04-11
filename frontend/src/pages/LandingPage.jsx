import { useNavigate } from 'react-router-dom';

export default function LandingPage() {
  const navigate = useNavigate();

  return (
    <div style={styles.container}>
      <div style={styles.hero} className="fade-up">
        <div style={styles.tagline}>PREDICTIVE HISTORY ENGINE</div>
        <h1 style={styles.title}>MiroJiang</h1>
        <p style={styles.subtitle}>
          Simulate outcomes of historical events through counterfactual analysis,
          game-theoretic reasoning, and four-dimensional state tracking.
        </p>

        <button
          className="btn-primary"
          onClick={() => navigate('/simulate')}
          style={{ marginTop: '32px', fontSize: '14px', padding: '14px 32px' }}
        >
          Start Simulation
        </button>
      </div>

      <div style={styles.features} className="fade-up-d3">
        <div style={styles.feature}>
          <div style={styles.featureIcon}>N/P/E/M</div>
          <div style={styles.featureTitle}>State Vector Tracking</div>
          <div style={styles.featureDesc}>
            Track Narrative, Political, Economic, and Military dimensions for every actor in real-time.
          </div>
        </div>
        <div style={styles.feature}>
          <div style={styles.featureIcon}>&#9670;</div>
          <div style={styles.featureTitle}>Counterfactual Injection</div>
          <div style={styles.featureDesc}>
            Explore "what if" scenarios by triggering alternate outcomes at historical pivot points.
          </div>
        </div>
        <div style={styles.feature}>
          <div style={styles.featureIcon}>&#8723;</div>
          <div style={styles.featureTitle}>Nash Equilibrium</div>
          <div style={styles.featureDesc}>
            Game-theoretic analysis of actor strategies with payoff matrix computation.
          </div>
        </div>
        <div style={styles.feature}>
          <div style={styles.featureIcon}>&#916;</div>
          <div style={styles.featureTitle}>Divergence Analysis</div>
          <div style={styles.featureDesc}>
            Compare counterfactual branches against baseline timelines with detailed reports.
          </div>
        </div>
      </div>

      <div style={styles.framework} className="fade-up-d5">
        <span style={styles.frameworkLabel}>FRAMEWORK</span>
        <span style={styles.frameworkText}>Jiang Xueqin Predictive History Analysis</span>
      </div>
    </div>
  );
}

const styles = {
  container: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 'calc(100vh - 52px)',
    padding: '48px 32px',
    textAlign: 'center',
  },
  hero: {
    maxWidth: '640px',
  },
  tagline: {
    fontFamily: 'var(--mono)',
    fontSize: '11px',
    letterSpacing: '3px',
    color: 'var(--teal)',
    marginBottom: '16px',
  },
  title: {
    fontFamily: 'var(--display)',
    fontSize: '56px',
    fontWeight: '900',
    color: 'var(--text-primary)',
    lineHeight: 1.1,
    marginBottom: '16px',
  },
  subtitle: {
    fontFamily: 'var(--body)',
    fontSize: '16px',
    color: 'var(--text-secondary)',
    lineHeight: 1.6,
    maxWidth: '480px',
    margin: '0 auto',
  },
  features: {
    display: 'grid',
    gridTemplateColumns: 'repeat(4, 1fr)',
    gap: '16px',
    marginTop: '64px',
    maxWidth: '900px',
    width: '100%',
  },
  feature: {
    padding: '20px 16px',
    background: 'var(--surface)',
    border: '1px solid var(--border)',
    textAlign: 'center',
  },
  featureIcon: {
    fontFamily: 'var(--mono)',
    fontSize: '20px',
    color: 'var(--teal)',
    marginBottom: '12px',
  },
  featureTitle: {
    fontFamily: 'var(--mono)',
    fontSize: '11px',
    letterSpacing: '0.5px',
    color: 'var(--text-primary)',
    marginBottom: '8px',
  },
  featureDesc: {
    fontFamily: 'var(--body)',
    fontSize: '12px',
    color: 'var(--text-dim)',
    lineHeight: 1.5,
  },
  framework: {
    marginTop: '48px',
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
  },
  frameworkLabel: {
    fontFamily: 'var(--mono)',
    fontSize: '9px',
    letterSpacing: '1px',
    color: 'var(--text-dim)',
    padding: '2px 6px',
    border: '1px solid var(--border)',
  },
  frameworkText: {
    fontFamily: 'var(--mono)',
    fontSize: '12px',
    color: 'var(--text-secondary)',
  },
};
