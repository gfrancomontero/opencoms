import React, { useEffect, useRef } from 'react';

interface LogEntry {
  level: string;
  message: string;
  timestamp: number;
}

interface ProgressData {
  phase: string;
  current: number;
  total: number;
  file?: string;
  message: string;
}

interface Props {
  logs: LogEntry[];
  progress: ProgressData | null;
  folder: string;
  onDone: () => void;
}

export default function IndexingProgress({ logs, progress, folder, onDone }: Props) {
  const logEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [logs]);

  useEffect(() => {
    if (progress?.phase === 'done') {
      // Small delay before transitioning to chat
      const timer = setTimeout(onDone, 1500);
      return () => clearTimeout(timer);
    }
  }, [progress, onDone]);

  const percent = progress && progress.total > 0
    ? Math.round((progress.current / progress.total) * 100)
    : 0;

  const isDone = progress?.phase === 'done';

  return (
    <div className="indexing-screen">
      <div className="indexing-card">
        <h2>{isDone ? 'Ready!' : 'Indexing Your Documents'}</h2>

        <div className="progress-bar-container">
          <div
            className="progress-bar"
            style={{
              width: `${isDone ? 100 : percent}%`,
              background: isDone ? 'var(--green)' : 'var(--primary)',
            }}
          />
        </div>

        <p className="progress-text">
          {isDone
            ? 'Your documents are indexed. You can now ask questions!'
            : progress?.message || 'Preparing...'}
        </p>

        <div className="log-container">
          {logs.map((entry, i) => (
            <div key={i} className={`log-entry ${entry.level}`}>
              {entry.message}
            </div>
          ))}
          <div ref={logEndRef} />
        </div>

        <div style={{ marginTop: 16, fontSize: 12, color: 'var(--text-secondary)' }}>
          Folder: {folder}
        </div>
      </div>
    </div>
  );
}
