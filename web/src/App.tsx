import React, { useState, useEffect, useCallback } from 'react';
import SecurityScreen from './components/SecurityScreen';
import FolderSetup from './components/FolderSetup';
import IndexingProgress from './components/IndexingProgress';
import ChatView from './components/ChatView';
import { fetchStatus, createEventSource, reindex } from './api';

type Screen = 'loading' | 'security' | 'folder' | 'indexing' | 'chat';

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

interface StatusData {
  folder?: string;
  firstRunComplete: boolean;
  ollamaRunning: boolean;
  embeddingModelReady: boolean;
  fileCount: number;
  chunkCount: number;
  chatModel: string;
  privacyMode: boolean;
}

export default function App() {
  const [screen, setScreen] = useState<Screen>('loading');
  const [status, setStatus] = useState<StatusData | null>(null);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [progress, setProgress] = useState<ProgressData | null>(null);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [folder, setFolder] = useState('');

  // Fetch initial status
  useEffect(() => {
    fetchStatus()
      .then((data: StatusData) => {
        setStatus(data);
        if (!data.firstRunComplete) {
          setScreen('security');
        } else if (!data.folder) {
          setScreen('folder');
        } else if (data.fileCount === 0) {
          setFolder(data.folder);
          setScreen('indexing');
        } else {
          setFolder(data.folder);
          setScreen('chat');
        }
      })
      .catch(() => {
        // Server not ready yet, retry
        setTimeout(() => window.location.reload(), 2000);
      });
  }, []);

  // SSE connection for real-time updates
  useEffect(() => {
    const es = createEventSource();

    es.addEventListener('log', (e: MessageEvent) => {
      const data = JSON.parse(e.data);
      setLogs((prev) => [...prev.slice(-200), data]);
    });

    es.addEventListener('progress', (e: MessageEvent) => {
      const data = JSON.parse(e.data);
      setProgress(data);
    });

    es.addEventListener('status', (e: MessageEvent) => {
      const data = JSON.parse(e.data);
      setStatus((prev) => prev ? { ...prev, ...data } : data);
    });

    return () => es.close();
  }, []);

  const handleSecurityComplete = useCallback(() => {
    setScreen('folder');
  }, []);

  const handleFolderSelected = useCallback((selectedFolder: string) => {
    setFolder(selectedFolder);
    setScreen('indexing');
  }, []);

  const handleIndexingDone = useCallback(() => {
    // Refresh status before going to chat
    fetchStatus().then((data: StatusData) => {
      setStatus(data);
      setScreen('chat');
    });
  }, []);

  if (screen === 'loading') {
    return (
      <div className="app">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', color: 'var(--text-secondary)' }}>
          Loading OpenComs...
        </div>
      </div>
    );
  }

  return (
    <div className="app">
      <div className="header">
        <div className="header-left">
          <h1>OpenComs</h1>
          {screen === 'chat' && (
            <span className="header-badge">
              Offline Ready
            </span>
          )}
        </div>
        <div className="header-right">
          {screen === 'chat' && folder && (
            <>
              <button className="btn btn-secondary" onClick={() => setScreen('folder')} style={{ fontSize: 12, padding: '6px 12px' }}>
                Change Folder
              </button>
              <button className="btn btn-secondary" onClick={() => reindex()} style={{ fontSize: 12, padding: '6px 12px' }}>
                Reindex
              </button>
            </>
          )}
          <button className="advanced-toggle" onClick={() => setShowAdvanced(!showAdvanced)}>
            {showAdvanced ? 'Hide Advanced' : 'Advanced'}
          </button>
        </div>
      </div>

      {showAdvanced && status && (
        <div className="advanced-panel">
          <h3>Diagnostics</h3>
          <div className="advanced-row">
            <span className="advanced-label">Ollama</span>
            <span>{status.ollamaRunning ? 'Running' : 'Stopped'}</span>
          </div>
          <div className="advanced-row">
            <span className="advanced-label">Chat Model</span>
            <span>{status.chatModel}</span>
          </div>
          <div className="advanced-row">
            <span className="advanced-label">Embedding Model</span>
            <span>{status.embeddingModelReady ? 'Ready' : 'Not downloaded'}</span>
          </div>
          <div className="advanced-row">
            <span className="advanced-label">Folder</span>
            <span>{status.folder || 'Not set'}</span>
          </div>
          <div className="advanced-row">
            <span className="advanced-label">Files Indexed</span>
            <span>{status.fileCount}</span>
          </div>
          <div className="advanced-row">
            <span className="advanced-label">Chunks</span>
            <span>{status.chunkCount}</span>
          </div>
          <div className="advanced-row">
            <span className="advanced-label">Privacy Mode</span>
            <span>{status.privacyMode ? 'Enabled' : 'Disabled'}</span>
          </div>
          <div className="advanced-row">
            <span className="advanced-label">Data Location</span>
            <span>~/.opencoms/</span>
          </div>
        </div>
      )}

      {screen === 'security' && (
        <SecurityScreen onComplete={handleSecurityComplete} />
      )}

      {screen === 'folder' && (
        <FolderSetup onFolderSelected={handleFolderSelected} />
      )}

      {screen === 'indexing' && (
        <IndexingProgress
          logs={logs}
          progress={progress}
          folder={folder}
          onDone={handleIndexingDone}
        />
      )}

      {screen === 'chat' && status && (
        <ChatView
          folder={folder}
          fileCount={status.fileCount}
          chunkCount={status.chunkCount}
        />
      )}

      <div className="status-bar">
        <span>
          <span className={`status-dot ${status?.ollamaRunning ? 'green' : 'red'}`} />
          {status?.ollamaRunning ? 'AI Ready' : 'AI Offline'}
        </span>
        {status?.folder && (
          <span>{status.fileCount} files indexed</span>
        )}
        <span style={{ marginLeft: 'auto' }}>
          Nothing leaves your computer
        </span>
      </div>
    </div>
  );
}
