import { Link, useLocation } from 'react-router-dom';

export default function Navbar() {
  const location = useLocation();
  const isHome = location.pathname === '/';

  return (
    <nav style={styles.nav}>
      <Link to="/" style={styles.brand}>
        <span style={styles.brandIcon}>&#9670;</span>
        <span style={styles.brandText}>MiroJiang</span>
      </Link>

      <div style={styles.links}>
        {!isHome && (
          <Link to="/simulate" style={styles.link}>
            New Simulation
          </Link>
        )}
      </div>

      <div style={styles.right}>
        <span style={styles.version}>v1.0</span>
      </div>
    </nav>
  );
}

const styles = {
  nav: {
    display: 'flex',
    alignItems: 'center',
    height: '52px',
    padding: '0 24px',
    background: 'var(--surface)',
    borderBottom: '1px solid var(--border)',
    flexShrink: 0,
  },
  brand: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    textDecoration: 'none',
  },
  brandIcon: {
    color: 'var(--teal)',
    fontSize: '16px',
  },
  brandText: {
    fontFamily: 'var(--display)',
    fontSize: '16px',
    fontWeight: '600',
    color: 'var(--text-primary)',
    letterSpacing: '1px',
  },
  links: {
    display: 'flex',
    alignItems: 'center',
    gap: '16px',
    marginLeft: '32px',
  },
  link: {
    fontFamily: 'var(--mono)',
    fontSize: '11px',
    letterSpacing: '0.5px',
    color: 'var(--text-secondary)',
    textDecoration: 'none',
    transition: 'color 0.2s',
  },
  right: {
    marginLeft: 'auto',
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
  },
  version: {
    fontFamily: 'var(--mono)',
    fontSize: '10px',
    color: 'var(--text-dim)',
    padding: '2px 8px',
    border: '1px solid var(--border)',
  },
};
