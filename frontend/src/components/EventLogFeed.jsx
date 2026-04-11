import { useEffect, useRef } from 'react';

const ACTOR_COLORS = {
  agent: 'var(--teal)',
  system: 'var(--violet)',
  warning: 'var(--amber)',
  error: 'var(--red)',
  nash: 'var(--violet)',
  default: 'var(--text-secondary)',
};

export default function EventLogFeed({ events = [], maxHeight = 400 }) {
  const feedRef = useRef(null);

  useEffect(() => {
    if (feedRef.current) {
      feedRef.current.scrollTop = feedRef.current.scrollHeight;
    }
  }, [events]);

  const formatTime = (ts) => {
    if (!ts) return '00:00:00';
    if (typeof ts === 'string') return ts;
    const d = new Date(ts);
    return d.toLocaleTimeString('en-GB', { hour12: false });
  };

  return (
    <div className="event-log-feed" ref={feedRef} style={{ maxHeight }}>
      {events.length === 0 && (
        <div className="event-log-empty">
          <span>Awaiting events...</span>
        </div>
      )}
      {events.map((event, i) => (
        <div key={event.id || i} className="event-log-item fade-in">
          <span className="event-log-time">{formatTime(event.timestamp)}</span>
          <span className="event-log-divider">|</span>
          <span
            className="event-log-actor"
            style={{ color: ACTOR_COLORS[event.type] || ACTOR_COLORS.default }}
          >
            {event.actor || 'System'}
          </span>
          <span className="event-log-divider">|</span>
          <span className="event-log-action">{event.message || event.action}</span>
        </div>
      ))}

      <style>{`
        .event-log-feed {
          overflow-y: auto;
          background: var(--surface);
          border: 1px solid var(--border);
          padding: 12px;
          font-family: var(--mono);
          font-size: 11px;
        }
        .event-log-empty {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 8px;
          padding: 32px;
          color: var(--text-dim);
          font-size: 12px;
        }
        .event-log-item {
          display: flex;
          align-items: flex-start;
          gap: 8px;
          padding: 4px 0;
          border-bottom: 1px solid rgba(255,255,255,0.03);
          line-height: 1.4;
        }
        .event-log-item:last-child { border-bottom: none; }
        .event-log-time {
          color: var(--text-dim);
          flex-shrink: 0;
          width: 64px;
        }
        .event-log-divider {
          color: var(--border-bright);
          flex-shrink: 0;
        }
        .event-log-actor {
          flex-shrink: 0;
          min-width: 90px;
          max-width: 120px;
          font-weight: 500;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        .event-log-action {
          color: var(--text-secondary);
          flex: 1;
          display: -webkit-box;
          -webkit-line-clamp: 3;
          -webkit-box-orient: vertical;
          overflow: hidden;
          word-break: break-word;
        }
      `}</style>
    </div>
  );
}
