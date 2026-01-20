import { useEffect, useState, useRef } from 'react';
import ReactMarkdown from 'react-markdown';
import styles from './AiChatPanel.module.css';
import {
  trackChatOpened,
  trackChatClosed,
  trackQuerySubmitted,
  trackResponseReceived,
  trackError,
  trackMessageCopied,
  trackTemplateUsed,
} from '../utils/telemetry';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:8000';

const AiChatPanel = ({ token, onClose }) => {
  const panelRef = useRef(null);
  const messagesEndRef = useRef(null);
  const textareaRef = useRef(null);
  const openTimeRef = useRef(Date.now());
  const queryStartTimeRef = useRef(null);
  
  // Focus trap refs
  const firstFocusableRef = useRef(null);
  const lastFocusableRef = useRef(null);

  const templateQuestions = [
    'Bu ay nakit akışım nasıl?',
    'Sabit giderlerim neler?',
    'Gelir ve gider dağılımı?',
    'En büyük giderlerim?',
    'Gelecek ay tahmini pozisyon?',
  ];

  const initialMessages = [
    {
      role: 'assistant',
      content: 'Merhaba! Ben Seyfo AI, mali danışmanınızım. Size nakit akışı, giderler, gelirler ve tahminler hakkında yardımcı olabilirim. Nasıl yardımcı olabilirim?',
      timestamp: new Date().toISOString(),
    },
  ];

  const [messages, setMessages] = useState(() => {
    const saved = localStorage.getItem('ai_chat_messages');
    return saved ? JSON.parse(saved) : initialMessages;
  });

  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState(null);
  const [lastQuery, setLastQuery] = useState(null);
  const [collapsedMessages, setCollapsedMessages] = useState(new Set());
  const [copiedMessageId, setCopiedMessageId] = useState(null);
  const [usedTemplates, setUsedTemplates] = useState(new Set());
  const [closing, setClosing] = useState(false);

  // Track chat opened on mount
  useEffect(() => {
    trackChatOpened();

    return () => {
      const duration = Date.now() - openTimeRef.current;
      trackChatClosed(duration, messages.length);
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Save messages to localStorage
  useEffect(() => {
    localStorage.setItem('ai_chat_messages', JSON.stringify(messages));
  }, [messages]);

  // Auto-scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Focus trap
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        handleClose();
        return;
      }

      if (e.key === 'Tab') {
        const focusableElements = panelRef.current?.querySelectorAll(
          'button:not(:disabled), textarea, [tabindex]:not([tabindex="-1"])'
        );
        const firstElement = focusableElements?.[0];
        const lastElement = focusableElements?.[focusableElements.length - 1];

        if (e.shiftKey && document.activeElement === firstElement) {
          e.preventDefault();
          lastElement?.focus();
        } else if (!e.shiftKey && document.activeElement === lastElement) {
          e.preventDefault();
          firstElement?.focus();
        }
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    textareaRef.current?.focus();

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [onClose, closing]);

  // Handle send
  const handleSend = async (query, isTemplate = false) => {
    if (sending || !query.trim()) return;

    const userMessage = {
      role: 'user',
      content: query.trim(),
      timestamp: new Date().toISOString(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setInput('');
    setSending(true);
    setError(null);
    setLastQuery(query.trim());

    queryStartTimeRef.current = Date.now();
    trackQuerySubmitted(query.trim(), isTemplate);

    try {
      const response = await fetch(`${API_BASE}/ai/query`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ question: query.trim() }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.detail || `HTTP ${response.status}`);
      }

      const data = await response.json();
      const responseTime = Date.now() - queryStartTimeRef.current;

      const assistantMessage = {
        role: 'assistant',
        content: data.answer || 'Üzgünüm, bir cevap oluşturamadım.',
        timestamp: new Date().toISOString(),
      };

      setMessages((prev) => [...prev, assistantMessage]);
      trackResponseReceived(responseTime, data.answer?.length || 0);
    } catch (err) {
      console.error('AI Query Error:', err);
      const errorType = err.message.includes('401') || err.message.includes('403')
        ? 'auth'
        : err.message.includes('fetch')
        ? 'network'
        : 'server';

      trackError(errorType, err.message);
      setError(err.message);
    } finally {
      setSending(false);
    }
  };

  // Handle submit
  const handleSubmit = (e) => {
    e.preventDefault();
    handleSend(input);
  };

  // Handle template click
  const handleTemplateClick = (question, index) => {
    trackTemplateUsed(index);
    setUsedTemplates((prev) => new Set([...prev, index]));
    handleSend(question, true);
  };

  // Handle textarea keydown
  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    }
  };

  // Handle retry
  const handleRetry = () => {
    if (lastQuery) {
      handleSend(lastQuery);
    }
  };

  // Handle copy
  const handleCopy = async (content, messageId, role) => {
    try {
      await navigator.clipboard.writeText(content);
      setCopiedMessageId(messageId);
      trackMessageCopied(role);
      setTimeout(() => setCopiedMessageId(null), 2000);
    } catch (err) {
      console.error('Copy failed:', err);
    }
  };

  // Handle collapse toggle
  const handleCollapseToggle = (messageId) => {
    setCollapsedMessages((prev) => {
      const next = new Set(prev);
      if (next.has(messageId)) {
        next.delete(messageId);
      } else {
        next.add(messageId);
      }
      return next;
    });
  };

  // Handle close with animation
  const handleClose = () => {
    setClosing(true);
    setTimeout(() => {
      onClose();
    }, 300); // Match animation duration
  };

  // Handle overlay click (close on backdrop)
  const handleOverlayClick = (e) => {
    if (e.target === e.currentTarget) {
      handleClose();
    }
  };

  // Format timestamp
  const formatTime = (timestamp) => {
    const date = new Date(timestamp);
    return date.toLocaleTimeString('tr-TR', {
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  // Check if message is long (for collapse feature)
  const isLongMessage = (content) => {
    return content.length > 500;
  };

  return (
    <div
      className={styles.overlay}
      onClick={handleOverlayClick}
      role="dialog"
      aria-modal="true"
      aria-labelledby="ai-chat-title"
    >
      <div className={`${styles.panel} ${closing ? styles.closing : ''}`} ref={panelRef}>
        {/* Header */}
        <div className={styles.header}>
          <h2 id="ai-chat-title" className={styles.title}>
            💬 Seyfo AI
          </h2>
          <button
            ref={firstFocusableRef}
            onClick={handleClose}
            className={styles.closeBtn}
            aria-label="Sohbeti kapat"
            title="Sohbeti kapat (ESC)"
          >
            ✕
          </button>
        </div>

        {/* Messages */}
        <div
          className={styles.messages}
          role="log"
          aria-live="polite"
          aria-atomic="false"
          tabIndex={0}
        >
          {messages.map((msg, idx) => {
            const messageId = `${msg.timestamp}-${idx}`;
            const isCollapsed = collapsedMessages.has(messageId);
            const isLong = isLongMessage(msg.content);
            const isCopied = copiedMessageId === messageId;

            return (
              <div
                key={messageId}
                className={`${styles.message} ${
                  msg.role === 'user' ? styles.userMessage : styles.assistantMessage
                } ${isCollapsed ? styles.collapsed : ''}`}
              >
                <div className={styles.messageHeader}>
                  <div className={styles.messageMeta}>
                    <span className={styles.messageRole}>
                      {msg.role === 'user' ? 'Siz' : 'Seyfo AI'}
                    </span>
                    <span className={styles.messageTime}>
                      {formatTime(msg.timestamp)}
                    </span>
                  </div>
                  {msg.role === 'assistant' && (
                    <div className={styles.messageActions}>
                      <button
                        onClick={() => handleCopy(msg.content, messageId, msg.role)}
                        className={styles.iconBtn}
                        aria-label={isCopied ? 'Kopyalandı' : 'Mesajı kopyala'}
                        title={isCopied ? 'Kopyalandı!' : 'Kopyala'}
                      >
                        {isCopied ? '✓' : '📋'}
                      </button>
                    </div>
                  )}
                </div>

                <div className={styles.messageBubble}>
                  {msg.role === 'assistant' ? (
                    <ReactMarkdown
                      components={{
                        table: ({ node, ...props }) => (
                          <div className={styles.tableWrapper}>
                            <table {...props} />
                          </div>
                        ),
                      }}
                    >
                      {msg.content}
                    </ReactMarkdown>
                  ) : (
                    <p>{msg.content}</p>
                  )}
                </div>

                {isLong && (
                  <button
                    onClick={() => handleCollapseToggle(messageId)}
                    className={styles.expandBtn}
                    aria-expanded={!isCollapsed}
                  >
                    {isCollapsed ? '▼ Tümünü göster' : '▲ Daralt'}
                  </button>
                )}
              </div>
            );
          })}

          {/* Error Message */}
          {error && (
            <div className={styles.error} role="alert">
              <span>⚠️ Bir hata oluştu: {error}</span>
              {lastQuery && (
                <button
                  onClick={handleRetry}
                  className={styles.retryBtn}
                  aria-label="Tekrar dene"
                >
                  Tekrar Dene
                </button>
              )}
            </div>
          )}

          {!sending && usedTemplates.size < templateQuestions.length && (
            <div className={styles.templates}>
              <p className={styles.templateTitle}>
                {usedTemplates.size === 0 ? 'Örnek sorular:' : 'Diğer sorular:'}
              </p>
              {templateQuestions.map((q, i) => (
                !usedTemplates.has(i) && (
                  <button
                    key={i}
                    onClick={() => handleTemplateClick(q, i)}
                    className={styles.templateBtn}
                  >
                    {q}
                  </button>
                )
              ))}
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Input Form */}
        <form onSubmit={handleSubmit} className={styles.form}>
          <div className={styles.inputWrapper}>
            <textarea
              ref={textareaRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Soru sorun... (Shift+Enter ile yeni satır)"
              disabled={sending}
              className={styles.textarea}
              rows={1}
              aria-label="Soru girin"
              style={{
                height: 'auto',
                minHeight: '44px',
              }}
              onInput={(e) => {
                e.target.style.height = 'auto';
                e.target.style.height = Math.min(e.target.scrollHeight, 120) + 'px';
              }}
            />
            <button
              ref={lastFocusableRef}
              type="submit"
              disabled={sending || !input.trim()}
              className={styles.submitBtn}
              aria-label="Gönder"
            >
              {sending ? (
                <>
                  <span className={styles.spinner} aria-hidden="true" />
                  <span>Gönderiliyor...</span>
                </>
              ) : (
                'Gönder'
              )}
            </button>
          </div>
          <div className={styles.hint}>
            <kbd>Shift</kbd> + <kbd>Enter</kbd> yeni satır • <kbd>Esc</kbd> kapat
          </div>
        </form>

        {/* Screen reader announcements */}
        <div className={styles.srOnly} role="status" aria-live="polite" aria-atomic="true">
          {sending && 'AI yanıt oluşturuyor...'}
          {error && `Hata: ${error}`}
        </div>
      </div>
    </div>
  );
};

export default AiChatPanel;
