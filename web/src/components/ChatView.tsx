import React, { useState, useRef, useEffect, useCallback } from 'react';
import { streamChat } from '../api';

interface Message {
  role: 'user' | 'assistant';
  content: string;
  sources?: Array<{
    fileName: string;
    page?: number;
    sheet?: string;
    score: number;
  }>;
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
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, scrollToBottom]);

  const handleSend = async () => {
    const trimmed = input.trim();
    if (!trimmed || isStreaming) return;

    const userMessage: Message = { role: 'user', content: trimmed };
    setMessages((prev) => [...prev, userMessage]);
    setInput('');
    setIsStreaming(true);

    // Build history for context
    const history = messages.map((m) => ({
      role: m.role,
      content: m.content,
    }));

    const assistantMessage: Message = { role: 'assistant', content: '', sources: [] };
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

    setIsStreaming(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="chat-screen">
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
                    <span key={j} className="source-tag">
                      {s.fileName}
                      {s.page ? ` p.${s.page}` : ''}
                      {s.sheet ? ` (${s.sheet})` : ''}
                    </span>
                  ))}
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
    </div>
  );
}
