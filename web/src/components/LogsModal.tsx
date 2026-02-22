import React, { useEffect, useRef } from 'react';

export interface LogEntry {
  step: string;
  message: string;
  timestamp: number;
}

interface Props {
  logs: LogEntry[];
  onClose: () => void;
}

export default function LogsModal({ logs, onClose }: Props) {
  const overlayRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [onClose]);

  const handleOverlayClick = (e: React.MouseEvent) => {
    if (e.target === overlayRef.current) onClose();
  };

  const firstTs = logs.length > 0 ? logs[0].timestamp : 0;

  return (
    <div className="logs-modal-overlay" ref={overlayRef} onClick={handleOverlayClick}>
      <div className="logs-modal">
        <div className="logs-modal-header">
          <h3>Query Logs ({logs.length} steps)</h3>
          <button className="logs-modal-close" onClick={onClose}>&times;</button>
        </div>
        <div className="logs-modal-body">
          {logs.map((entry, i) => (
            <div key={i} className={`logs-modal-entry logs-step-${entry.step}`}>
              <span className="logs-modal-time">
                +{((entry.timestamp - firstTs) / 1000).toFixed(2)}s
              </span>
              <span className="logs-modal-step">[{entry.step}]</span>
              <span className="logs-modal-msg">{entry.message}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
