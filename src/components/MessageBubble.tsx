import React, { useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { useTranslation } from 'react-i18next';
import { DownOutlined, RightOutlined } from '@ant-design/icons';
import type { ChatMessage } from '../types';
import type { InputMode } from '../stores/appStore';

const MODE_LABELS: Record<InputMode, { color: string; key: string }> = {
  prompt: { color: 'var(--accent-teal)', key: 'chatWindow.modePrompt' },
  steer: { color: 'var(--accent-amber)', key: 'chatWindow.modeSteer' },
  follow_up: { color: 'var(--accent-purple)', key: 'chatWindow.modeFollowUp' },
};

interface MessageBubbleProps {
  msg: ChatMessage;
  // Index of this message in the list (used for ARIA).
  index: number;
}

/**
 * Pure message renderer — kept out of ChatWindow.tsx so that streaming text_delta
 * updates only re-render the last message bubble, not the whole list.
 *
 * Memoized: re-renders only when the message object reference changes, so other
 * interactions (input typing, hover states, etc.) do not trigger expensive
 * markdown re-parsing on already-settled messages.
 */
const MessageBubble: React.FC<MessageBubbleProps> = React.memo(({ msg, index }) => {
  const { t } = useTranslation();
  const mode = msg.metadata?.mode as InputMode | undefined;
  const modeLabel = mode ? MODE_LABELS[mode] : null;

  return (
    <div
      className={`message-bubble ${msg.role}`}
      role="article"
      aria-label={t('chatWindow.ariaMessage', { index: index + 1, role: msg.role })}
      style={{
        marginBottom: 20,
        display: 'flex',
        flexDirection: 'column',
        alignItems: msg.role === 'user' ? 'flex-end' : 'flex-start',
      }}
    >
      <div
        style={{
          fontSize: 11,
          color: msg.role === 'user' ? 'var(--text-muted)' : 'var(--accent-teal)',
          marginBottom: 6,
          marginLeft: msg.role === 'assistant' ? 4 : 0,
          marginRight: msg.role === 'user' ? 4 : 0,
          fontWeight: 600,
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          textTransform: 'uppercase',
          letterSpacing: '0.5px',
        }}
      >
        <span
          style={{
            fontSize: 10,
            padding: '2px 10px',
            borderRadius: 4,
            background: msg.role === 'user' ? 'var(--bg-surface)' : 'var(--accent-teal-dim)',
            color: msg.role === 'user' ? 'var(--text-secondary)' : 'var(--accent-teal)',
            border:
              msg.role === 'user'
                ? '1px solid var(--border-color)'
                : '1px solid rgba(0,212,170,0.2)',
          }}
        >
          {msg.role === 'user'
            ? t('chatWindow.you')
            : msg.role === 'assistant'
              ? t('chatWindow.pi')
              : msg.role}
        </span>
        {modeLabel && mode !== 'prompt' && (
          <span
            style={{
              fontSize: 9,
              padding: '1px 6px',
              borderRadius: 3,
              background: modeLabel.color + '20',
              color: modeLabel.color,
              border: `1px solid ${modeLabel.color}40`,
              textTransform: 'none',
              letterSpacing: 0,
            }}
          >
            {t(modeLabel.key)}
          </span>
        )}
      </div>
      <div
        style={{
          maxWidth: '85%',
          padding: msg.role === 'user' ? '10px 16px' : '6px 6px',
          borderRadius: msg.role === 'user' ? '14px 14px 4px 14px' : 4,
          background:
            msg.role === 'user'
              ? 'linear-gradient(135deg, rgba(0,212,170,0.12), rgba(0,212,170,0.06))'
              : 'transparent',
          border: msg.role === 'user' ? '1px solid rgba(0,212,170,0.15)' : 'none',
          color: 'var(--text-primary)',
          lineHeight: 1.7,
          position: 'relative',
        }}
      >
        {msg.role === 'assistant' ? (
          <>
            {msg.thinking ? <ThinkingBlock thinking={msg.thinking} isStreaming={!!msg.isStreaming} /> : null}
            <div className="markdown-content">
            <ReactMarkdown
              remarkPlugins={[remarkGfm]}
              components={{
                code: ({ className, children, ...props }: any) => {
                  const isInline = !className;
                  if (isInline)
                    return (
                      <code
                        style={{
                          background: 'var(--bg-surface)',
                          padding: '2px 8px',
                          borderRadius: 4,
                          fontSize: '0.85em',
                          color: 'var(--accent-teal)',
                          border: '1px solid var(--border-color)',
                        }}
                        {...props}
                      >
                        {children}
                      </code>
                    );
                  return (
                    <pre
                      style={{
                        background: 'var(--bg-primary)',
                        border: '1px solid var(--border-color)',
                        color: 'var(--text-primary)',
                        padding: 14,
                        borderRadius: 'var(--radius-md)',
                        overflow: 'auto',
                        fontSize: 13,
                        margin: '10px 0',
                        position: 'relative',
                      }}
                    >
                      <code className={className} {...props}>
                        {children}
                      </code>
                    </pre>
                  );
                },
                a: ({ href, children }: any) => (
                  <a href={href} style={{ color: 'var(--accent-teal)' }} target="_blank" rel="noopener noreferrer">
                    {children}
                  </a>
                ),
                blockquote: ({ children }: any) => (
                  <blockquote
                    style={{
                      borderLeft: '3px solid var(--accent-teal)',
                      padding: '8px 16px',
                      margin: '10px 0',
                      color: 'var(--text-secondary)',
                      background: 'var(--bg-secondary)',
                      borderRadius: '0 var(--radius-sm) var(--radius-sm) 0',
                    }}
                  >
                    {children}
                  </blockquote>
                ),
              }}
            >
              {msg.content || ''}
            </ReactMarkdown>
            {msg.isStreaming && (
              <span
                style={{
                  display: 'inline-block',
                  width: 8,
                  height: 16,
                  background: 'var(--accent-teal)',
                  marginLeft: 2,
                  animation: 'cursor-blink 1s step-end infinite',
                  verticalAlign: 'text-bottom',
                  borderRadius: 1,
                }}
                aria-hidden="true"
              />
            )}
          </div>
          </>
        ) : (
          <span style={{ whiteSpace: 'pre-wrap', fontSize: 14, color: 'var(--text-primary)', opacity: 0.9 }}>
            {msg.content}
          </span>
        )}
      </div>
      {msg.timestamp && (
        <div
          style={{
            fontSize: 10,
            color: 'var(--text-muted)',
            marginTop: 4,
            marginLeft: msg.role === 'assistant' ? 8 : 0,
            marginRight: msg.role === 'user' ? 8 : 0,
          }}
        >
          {new Date(msg.timestamp).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}
        </div>
      )}
    </div>
  );
});

MessageBubble.displayName = 'MessageBubble';

/**
 * Collapsible block that surfaces pi's streamed reasoning (the "thinking"
 * deltas) separately from the final reply, so the user can see the model's
 * thought process without it polluting the main message.
 */
const ThinkingBlock: React.FC<{ thinking: string; isStreaming: boolean }> = ({ thinking, isStreaming }) => {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const trimmed = thinking.trim();
  if (!trimmed) return null;
  return (
    <div
      style={{
        marginBottom: 10,
        border: '1px solid rgba(124, 92, 252, 0.25)',
        background: 'rgba(124, 92, 252, 0.06)',
        borderRadius: 8,
        overflow: 'hidden',
      }}
    >
      <div
        onClick={() => setOpen((v) => !v)}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          padding: '6px 10px',
          cursor: 'pointer',
          fontSize: 11,
          fontWeight: 600,
          color: 'var(--accent-purple)',
          textTransform: 'uppercase',
          letterSpacing: '0.5px',
          userSelect: 'none',
        }}
      >
        {open ? <DownOutlined style={{ fontSize: 10 }} /> : <RightOutlined style={{ fontSize: 10 }} />}
        <span>💭 {t('chatWindow.thinking')}{isStreaming ? '…' : ''}</span>
        <span style={{ marginLeft: 'auto', color: 'var(--text-muted)', fontWeight: 400, textTransform: 'none' }}>
          {trimmed.length}
        </span>
      </div>
      {open && (
        <div
          style={{
            padding: '4px 12px 10px',
            fontSize: 12.5,
            lineHeight: 1.6,
            color: 'var(--text-secondary)',
            whiteSpace: 'pre-wrap',
            borderTop: '1px solid rgba(124, 92, 252, 0.15)',
            maxHeight: 280,
            overflowY: 'auto',
          }}
        >
          {thinking}
        </div>
      )}
    </div>
  );
};

export default MessageBubble;
