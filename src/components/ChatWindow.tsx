import React, { useRef, useEffect, useState, useCallback } from 'react';
import { Button, Typography, Image, Tooltip, Select } from 'antd';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { useTranslation } from 'react-i18next';
import { useAppStore } from '../stores/appStore';
import { PlusIcon, SendIcon, StopIcon } from './icons';

const { Text } = Typography;

const ChatWindow: React.FC = () => {
  const { t } = useTranslation();
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

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // Retry loading models if empty
  useEffect(() => {
    if (piConnected && availableModels.length === 0) {
      const timer = setTimeout(() => {
        useAppStore.getState().loadAvailableModels();
      }, 3000);
      return () => clearTimeout(timer);
    }
  }, [piConnected, availableModels.length]);

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

  if (piMissing) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', padding: 40, textAlign: 'center' }}>
        <div style={{ width: 80, height: 80, borderRadius: 24, background: 'linear-gradient(135deg, rgba(0,212,170,0.15), rgba(124,92,252,0.15))', border: '1px solid rgba(0,212,170,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 20, fontSize: 36 }}>🤖</div>
        <Text strong style={{ fontSize: 22, marginBottom: 8, color: 'var(--text-primary)' }}>{t('chatWindow.piNotFound')}</Text>
        <Text style={{ color: 'var(--text-muted)', marginBottom: 28, maxWidth: 400, fontSize: 14 }}>{t('chatWindow.installDesc')}</Text>
        <Button type="primary" size="large" onClick={() => window.open('https://pi.dev/docs/latest/quickstart', '_blank')}
          style={{ background: 'var(--accent-teal)', borderColor: 'var(--accent-teal)', color: '#0a0a0f', fontWeight: 600, height: 42, padding: '0 28px', fontSize: 14, borderRadius: 10, boxShadow: '0 0 20px rgba(0,212,170,0.2)' }}>{t('chatWindow.installBtn')}</Button>
      </div>
    );
  }

  if (loadingMessages) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ width: 32, height: 32, border: '2px solid var(--border-color)', borderTopColor: 'var(--accent-teal)', borderRadius: '50%', animation: 'spin 0.8s linear infinite', margin: '0 auto 12px' }} />
          <Text style={{ color: 'var(--text-muted)', fontSize: 13 }}>{t('chatWindow.loadingMessages')}</Text>
        </div>
      </div>
    );
  }

  return (
    <div ref={dropRef} onDragOver={handleDragOver} onDragLeave={handleDragLeave} onDrop={handleDrop}
      style={{ display: 'flex', flexDirection: 'column', height: '100%', outline: dragOver ? '2px dashed var(--accent-teal)' : 'none', outlineOffset: -2, transition: 'outline 0.2s' }}>
      {/* Header bar */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 16px', borderBottom: '1px solid var(--border-color)', flexShrink: 0, background: 'var(--bg-secondary)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Tooltip title={t('chatWindow.newSession')}>
            <Button type="text" icon={<PlusIcon />} onClick={newSession} style={{ color: 'var(--text-muted)', width: 30, height: 30, padding: 0, borderRadius: 8 }} />
          </Tooltip>
          <span style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 500, padding: '2px 10px', borderRadius: 4, background: 'var(--bg-surface)', border: '1px solid var(--border-color)' }}>
            {messages.length > 0 ? t('common.prompts', { count: messages.filter(m => m.role === 'user').length }) : t('common.noMessages')}
          </span>
        </div>
      </div>

      {/* Messages */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '20px 0' }}>
        {messages.length === 0 ? (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', padding: 40 }}>
            <div style={{ width: 64, height: 64, borderRadius: 20, background: 'linear-gradient(135deg, rgba(0,212,170,0.1), rgba(124,92,252,0.1))', border: '1px solid var(--border-color)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 16, fontSize: 28 }}>💬</div>
            <Text style={{ fontSize: 16, color: 'var(--text-secondary)', marginBottom: 4, fontWeight: 500 }}>{t('chatWindow.startConversation')}</Text>
            <Text style={{ fontSize: 13, color: 'var(--text-muted)' }}>{t('chatWindow.startDesc')}</Text>
          </div>
        ) : (
          <div style={{ maxWidth: 760, margin: '0 auto', padding: '0 24px' }}>
            {messages.map((msg) => (
              <div key={msg.id} className={`message-bubble ${msg.role}`} style={{ marginBottom: 20, display: 'flex', flexDirection: 'column', alignItems: msg.role === 'user' ? 'flex-end' : 'flex-start' }}>
                <div style={{ fontSize: 11, color: msg.role === 'user' ? 'var(--text-muted)' : 'var(--accent-teal)', marginBottom: 6, marginLeft: msg.role === 'assistant' ? 4 : 0, marginRight: msg.role === 'user' ? 4 : 0, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                  <span style={{ fontSize: 10, padding: '2px 10px', borderRadius: 4, background: msg.role === 'user' ? 'var(--bg-surface)' : 'var(--accent-teal-dim)', color: msg.role === 'user' ? 'var(--text-secondary)' : 'var(--accent-teal)', border: msg.role === 'user' ? '1px solid var(--border-color)' : '1px solid rgba(0,212,170,0.2)' }}>
                    {msg.role === 'user' ? t('chatWindow.you') : msg.role === 'assistant' ? t('chatWindow.pi') : msg.role}
                  </span>
                </div>
                <div style={{ maxWidth: '85%', padding: msg.role === 'user' ? '10px 16px' : '6px 6px', borderRadius: msg.role === 'user' ? '14px 14px 4px 14px' : 4, background: msg.role === 'user' ? 'linear-gradient(135deg, rgba(0,212,170,0.12), rgba(0,212,170,0.06))' : 'transparent', border: msg.role === 'user' ? '1px solid rgba(0,212,170,0.15)' : 'none', color: 'var(--text-primary)', lineHeight: 1.7, position: 'relative' }}>
                  {msg.role === 'assistant' ? (
                    <div className="markdown-content">
                      <ReactMarkdown remarkPlugins={[remarkGfm]} components={{
                        code: ({ className, children, ...props }: any) => {
                          const isInline = !className;
                          if (isInline) return <code style={{ background: 'var(--bg-surface)', padding: '2px 8px', borderRadius: 4, fontSize: '0.85em', color: 'var(--accent-teal)', border: '1px solid var(--border-color)' }} {...props}>{children}</code>;
                          return <pre style={{ background: 'var(--bg-primary)', border: '1px solid var(--border-color)', color: 'var(--text-primary)', padding: 14, borderRadius: 'var(--radius-md)', overflow: 'auto', fontSize: 13, margin: '10px 0', position: 'relative' }}><code className={className} {...props}>{children}</code></pre>;
                        },
                        a: ({ href, children }: any) => <a href={href} style={{ color: 'var(--accent-teal)' }} target="_blank" rel="noopener noreferrer">{children}</a>,
                        blockquote: ({ children }: any) => <blockquote style={{ borderLeft: '3px solid var(--accent-teal)', padding: '8px 16px', margin: '10px 0', color: 'var(--text-secondary)', background: 'var(--bg-secondary)', borderRadius: '0 var(--radius-sm) var(--radius-sm) 0' }}>{children}</blockquote>,
                      }}>
                        {msg.content || (msg.isStreaming ? '' : '')}
                      </ReactMarkdown>
                      {msg.isStreaming && <span style={{ display: 'inline-block', width: 8, height: 16, background: 'var(--accent-teal)', marginLeft: 2, animation: 'cursor-blink 1s step-end infinite', verticalAlign: 'text-bottom', borderRadius: 1 }} />}
                    </div>
                  ) : (
                    <span style={{ whiteSpace: 'pre-wrap', fontSize: 14, color: 'var(--text-primary)', opacity: 0.9 }}>{msg.content}</span>
                  )}
                </div>
                {msg.timestamp && (
                  <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 4, marginLeft: msg.role === 'assistant' ? 8 : 0, marginRight: msg.role === 'user' ? 8 : 0 }}>
                    {new Date(msg.timestamp).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input Area */}
      <div style={{ padding: '12px 16px 16px', background: 'var(--bg-primary)', borderTop: '1px solid var(--border-color)' }}>
        <div style={{ maxWidth: 760, margin: '0 auto', width: '100%' }}>
          {attachedImages.length > 0 && (
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 10, padding: '8px 12px', background: 'var(--bg-secondary)', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-color)' }}>
              {attachedImages.map((img) => (
                <div key={img.name} style={{ position: 'relative', width: 44, height: 44 }}>
                  <Image src={`data:image/png;base64,${img.data}`} preview={false} style={{ width: 44, height: 44, objectFit: 'cover', borderRadius: 8, border: '1px solid var(--border-color)' }} />
                  <Tooltip title={img.name}>
                    <div onClick={() => removeImage(img.name)} style={{ position: 'absolute', top: -5, right: -5, width: 16, height: 16, borderRadius: '50%', background: 'rgba(0,0,0,0.7)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 9, cursor: 'pointer', border: '2px solid var(--bg-secondary)' }}>✕</div>
                  </Tooltip>
                </div>
              ))}
            </div>
          )}

          <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
            <div style={{ flex: 1, display: 'flex', background: 'var(--bg-secondary)', borderRadius: 12, border: '1px solid var(--border-color)', transition: 'border-color 0.2s, box-shadow 0.2s', alignItems: 'center', boxShadow: isStreaming ? '0 0 0 1px var(--accent-teal-glow), 0 0 16px rgba(0,212,170,0.08)' : 'none' }}>
              {/* Model selector on the left */}
              {availableModels.length > 0 && (
                <>
                  <Select
                    size="small"
                    variant="borderless"
                    value={currentModel?.modelId || availableModels[0]?.modelId}
                    onChange={(mId) => {
                      const m = availableModels.find((m) => m.modelId === mId);
                      if (m) setModel(m.provider, m.modelId);
                    }}
                    style={{ minWidth: 90, maxWidth: 140, color: 'var(--accent-teal)', marginLeft: 6, flexShrink: 0 }}
                    popupMatchSelectWidth={false}
                    options={availableModels.map((m) => ({ value: m.modelId, label: m.label || m.modelId }))}
                  />
                  <div style={{ width: 1, height: 20, background: 'var(--border-color)', flexShrink: 0, marginRight: 4 }} />
                </>
              )}
              <input ref={inputRef as React.Ref<any>} value={inputValue} onChange={(e) => setInputValue(e.target.value)} onKeyDown={handleKeyDown}
                placeholder={dragOver ? t('chatWindow.dropImages') : t('chatWindow.inputPlaceholder')} disabled={isStreaming || !piConnected}
                style={{ flex: 1, background: 'transparent', border: 'none', outline: 'none', color: 'var(--text-primary)', fontSize: 14, padding: '12px 14px', fontFamily: 'inherit', resize: 'none' }} />
              {attachedImages.length > 0 && (
                <span style={{ padding: '0 12px', color: 'var(--accent-teal)', fontSize: 11, fontWeight: 500 }}>{t('chatWindow.imageCount', { count: attachedImages.length })}</span>
              )}
            </div>

            {isStreaming ? (
              <Button danger icon={<StopIcon />} onClick={abortStream}
                style={{ height: 42, width: 42, padding: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--accent-danger-dim)', border: '1px solid rgba(255,107,107,0.3)', color: 'var(--accent-danger)', borderRadius: 12 }} />
            ) : (
              <Button type="primary" icon={<SendIcon />} onClick={handleSend} disabled={!inputValue.trim() || !piConnected}
                style={{ height: 42, width: 42, padding: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
                  background: inputValue.trim() && piConnected ? 'linear-gradient(135deg, var(--accent-teal), #00b892)' : 'var(--bg-surface)',
                  border: inputValue.trim() && piConnected ? 'none' : '1px solid var(--border-color)', borderRadius: 12,
                  opacity: inputValue.trim() && piConnected ? 1 : 0.5, cursor: inputValue.trim() && piConnected ? 'pointer' : 'not-allowed',
                  boxShadow: inputValue.trim() && piConnected ? '0 0 20px rgba(0,212,170,0.2)' : 'none' }} />
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default ChatWindow;