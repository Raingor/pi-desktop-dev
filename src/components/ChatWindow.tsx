import React, { useRef, useEffect, useState, useCallback } from 'react';
import { Button, Typography, Image, Tooltip, Select } from 'antd';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { useAppStore } from '../stores/appStore';
import { PlusIcon, SendIcon, StopIcon } from './icons';

const { Text } = Typography;

const ChatWindow: React.FC = () => {
  const {
    messages,
    isStreaming,
    inputValue,
    setInputValue,
    sendMessage,
    abortStream,
    newSession,
    piConnected,
    piMissing,
    loadingMessages,
    availableModels,
    currentModel,
    setModel,
  } = useAppStore();

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const dropRef = useRef<HTMLDivElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const [attachedImages, setAttachedImages] = useState<{ name: string; data: string }[]>([]);

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // ─── Drag & Drop File Handling ─────────────────────────────

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(false);

    const files = Array.from(e.dataTransfer.files);
    const imageFiles = files.filter((f) => f.type.startsWith('image/'));

    for (const file of imageFiles) {
      const reader = new FileReader();
      reader.onload = () => {
        const base64 = (reader.result as string).split(',')[1];
        setAttachedImages((prev) => [
          ...prev,
          { name: file.name, data: base64 },
        ]);
      };
      reader.readAsDataURL(file);
    }
  }, []);

  const removeImage = useCallback((name: string) => {
    setAttachedImages((prev) => prev.filter((img) => img.name !== name));
  }, []);

  const handleSend = () => {
    if (inputValue.trim() && !isStreaming) {
      const imgs = attachedImages.map((img) => img.data);
      sendMessage(inputValue, imgs.length > 0 ? imgs : undefined);
      setAttachedImages([]);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  // ─── Pi not found ──────────────────────────────────────────

  if (piMissing) {
    return (
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          height: '100%',
          padding: 40,
          textAlign: 'center',
        }}
      >
        <div style={{ fontSize: 48, marginBottom: 16, opacity: 0.5 }}>🤖</div>
        <Text strong style={{ fontSize: 20, marginBottom: 8, color: '#e0e0e0' }}>
          Pi-Agent Not Found
        </Text>
        <Text type="secondary" style={{ marginBottom: 24, maxWidth: 400 }}>
          Install Pi coding agent to get started.
        </Text>
        <Button
          type="primary"
          size="large"
          onClick={() => window.open('https://pi.dev/docs/latest/quickstart', '_blank')}
          style={{ background: '#007acc', borderColor: '#007acc' }}
        >
          Install Pi Agent
        </Button>
      </div>
    );
  }

  if (loadingMessages) {
    return (
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          height: '100%',
        }}
      >
        <Text style={{ color: '#888' }}>Loading messages...</Text>
      </div>
    );
  }

  // ─── Main Chat UI ──────────────────────────────────────────

  return (
    <div
      ref={dropRef}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        outline: dragOver ? '2px dashed #007acc' : 'none',
        outlineOffset: -2,
        transition: 'outline 0.15s',
      }}
    >
      {/* Header bar */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '6px 16px',
          borderBottom: '1px solid #2d2d2d',
          flexShrink: 0,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Tooltip title="New Session">
            <Button
              type="text"
              icon={<PlusIcon />}
              onClick={newSession}
              style={{ color: '#888', width: 28, height: 28, padding: 0 }}
            />
          </Tooltip>
          <span style={{ fontSize: 12, color: '#666', fontWeight: 500 }}>
            {messages.length > 0 ? `${messages.filter(m => m.role === 'user').length} prompts` : 'No messages'}
          </span>
        </div>

        {/* Model selector */}
        {availableModels.length > 0 && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ fontSize: 11, color: '#666' }}>Model:</span>
            <Select
              size="small"
              variant="borderless"
              value={currentModel?.modelId || availableModels[0]?.modelId}
              onChange={(mId) => {
                const m = availableModels.find((m) => m.modelId === mId);
                if (m) setModel(m.provider, m.modelId);
              }}
              style={{ minWidth: 120, color: '#ccc' }}
              popupMatchSelectWidth={false}
              options={availableModels.map((m) => ({
                value: m.modelId,
                label: m.label || m.modelId,
              }))}
            />
          </div>
        )}
      </div>

      {/* Messages */}
      <div
        style={{
          flex: 1,
          overflowY: 'auto',
          padding: '16px 0',
        }}
      >
        {messages.length === 0 ? (
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              height: '100%',
              color: '#555',
              padding: 40,
            }}
          >
            <div style={{ fontSize: 40, marginBottom: 12, opacity: 0.3 }}>💬</div>
            <Text style={{ fontSize: 16, color: '#777', marginBottom: 4 }}>
              Start a conversation
            </Text>
            <Text style={{ fontSize: 12, color: '#555' }}>
              Type a message to chat with Pi Agent
            </Text>
          </div>
        ) : (
          <div style={{ maxWidth: 760, margin: '0 auto', padding: '0 24px' }}>
            {messages.map((msg) => (
              <div
                key={msg.id}
                style={{
                  marginBottom: 16,
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: msg.role === 'user' ? 'flex-end' : 'flex-start',
                }}
              >
                {/* Role label */}
                <div
                  style={{
                    fontSize: 12,
                    color: msg.role === 'user' ? '#888' : '#569cd6',
                    marginBottom: 4,
                    marginLeft: msg.role === 'assistant' ? 4 : 0,
                    marginRight: msg.role === 'user' ? 4 : 0,
                    fontWeight: 600,
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                  }}
                >
                  <span style={{
                    fontSize: 10,
                    padding: '1px 6px',
                    borderRadius: 4,
                    background: msg.role === 'user' ? '#3c3c3c' : 'rgba(86,156,214,0.12)',
                    color: msg.role === 'user' ? '#aaa' : '#569cd6',
                  }}>
                    {msg.role === 'user' ? 'You' : msg.role === 'assistant' ? 'Pi' : msg.role}
                  </span>
                </div>

                {/* Message bubble */}
                <div
                  style={{
                    maxWidth: '85%',
                    padding: msg.role === 'user' ? '8px 14px' : '4px 4px',
                    borderRadius: msg.role === 'user' ? 12 : 4,
                    background: msg.role === 'user'
                      ? '#2b5278'
                      : 'transparent',
                    color: msg.role === 'user' ? '#e0e0e0' : '#d4d4d4',
                    lineHeight: 1.6,
                  }}
                >
                  {msg.role === 'assistant' ? (
                    <div className="markdown-content" style={{ color: '#d4d4d4' }}>
                      <ReactMarkdown
                        remarkPlugins={[remarkGfm]}
                        components={{
                          code: ({ className, children, ...props }: any) => {
                            const isInline = !className;
                            if (isInline) {
                              return (
                                <code
                                  style={{
                                    background: '#3c3c3c',
                                    padding: '1px 6px',
                                    borderRadius: 3,
                                    fontSize: '0.85em',
                                    color: '#ce9178',
                                  }}
                                  {...props}
                                >
                                  {children}
                                </code>
                              );
                            }
                            return (
                              <pre
                                style={{
                                  background: '#1e1e1e',
                                  border: '1px solid #2d2d2d',
                                  color: '#d4d4d4',
                                  padding: 12,
                                  borderRadius: 6,
                                  overflow: 'auto',
                                  fontSize: 13,
                                  margin: '8px 0',
                                }}
                              >
                                <code className={className} {...props}>
                                  {children}
                                </code>
                              </pre>
                            );
                          },
                          a: ({ href, children }: any) => (
                            <a
                              href={href}
                              style={{ color: '#569cd6' }}
                              target="_blank"
                              rel="noopener noreferrer"
                            >
                              {children}
                            </a>
                          ),
                          blockquote: ({ children }: any) => (
                            <blockquote
                              style={{
                                borderLeft: '3px solid #569cd6',
                                padding: '4px 12px',
                                margin: '8px 0',
                                color: '#888',
                                background: '#252526',
                                borderRadius: '0 4px 4px 0',
                              }}
                            >
                              {children}
                            </blockquote>
                          ),
                          table: ({ children }: any) => (
                            <div style={{ overflow: 'auto', margin: '8px 0' }}>
                              <table
                                style={{
                                  borderCollapse: 'collapse',
                                  width: '100%',
                                  fontSize: 13,
                                }}
                              >
                                {children}
                              </table>
                            </div>
                          ),
                          th: ({ children }: any) => (
                            <th
                              style={{
                                border: '1px solid #3c3c3c',
                                padding: '6px 10px',
                                background: '#2d2d2d',
                                fontWeight: 600,
                                textAlign: 'left',
                              }}
                            >
                              {children}
                            </th>
                          ),
                          td: ({ children }: any) => (
                            <td
                              style={{
                                border: '1px solid #3c3c3c',
                                padding: '6px 10px',
                              }}
                            >
                              {children}
                            </td>
                          ),
                        }}
                      >
                        {msg.content || (msg.isStreaming ? '' : '')}
                      </ReactMarkdown>
                      {msg.isStreaming && (
                        <span
                          style={{
                            display: 'inline-block',
                            width: 8,
                            height: 16,
                            background: '#569cd6',
                            marginLeft: 2,
                            animation: 'cursor-blink 1s step-end infinite',
                            verticalAlign: 'text-bottom',
                          }}
                        />
                      )}
                    </div>
                  ) : (
                    <span style={{ whiteSpace: 'pre-wrap', fontSize: 14 }}>
                      {msg.content}
                    </span>
                  )}
                </div>

                {/* Timestamp */}
                {msg.timestamp && (
                  <div
                    style={{
                      fontSize: 10,
                      color: '#555',
                      marginTop: 2,
                      marginLeft: msg.role === 'assistant' ? 6 : 0,
                      marginRight: msg.role === 'user' ? 6 : 0,
                    }}
                  >
                    {new Date(msg.timestamp).toLocaleTimeString(undefined, {
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input Area */}
      <div
        style={{
          padding: '8px 16px 12px',
          background: '#1e1e1e',
          borderTop: '1px solid #2d2d2d',
        }}
      >
        <div style={{ maxWidth: 760, margin: '0 auto', width: '100%' }}>
          {/* Attached images */}
          {attachedImages.length > 0 && (
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 6 }}>
              {attachedImages.map((img) => (
                <div
                  key={img.name}
                  style={{ position: 'relative', width: 40, height: 40 }}
                >
                  <Image
                    src={`data:image/png;base64,${img.data}`}
                    preview={false}
                    style={{ width: 40, height: 40, objectFit: 'cover', borderRadius: 4 }}
                  />
                  <Tooltip title={img.name}>
                    <div
                      onClick={() => removeImage(img.name)}
                      style={{
                        position: 'absolute',
                        top: -4,
                        right: -4,
                        width: 14,
                        height: 14,
                        borderRadius: '50%',
                        background: 'rgba(0,0,0,0.6)',
                        color: '#fff',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: 9,
                        cursor: 'pointer',
                      }}
                    >
                      ✕
                    </div>
                  </Tooltip>
                </div>
              ))}
            </div>
          )}

          <div
            style={{
              display: 'flex',
              gap: 8,
              alignItems: 'flex-end',
            }}
          >
            <div
              style={{
                flex: 1,
                display: 'flex',
                background: '#3c3c3c',
                borderRadius: 8,
                border: '1px solid #4a4a4a',
                transition: 'border-color 0.15s',
                alignItems: 'center',
              }}
            >
              <input
                ref={inputRef as React.Ref<any>}
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={dragOver ? 'Drop images...' : 'Type a message...'}
                disabled={isStreaming || !piConnected}
                style={{
                  flex: 1,
                  background: 'transparent',
                  border: 'none',
                  outline: 'none',
                  color: '#d4d4d4',
                  fontSize: 14,
                  padding: '10px 12px',
                  fontFamily: 'inherit',
                  resize: 'none',
                }}
              />
              {attachedImages.length > 0 && (
                <span style={{ padding: '0 8px', color: '#569cd6', fontSize: 11 }}>
                  {attachedImages.length} img
                </span>
              )}
            </div>

            {isStreaming ? (
              <Button
                danger
                icon={<StopIcon />}
                onClick={abortStream}
                style={{
                  height: 38,
                  width: 38,
                  padding: 0,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  background: '#3c3c3c',
                  border: '1px solid #ef4444',
                  color: '#ef4444',
                  borderRadius: 8,
                }}
              />
            ) : (
              <Button
                type="primary"
                icon={<SendIcon />}
                onClick={handleSend}
                disabled={!inputValue.trim() || !piConnected}
                style={{
                  height: 38,
                  width: 38,
                  padding: 0,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  background: inputValue.trim() && piConnected ? '#007acc' : '#3c3c3c',
                  border: 'none',
                  borderRadius: 8,
                  opacity: inputValue.trim() && piConnected ? 1 : 0.5,
                  cursor: inputValue.trim() && piConnected ? 'pointer' : 'not-allowed',
                }}
              />
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default ChatWindow;
