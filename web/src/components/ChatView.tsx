import React, { useState, useRef, useEffect, useCallback } from 'react';
import { streamChat, openFile } from '../api';
import LogsModal, { LogEntry } from './LogsModal';
import FileBrowser from './FileBrowser';

interface Message {
  role: 'user' | 'assistant';
  content: string;
  sources?: Array<{
    fileName: string;
    filePath?: string;
    page?: number;
    sheet?: string;
    score: number;
  }>;
  logs?: LogEntry[];
  durationMs?: number;
}

interface Props {
  folder: string;
  fileCount: number;
  chunkCount: number;
}

export default function ChatView({ folder, fileCount, chunkCount }: Props) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const [activeTab, setActiveTab] = useState<'chat' | 'files'>('chat');
  const [showLogsFor, setShowLogsFor] = useState<number | null>(null);

  // Timer state
  const [elapsedMs, setElapsedMs] = useState(0);
  const [responseTimes, setResponseTimes] = useState<number[]>([]);
  const searchStartRef = useRef<number>(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, scrollToBottom]);

  // Cleanup timer on unmount
  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  const startTimer = () => {
    searchStartRef.current = Date.now();
    setElapsedMs(0);
    timerRef.current = setInterval(() => {
      setElapsedMs(Date.now() - searchStartRef.current);
    }, 100);
  };

  const stopTimer = () => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    const total = Date.now() - searchStartRef.current;
    setElapsedMs(total);
    setResponseTimes((prev) => [...prev.slice(-19), total]); // keep last 20
    return total;
  };

  const avgResponseTime = responseTimes.length > 0
    ? responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length
    : 0;

  const handleSend = async () => {
    const trimmed = input.trim();
    if (!trimmed || isStreaming) return;

    const userMessage: Message = { role: 'user', content: trimmed };
    setMessages((prev) => [...prev, userMessage]);
    setInput('');
    setIsStreaming(true);
    startTimer();

    // Build history for context
    const history = messages.map((m) => ({
      role: m.role,
      content: m.content,
    }));

    const assistantMessage: Message = { role: 'assistant', content: '', sources: [], logs: [] };
    setMessages((prev) => [...prev, assistantMessage]);

    try {
      for await (const event of streamChat(trimmed, history)) {
        if (event.type === 'sources') {
          setMessages((prev) => {
            const updated = [...prev];
            const last = updated[updated.length - 1];
            if (last.role === 'assistant') {
              last.sources = event.data;
            }
            return updated;
          });
        } else if (event.type === 'token') {
          setMessages((prev) => {
            const updated = [...prev];
            const last = updated[updated.length - 1];
            if (last.role === 'assistant') {
              last.content += event.data;
            }
            return updated;
          });
        } else if (event.type === 'log') {
          setMessages((prev) => {
            const updated = [...prev];
            const last = updated[updated.length - 1];
            if (last.role === 'assistant') {
              last.logs = [...(last.logs || []), event.data];
            }
            return updated;
          });
        } else if (event.type === 'error') {
          setMessages((prev) => {
            const updated = [...prev];
            const last = updated[updated.length - 1];
            if (last.role === 'assistant') {
              last.content = `Error: ${event.data}`;
            }
            return updated;
          });
        }
      }
    } catch (err: any) {
      setMessages((prev) => {
        const updated = [...prev];
        const last = updated[updated.length - 1];
        if (last.role === 'assistant') {
          last.content = `Sorry, something went wrong: ${err.message}`;
        }
        return updated;
      });
    }

    const totalMs = stopTimer();

    // Store duration on the message
    setMessages((prev) => {
      const updated = [...prev];
      const last = updated[updated.length - 1];
      if (last.role === 'assistant') {
        last.durationMs = totalMs;
      }
      return updated;
    });

    setIsStreaming(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleSourceClick = (filePath?: string) => {
    if (filePath) openFile(filePath);
  };

  const formatTime = (ms: number) => (ms / 1000).toFixed(1) + 's';

  return (
    <div className="chat-screen">
      {/* Tab bar */}
      <div className="tab-bar">
        <button
          className={`tab-btn ${activeTab === 'chat' ? 'active' : ''}`}
          onClick={() => setActiveTab('chat')}
        >
          Chat
        </button>
        <button
          className={`tab-btn ${activeTab === 'files' ? 'active' : ''}`}
          onClick={() => setActiveTab('files')}
        >
          Files ({fileCount})
        </button>
      </div>

      {activeTab === 'files' ? (
        <FileBrowser folder={folder} />
      ) : (
        <>
          <div className="chat-messages">
            {messages.length === 0 && (
              <div style={{ textAlign: 'center', padding: '60px 20px', color: 'var(--text-secondary)' }}>
                <div style={{ fontSize: 48, marginBottom: 16 }}>&#128172;</div>
                <h3 style={{ fontSize: 18, fontWeight: 600, marginBottom: 8, color: 'var(--text)' }}>
                  Ask about your documents
                </h3>
                <p style={{ fontSize: 14, maxWidth: 400, margin: '0 auto' }}>
                  Your {fileCount} documents are indexed and ready. Ask any question and get answers
                  with citations pointing to the exact source.
                </p>
              </div>
            )}

            {messages.map((msg, i) => (
              <div key={i} className={`message ${msg.role}`}>
                <div className="message-avatar">
                  {msg.role === 'user' ? 'U' : 'AI'}
                </div>
                <div className="message-content">
                  <div className="message-text">
                    {msg.content || (isStreaming && i === messages.length - 1 ? 'Thinking...' : '')}
                  </div>
                  {msg.sources && msg.sources.length > 0 && (
                    <div className="sources-list">
                      {msg.sources.map((s, j) => (
                        <button
                          key={j}
                          className="source-tag source-clickable"
                          onClick={() => handleSourceClick(s.filePath)}
                          title={s.filePath ? `Click to reveal in Finder: ${s.filePath}` : s.fileName}
                        >
                          {s.fileName}
                          {s.page ? ` p.${s.page}` : ''}
                          {s.sheet ? ` (${s.sheet})` : ''}
                        </button>
                      ))}
                    </div>
                  )}
                  {/* Message footer: timer + logs */}
                  {msg.role === 'assistant' && (msg.durationMs || (isStreaming && i === messages.length - 1)) && (
                    <div className="message-footer">
                      {/* Timer */}
                      {isStreaming && i === messages.length - 1 ? (
                        <span className="search-timer active">
                          &#9202; {formatTime(elapsedMs)}
                        </span>
                      ) : msg.durationMs ? (
                        <span className="search-timer">
                          {formatTime(msg.durationMs)}
                          {avgResponseTime > 0 && ` \u2014 avg: ${formatTime(avgResponseTime)}`}
                          {' \u2014 '}
                          <span className="timer-note">Speed depends on your machine's hardware</span>
                        </span>
                      ) : null}
                      {/* Logs link */}
                      {msg.logs && msg.logs.length > 0 && !isStreaming && (
                        <button
                          className="logs-link"
                          onClick={() => setShowLogsFor(i)}
                        >
                          View Logs ({msg.logs.length})
                        </button>
                      )}
                    </div>
                  )}
                </div>
              </div>
            ))}

            <div ref={messagesEndRef} />
          </div>

          <div className="chat-input-container">
            <div className="chat-input-wrapper">
              <textarea
                ref={inputRef}
                className="chat-input"
                placeholder="Ask a question about your documents..."
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                rows={1}
                disabled={isStreaming}
              />
              <button
                className="chat-send"
                onClick={handleSend}
                disabled={isStreaming || !input.trim()}
              >
                {isStreaming ? 'Answering...' : 'Send'}
              </button>
            </div>
            <div className="privacy-reminder">
              Everything runs locally on your computer. Nothing leaves your machine.
            </div>
          </div>
        </>
      )}

      {/* Logs Modal */}
      {showLogsFor !== null && messages[showLogsFor]?.logs && (
        <LogsModal
          logs={messages[showLogsFor].logs!}
          onClose={() => setShowLogsFor(null)}
        />
      )}
    </div>
  );
}
