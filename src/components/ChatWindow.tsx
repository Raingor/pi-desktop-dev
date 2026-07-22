import React, { useRef, useEffect, useState, useCallback, useMemo } from 'react';
import { Button, Typography, Image, Tooltip, Dropdown, Tag } from 'antd';
import { DownOutlined, SettingOutlined, PaperClipOutlined, ThunderboltOutlined, ReloadOutlined, ExportOutlined, ImportOutlined, CloseOutlined, BulbOutlined, AimOutlined, CompressOutlined, EditOutlined } from '@ant-design/icons';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { useTranslation } from 'react-i18next';
import { useAppStore, InputMode } from '../stores/appStore';
import type { ThinkingLevel, SlashCommand, MentionItem } from '../types';
import { PlusIcon, SendIcon, StopIcon } from './icons';

const { Text } = Typography;

const MODE_LABELS: Record<InputMode, { color: string; key: string }> = {
  prompt: { color: 'var(--accent-teal)', key: 'chatWindow.modePrompt' },
  steer: { color: 'var(--accent-amber)', key: 'chatWindow.modeSteer' },
  follow_up: { color: 'var(--accent-purple)', key: 'chatWindow.modeFollowUp' },
};

const THINKING_LEVELS: ThinkingLevel[] = ['none', 'low', 'medium', 'high', 'max'];

const THINKING_LABEL_KEYS: Record<ThinkingLevel, string> = {
  none: 'chatWindow.thinkNone',
  low: 'chatWindow.thinkLow',
  medium: 'chatWindow.thinkMedium',
  high: 'chatWindow.thinkHigh',
  max: 'chatWindow.thinkMax',
};

// Built-in slash commands surfaced in the "/" popup.
const BUILTIN_SLASH_COMMANDS: SlashCommand[] = [
  { key: 'compact', label: '/compact', description: 'Compact context now', insertText: '/compact', category: 'action' },
  { key: 'clear', label: '/clear', description: 'Clear conversation', insertText: '/clear', category: 'action' },
  { key: 'export', label: '/export', description: 'Export conversation', insertText: '/export', category: 'action' },
  { key: 'prompt', label: '/prompt', description: 'Switch to Prompt mode', insertText: '/prompt ', category: 'mode' },
  { key: 'steer', label: '/steer', description: 'Switch to Steer mode', insertText: '/steer ', category: 'mode' },
  { key: 'followup', label: '/followup', description: 'Switch to Follow-up mode', insertText: '/followup ', category: 'mode' },
  { key: 'think-none', label: '/think none', description: 'Disable thinking', insertText: '/think none', category: 'context' },
  { key: 'think-high', label: '/think high', description: 'High reasoning effort', insertText: '/think high', category: 'context' },
];

// Color helper for context usage badge.
function contextColor(percent: number): string {
  if (percent >= 90) return 'var(--accent-danger)';
  if (percent >= 70) return 'var(--accent-amber)';
  return 'var(--accent-teal)';
}

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
    inputMode,
    setInputMode,
    retryInfo,
    queueState,
    compactionInfo,
    agentPhase,
    crashRecovery,
    dismissRetry,
    dismissCompaction,
    dismissCrashRecovery,
    triggerCompaction,
    exportHtml,
    exportMarkdown,
    exportJson,
    importJsonl,
    loadAvailableModels,
    contextUsage,
    thinkingLevel,
    setThinkingLevel,
    refreshContextUsage,
    optimizeInput,
    sessions,
  } = useAppStore();

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const dropRef = useRef<HTMLDivElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const [attachedImages, setAttachedImages] = useState<{ name: string; data: string }[]>([]);
  const [modelPickerOpen, setModelPickerOpen] = useState(false);

  // Slash-command ("/") and mention ("@") popup state.
  const [slashOpen, setSlashOpen] = useState(false);
  const [slashQuery, setSlashQuery] = useState('');
  const [slashIndex, setSlashIndex] = useState(0);
  const [mentionOpen, setMentionOpen] = useState(false);
  const [mentionQuery, setMentionQuery] = useState('');
  const [mentionIndex, setMentionIndex] = useState(0);

  // Auto-scroll on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Auto-resize textarea
  const resizeTextarea = useCallback(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = Math.min(el.scrollHeight, 220) + 'px';
  }, []);

  useEffect(() => {
    resizeTextarea();
  }, [inputValue, resizeTextarea]);

  useEffect(() => {
    textareaRef.current?.focus();
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

  // Refresh context usage when streaming ends or on new session.
  useEffect(() => {
    if (piConnected && !isStreaming) {
      refreshContextUsage();
    }
  }, [piConnected, isStreaming, messages.length, refreshContextUsage]);

  // ─── Drag & drop images ───────────────────────────────────
  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault(); e.stopPropagation(); setDragOver(true);
  }, []);
  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault(); e.stopPropagation(); setDragOver(false);
  }, []);
  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault(); e.stopPropagation(); setDragOver(false);
    const files = Array.from(e.dataTransfer.files);
    const imageFiles = files.filter((f) => f.type.startsWith('image/'));
    for (const file of imageFiles) {
      const reader = new FileReader();
      reader.onload = () => {
        const base64 = (reader.result as string).split(',')[1];
        setAttachedImages((prev) => [...prev, { name: file.name, data: base64 }]);
      };
      reader.readAsDataURL(file);
    }
  }, []);
  const removeImage = useCallback((name: string) => {
    setAttachedImages((prev) => prev.filter((img) => img.name !== name));
  }, []);

  // ─── Send / mode actions ──────────────────────────────────
  const handleSend = () => {
    if (inputValue.trim() && !isStreaming) {
      const imgs = attachedImages.map((img) => img.data);
      sendMessage(inputValue, imgs.length > 0 ? imgs : undefined);
      setAttachedImages([]);
      setSlashOpen(false);
      setMentionOpen(false);
    }
  };

  // Detect "/" or "@" trigger based on cursor position.
  const detectTrigger = useCallback((value: string, selStart: number) => {
    const before = value.slice(0, selStart);
    // Slash: "/" must be at start of input or preceded by whitespace.
    const slashMatch = before.match(/(?:^|\s)\/([\w-]*)$/);
    if (slashMatch) {
      setSlashOpen(true);
      setSlashQuery(slashMatch[1]);
      setSlashIndex(0);
      return;
    }
    setSlashOpen(false);
    // Mention: "@" must be at start or preceded by whitespace.
    const mentionMatch = before.match(/(?:^|\s)@([\w./-]*)$/);
    if (mentionMatch) {
      setMentionOpen(true);
      setMentionQuery(mentionMatch[1]);
      setMentionIndex(0);
      return;
    }
    setMentionOpen(false);
  }, []);

  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const v = e.target.value;
    setInputValue(v);
    detectTrigger(v, e.target.selectionStart ?? v.length);
  };

  // Filtered slash commands for the popup.
  const filteredSlashCommands = useMemo(() => {
    const q = slashQuery.toLowerCase();
    if (!q) return BUILTIN_SLASH_COMMANDS;
    return BUILTIN_SLASH_COMMANDS.filter(
      (c) => c.label.toLowerCase().includes(q) || c.key.toLowerCase().includes(q),
    );
  }, [slashQuery]);

  // Build mention candidates from models, sessions, and built-in categories.
  const mentionItems = useMemo<MentionItem[]>(() => {
    const items: MentionItem[] = [];
    // Models
    for (const m of availableModels.slice(0, 30)) {
      items.push({
        key: `model-${m.provider}-${m.modelId}`,
        label: `${m.label || m.modelId}`,
        description: `model · ${m.provider}`,
        type: 'model',
        insertText: `@model:${m.provider}/${m.modelId}`,
      });
    }
    // Sessions (recent 15)
    for (const s of sessions.slice(0, 15)) {
      const label = s.sessionName || s.id;
      items.push({
        key: `session-${s.path}`,
        label,
        description: 'session',
        type: 'session',
        insertText: `@session:${s.path}`,
      });
    }
    // Built-in pseudo items
    items.push({ key: 'mem-memory', label: 'memory', description: 'reference memory store', type: 'memory', insertText: '@memory:' });
    items.push({ key: 'mem-file', label: 'file', description: 'reference a file path', type: 'file', insertText: '@file:' });
    return items;
  }, [availableModels, sessions]);

  const filteredMentionItems = useMemo(() => {
    const q = mentionQuery.toLowerCase();
    if (!q) return mentionItems.slice(0, 12);
    return mentionItems.filter((m) => m.label.toLowerCase().includes(q)).slice(0, 12);
  }, [mentionItems, mentionQuery]);

  // Insert a slash command: replace the "/query" with the command's insertText.
  const applySlashCommand = (cmd: SlashCommand) => {
    const el = textareaRef.current;
    const start = el?.selectionStart ?? inputValue.length;
    const before = inputValue.slice(0, start);
    const after = inputValue.slice(start);
    const replaced = before.replace(/(?:^|\s)\/[\w-]*$/, (m) => {
      const prefix = m.startsWith('/') ? '' : m.charAt(0);
      return `${prefix}${cmd.insertText}`;
    });
    const next = replaced + after;
    setInputValue(next);
    setSlashOpen(false);
    // Place cursor right after inserted text.
    requestAnimationFrame(() => {
      const pos = replaced.length;
      el?.setSelectionRange(pos, pos);
      el?.focus();
    });
  };

  // Insert a mention: replace the "@query" with the mention's insertText.
  const applyMention = (item: MentionItem) => {
    const el = textareaRef.current;
    const start = el?.selectionStart ?? inputValue.length;
    const before = inputValue.slice(0, start);
    const after = inputValue.slice(start);
    const replaced = before.replace(/(?:^|\s)@[\w./-]*$/, (m) => {
      const prefix = m.startsWith('@') ? '' : m.charAt(0);
      return `${prefix}${item.insertText}`;
    });
    const next = replaced + (after.startsWith(' ') ? after : ` ${after}`);
    setInputValue(next);
    setMentionOpen(false);
    requestAnimationFrame(() => {
      const pos = replaced.length + 1;
      el?.setSelectionRange(pos, pos);
      el?.focus();
    });
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    // Slash popup navigation
    if (slashOpen && filteredSlashCommands.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSlashIndex((i) => (i + 1) % filteredSlashCommands.length);
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSlashIndex((i) => (i - 1 + filteredSlashCommands.length) % filteredSlashCommands.length);
        return;
      }
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        applySlashCommand(filteredSlashCommands[slashIndex]);
        return;
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        setSlashOpen(false);
        return;
      }
    }
    // Mention popup navigation
    if (mentionOpen && filteredMentionItems.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setMentionIndex((i) => (i + 1) % filteredMentionItems.length);
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setMentionIndex((i) => (i - 1 + filteredMentionItems.length) % filteredMentionItems.length);
        return;
      }
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        applyMention(filteredMentionItems[mentionIndex]);
        return;
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        setMentionOpen(false);
        return;
      }
    }
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      handleSend();
    }
  };

  // ─── Optimize input (client-side heuristics) ──────────────
  const optimizeMenu = useMemo(() => ({
    items: [
      { key: 'structure', icon: <CompressOutlined />, label: t('chatWindow.optStructure'), onClick: () => setInputValue(optimizeInput(inputValue, 'structure')) },
      { key: 'concise', icon: <AimOutlined />, label: t('chatWindow.optConcise'), onClick: () => setInputValue(optimizeInput(inputValue, 'concise')) },
      { key: 'detailed', icon: <EditOutlined />, label: t('chatWindow.optDetailed'), onClick: () => setInputValue(optimizeInput(inputValue, 'detailed')) },
      { key: 'fix', icon: <BulbOutlined />, label: t('chatWindow.optFix'), onClick: () => setInputValue(optimizeInput(inputValue, 'fix')) },
    ],
  }), [inputValue, optimizeInput, setInputValue, t]);

  // ─── Thinking level selector ──────────────────────────────
  const thinkingMenu = useMemo(() => ({
    items: THINKING_LEVELS.map((lvl) => ({
      key: lvl,
      label: (
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, minWidth: 140 }}>
          <span style={{ color: thinkingLevel === lvl ? 'var(--accent-teal)' : 'var(--text-secondary)', fontWeight: thinkingLevel === lvl ? 600 : 400 }}>
            {t(THINKING_LABEL_KEYS[lvl])}
          </span>
          {thinkingLevel === lvl && <span style={{ color: 'var(--accent-teal)', fontSize: 10 }}>●</span>}
        </div>
      ),
      onClick: () => setThinkingLevel(lvl),
    })),
  }), [thinkingLevel, setThinkingLevel, t]);

  // ─── Model picker (ZCode-style dropdown) ──────────────────
  const modelsByProvider = useMemo(() => {
    const map: Record<string, typeof availableModels> = {};
    for (const m of availableModels) {
      if (!map[m.provider]) map[m.provider] = [];
      map[m.provider].push(m);
    }
    return map;
  }, [availableModels]);

  const currentModelLabel = useMemo(() => {
    if (!availableModels.length) return t('chatWindow.noModel');
    const m = currentModel && availableModels.find((x) => x.provider === currentModel.provider && x.modelId === currentModel.modelId);
    return m?.label || m?.modelId || currentModel?.modelId || availableModels[0]?.label || availableModels[0]?.modelId || t('chatWindow.selectModel');
  }, [availableModels, currentModel, t]);

  const handlePickModel = (provider: string, modelId: string) => {
    setModel(provider, modelId);
    setModelPickerOpen(false);
  };

  const modelMenu = useMemo(() => {
    const providerEntries = Object.entries(modelsByProvider).map(([provider, models]) => ({
      key: `provider-${provider}`,
      type: 'group' as const,
      label: <span style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px', fontWeight: 600 }}>{provider}</span>,
      children: models.map((m) => ({
        key: `${m.provider}::${m.modelId}`,
        label: (
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
            <span style={{ color: currentModel?.provider === m.provider && currentModel?.modelId === m.modelId ? 'var(--accent-teal)' : 'var(--text-secondary)', fontWeight: currentModel?.provider === m.provider && currentModel?.modelId === m.modelId ? 600 : 400 }}>
              {m.label || m.modelId}
            </span>
            {currentModel?.provider === m.provider && currentModel?.modelId === m.modelId && (
              <span style={{ color: 'var(--accent-teal)', fontSize: 10 }}>●</span>
            )}
          </div>
        ),
        onClick: () => handlePickModel(m.provider, m.modelId),
      })),
    }));
    // Footer entry: Manage Models
    providerEntries.push({
      key: '__manage__',
      type: 'group' as const,
      label: <span style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px', fontWeight: 600 }}>·</span>,
      children: [{
        key: '__manage_action__',
        label: (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--accent-teal)', fontWeight: 500 }}>
            <SettingOutlined style={{ fontSize: 11 }} />
            <span>{t('chatWindow.manageModels')}</span>
          </div>
        ),
        onClick: () => {
          setModelPickerOpen(false);
          useAppStore.getState().toggleSettings();
        },
      }],
    });
    return { items: providerEntries };
  }, [modelsByProvider, currentModel, t]);

  // ─── Export menu ──────────────────────────────────────────
  const handleExport = async (format: 'html' | 'markdown' | 'json') => {
    try {
      if (format === 'html') await exportHtml();
      else if (format === 'markdown') await exportMarkdown();
      else await exportJson();
    } catch (e) {
      console.error('Export failed:', e);
    }
  };

  const handleImportClick = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.jsonl,application/jsonl';
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return;
      // Web environment cannot expose the file path; we pass the file name and let
      // the Rust side handle it via the import_jsonl command (which copies from a known path).
      // For drag-and-drop imports the path will be empty; the user should use the OS file picker
      // exposed via the Rust side for true path resolution. As a fallback, we just emit a refresh.
      try {
        await importJsonl(file.name);
      } catch (e) {
        console.error('Import failed:', e);
      }
    };
    input.click();
  };

  const exportMenu = {
    items: [
      { key: 'html', label: 'HTML', onClick: () => handleExport('html') },
      { key: 'markdown', label: 'Markdown', onClick: () => handleExport('markdown') },
      { key: 'json', label: 'JSON', onClick: () => handleExport('json') },
      { type: 'divider' as const },
      { key: 'import', label: <span><ImportOutlined /> {t('chatWindow.importJsonl')}</span>, onClick: handleImportClick },
    ],
  };

  // ─── Empty / loading states ───────────────────────────────
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
          {agentPhase !== 'idle' && isStreaming && (
            <Tag color="processing" style={{ marginLeft: 4, fontSize: 10, padding: '1px 8px', borderRadius: 4, textTransform: 'capitalize' }}>
              {agentPhase === 'thinking' ? '· thinking' : agentPhase === 'acting' ? '· acting' : '· observing'}
            </Tag>
          )}
          {queueState && queueState.total > 0 && (
            <Tooltip title={`Active: ${queueState.active} · Pending: ${queueState.pending}`}>
              <Tag color="blue" style={{ marginLeft: 4, fontSize: 10, padding: '1px 8px', borderRadius: 4 }}>
                queue: {queueState.active}/{queueState.total}
              </Tag>
            </Tooltip>
          )}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <Tooltip title={t('chatWindow.compact')}>
            <Button type="text" size="small" icon={<ThunderboltOutlined />} onClick={triggerCompaction} disabled={isStreaming}
              style={{ color: 'var(--text-muted)', borderRadius: 6, width: 28, height: 28 }} />
          </Tooltip>
          <Dropdown menu={exportMenu} trigger={['click']}>
            <Tooltip title={t('chatWindow.export')}>
              <Button type="text" size="small" icon={<ExportOutlined />} style={{ color: 'var(--text-muted)', borderRadius: 6, width: 28, height: 28 }} />
            </Tooltip>
          </Dropdown>
        </div>
      </div>

      {/* Compaction banner */}
      {compactionInfo?.visible && (
        <div style={{
          padding: '6px 16px', background: compactionInfo.phase === 'failed' ? 'var(--accent-danger-dim)' : 'var(--accent-purple-dim)',
          borderBottom: `1px solid ${compactionInfo.phase === 'failed' ? 'rgba(255,107,107,0.3)' : 'rgba(124,92,252,0.3)'}`,
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 12, color: 'var(--text-secondary)',
        }}>
          <span>
            {compactionInfo.phase === 'progress' && compactionInfo.progress != null
              ? `${compactionInfo.message || ''} ${Math.round(compactionInfo.progress * 100)}%`
              : compactionInfo.message}
          </span>
          {compactionInfo.phase !== 'progress' && compactionInfo.phase !== 'started' && (
            <Button type="text" size="small" icon={<CloseOutlined />} onClick={dismissCompaction} style={{ color: 'var(--text-muted)', padding: 0, height: 16 }} />
          )}
        </div>
      )}

      {/* Retry banner */}
      {retryInfo?.visible && (
        <div style={{
          padding: '6px 16px', background: 'var(--accent-amber)' + '20',
          borderBottom: '1px solid rgba(255,184,77,0.3)',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 12, color: 'var(--accent-amber)',
        }}>
          <span>
            ⚠ {t('chatWindow.autoRetry', { attempt: retryInfo.attempt, max: retryInfo.maxAttempts || '?' })}
            {retryInfo.reason ? ` — ${retryInfo.reason}` : ''}
          </span>
          <Button type="text" size="small" icon={<CloseOutlined />} onClick={dismissRetry} style={{ color: 'var(--text-muted)', padding: 0, height: 16 }} />
        </div>
      )}

      {/* Crash recovery banner */}
      {crashRecovery?.visible && (
        <div style={{
          padding: '8px 16px', background: 'var(--accent-danger-dim)',
          borderBottom: '1px solid rgba(255,107,107,0.3)',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 12, color: 'var(--accent-danger)',
        }}>
          <span>
            ⚡ {t('chatWindow.crashRecovery', { attempt: crashRecovery.restartAttempt })}
            {crashRecovery.reason ? ` — ${crashRecovery.reason}` : ''}
          </span>
          <Button type="text" size="small" icon={<CloseOutlined />} onClick={dismissCrashRecovery} style={{ color: 'var(--text-muted)', padding: 0, height: 16 }} />
        </div>
      )}

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
            {messages.map((msg) => {
              const mode = msg.metadata?.mode as InputMode | undefined;
              const modeLabel = mode ? MODE_LABELS[mode] : null;
              return (
                <div key={msg.id} className={`message-bubble ${msg.role}`} style={{ marginBottom: 20, display: 'flex', flexDirection: 'column', alignItems: msg.role === 'user' ? 'flex-end' : 'flex-start' }}>
                  <div style={{ fontSize: 11, color: msg.role === 'user' ? 'var(--text-muted)' : 'var(--accent-teal)', marginBottom: 6, marginLeft: msg.role === 'assistant' ? 4 : 0, marginRight: msg.role === 'user' ? 4 : 0, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                    <span style={{ fontSize: 10, padding: '2px 10px', borderRadius: 4, background: msg.role === 'user' ? 'var(--bg-surface)' : 'var(--accent-teal-dim)', color: msg.role === 'user' ? 'var(--text-secondary)' : 'var(--accent-teal)', border: msg.role === 'user' ? '1px solid var(--border-color)' : '1px solid rgba(0,212,170,0.2)' }}>
                      {msg.role === 'user' ? t('chatWindow.you') : msg.role === 'assistant' ? t('chatWindow.pi') : msg.role}
                    </span>
                    {modeLabel && mode !== 'prompt' && (
                      <span style={{ fontSize: 9, padding: '1px 6px', borderRadius: 3, background: modeLabel.color + '20', color: modeLabel.color, border: `1px solid ${modeLabel.color}40`, textTransform: 'none', letterSpacing: 0 }}>
                        {t(modeLabel.key)}
                      </span>
                    )}
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
              );
            })}
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* ─── ZCode-style input area ─────────────────────────── */}
      <div style={{ padding: '12px 16px 16px', background: 'var(--bg-primary)', borderTop: '1px solid var(--border-color)' }}>
        <div style={{ maxWidth: 760, margin: '0 auto', width: '100%' }}>

          {/* Attached images preview */}
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

          {/* Input box: rounded card with textarea + bottom toolbar */}
          <div
            style={{
              position: 'relative',
              background: 'var(--bg-secondary)',
              borderRadius: 14,
              border: `1px solid ${isStreaming ? 'var(--accent-teal)' : 'var(--border-color)'}`,
              boxShadow: isStreaming ? '0 0 0 1px var(--accent-teal-glow), 0 0 16px rgba(0,212,170,0.08)' : 'none',
              transition: 'border-color 0.2s, box-shadow 0.2s',
              overflow: 'visible',
            }}
          >
            {/* Slash-command popup */}
            {slashOpen && filteredSlashCommands.length > 0 && (
              <div style={{
                position: 'absolute', bottom: '100%', left: 12, marginBottom: 6,
                background: 'var(--bg-secondary)', border: '1px solid var(--border-color)',
                borderRadius: 8, boxShadow: '0 8px 24px rgba(0,0,0,0.3)', padding: 4,
                minWidth: 240, maxHeight: 240, overflowY: 'auto', zIndex: 50,
              }}>
                <div style={{ fontSize: 10, color: 'var(--text-muted)', padding: '4px 8px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                  {t('chatWindow.slashTitle')}
                </div>
                {filteredSlashCommands.map((cmd, i) => (
                  <div
                    key={cmd.key}
                    onClick={() => applySlashCommand(cmd)}
                    onMouseEnter={() => setSlashIndex(i)}
                    style={{
                      padding: '6px 10px', borderRadius: 6, cursor: 'pointer',
                      background: i === slashIndex ? 'var(--accent-teal-dim)' : 'transparent',
                      display: 'flex', flexDirection: 'column', gap: 2,
                    }}
                  >
                    <span style={{ fontSize: 12, color: i === slashIndex ? 'var(--accent-teal)' : 'var(--text-secondary)', fontWeight: 500 }}>{cmd.label}</span>
                    <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>{cmd.description}</span>
                  </div>
                ))}
              </div>
            )}

            {/* Mention popup */}
            {mentionOpen && filteredMentionItems.length > 0 && (
              <div style={{
                position: 'absolute', bottom: '100%', left: 12, marginBottom: 6,
                background: 'var(--bg-secondary)', border: '1px solid var(--border-color)',
                borderRadius: 8, boxShadow: '0 8px 24px rgba(0,0,0,0.3)', padding: 4,
                minWidth: 260, maxHeight: 240, overflowY: 'auto', zIndex: 50,
              }}>
                <div style={{ fontSize: 10, color: 'var(--text-muted)', padding: '4px 8px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                  {t('chatWindow.mentionTitle')}
                </div>
                {filteredMentionItems.map((item, i) => (
                  <div
                    key={item.key}
                    onClick={() => applyMention(item)}
                    onMouseEnter={() => setMentionIndex(i)}
                    style={{
                      padding: '6px 10px', borderRadius: 6, cursor: 'pointer',
                      background: i === mentionIndex ? 'var(--accent-teal-dim)' : 'transparent',
                      display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8,
                    }}
                  >
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 1, minWidth: 0 }}>
                      <span style={{ fontSize: 12, color: i === mentionIndex ? 'var(--accent-teal)' : 'var(--text-secondary)', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {item.label}
                      </span>
                      {item.description && <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>{item.description}</span>}
                    </div>
                    <Tag style={{ fontSize: 9, padding: '0 6px', margin: 0, borderRadius: 4, background: 'var(--bg-surface)', color: 'var(--text-muted)', border: '1px solid var(--border-color)' }}>{item.type}</Tag>
                  </div>
                ))}
              </div>
            )}

            {/* Textarea (multi-line, ZCode-style) */}
            <textarea
              ref={textareaRef}
              value={inputValue}
              onChange={handleInputChange}
              onKeyDown={handleKeyDown}
              placeholder={dragOver ? t('chatWindow.dropImages') : (
                inputMode === 'steer' ? t('chatWindow.inputPlaceholderSteer') :
                inputMode === 'follow_up' ? t('chatWindow.inputPlaceholderFollowUp') :
                t('chatWindow.inputPlaceholder')
              )}
              disabled={isStreaming || !piConnected}
              rows={1}
              style={{
                width: '100%',
                background: 'transparent',
                border: 'none',
                outline: 'none',
                color: 'var(--text-primary)',
                fontSize: 14,
                lineHeight: 1.5,
                padding: '12px 14px 4px',
                fontFamily: 'inherit',
                resize: 'none',
                minHeight: 44,
                maxHeight: 220,
                overflowY: 'auto',
              }}
            />

            {/* Bottom toolbar: model selector | thinking | mode | spacer | context | optimize | attach | send */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 8px 6px 10px' }}>
              {/* Model selector (ZCode-style: shows current model name + dropdown arrow) */}
              <Dropdown
                menu={modelMenu}
                trigger={['click']}
                open={modelPickerOpen}
                onOpenChange={setModelPickerOpen}
                disabled={availableModels.length === 0}
              >
                <Button
                  type="text"
                  size="small"
                  disabled={availableModels.length === 0}
                  style={{
                    color: 'var(--accent-teal)',
                    fontWeight: 500,
                    fontSize: 12,
                    padding: '2px 8px',
                    height: 26,
                    borderRadius: 6,
                    display: 'flex',
                    alignItems: 'center',
                    gap: 4,
                    maxWidth: 200,
                  }}
                >
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {availableModels.length === 0 ? t('chatWindow.noModel') : currentModelLabel}
                  </span>
                  <DownOutlined style={{ fontSize: 9, opacity: 0.6 }} />
                </Button>
              </Dropdown>

              {/* Refresh models button (subtle) */}
              {availableModels.length === 0 && (
                <Tooltip title={t('common.refresh')}>
                  <Button type="text" size="small" icon={<ReloadOutlined />} onClick={loadAvailableModels} style={{ color: 'var(--text-muted)', width: 22, height: 22, padding: 0 }} />
                </Tooltip>
              )}

              {/* Thinking level selector */}
              <Dropdown menu={thinkingMenu} trigger={['click']}>
                <Tooltip title={t('chatWindow.thinkTooltip')}>
                  <Button
                    type="text"
                    size="small"
                    style={{
                      color: thinkingLevel === 'none' ? 'var(--text-muted)' : 'var(--accent-purple)',
                      fontSize: 11,
                      padding: '2px 8px',
                      height: 26,
                      borderRadius: 6,
                      background: thinkingLevel === 'none' ? 'transparent' : 'rgba(124,92,252,0.12)',
                      border: thinkingLevel === 'none' ? '1px solid var(--border-color)' : '1px solid rgba(124,92,252,0.3)',
                      fontWeight: 500,
                      display: 'flex',
                      alignItems: 'center',
                      gap: 4,
                    }}
                  >
                    <ThunderboltOutlined style={{ fontSize: 10 }} />
                    <span>{t(THINKING_LABEL_KEYS[thinkingLevel])}</span>
                    <DownOutlined style={{ fontSize: 9, opacity: 0.6 }} />
                  </Button>
                </Tooltip>
              </Dropdown>

              {/* Mode toggle: prompt → steer → follow_up → prompt */}
              <Tooltip title={t('chatWindow.modeTooltip')}>
                <Button
                  type="text"
                  size="small"
                  onClick={() => {
                    const order: InputMode[] = ['prompt', 'steer', 'follow_up'];
                    const idx = order.indexOf(inputMode);
                    setInputMode(order[(idx + 1) % order.length]);
                  }}
                  style={{
                    color: MODE_LABELS[inputMode].color,
                    fontSize: 11,
                    padding: '2px 8px',
                    height: 26,
                    borderRadius: 6,
                    background: MODE_LABELS[inputMode].color + '15',
                    border: `1px solid ${MODE_LABELS[inputMode].color}30`,
                    fontWeight: 500,
                  }}
                >
                  {t(MODE_LABELS[inputMode].key)}
                </Button>
              </Tooltip>

              {/* Spacer */}
              <div style={{ flex: 1 }} />

              {/* Context usage indicator */}
              {contextUsage && contextUsage.contextWindow > 0 && (
                <Tooltip title={t('chatWindow.contextTooltip', { used: contextUsage.usedTokens, window: contextUsage.contextWindow })}>
                  <div style={{
                    display: 'flex', alignItems: 'center', gap: 5, padding: '2px 8px',
                    height: 22, borderRadius: 11, fontSize: 10, fontWeight: 600,
                    background: contextColor(contextUsage.percent) + '18',
                    color: contextColor(contextUsage.percent),
                    border: `1px solid ${contextColor(contextUsage.percent)}40`,
                    cursor: 'pointer',
                  }} onClick={() => refreshContextUsage()}>
                    <div style={{
                      width: 22, height: 4, borderRadius: 2, background: 'var(--bg-surface)', overflow: 'hidden', position: 'relative',
                    }}>
                      <div style={{
                        width: `${Math.min(100, contextUsage.percent)}%`, height: '100%',
                        background: contextColor(contextUsage.percent), transition: 'width 0.3s ease',
                      }} />
                    </div>
                    <span>{contextUsage.percent}%</span>
                  </div>
                </Tooltip>
              )}

              {/* Optimize input dropdown */}
              <Dropdown menu={optimizeMenu} trigger={['click']} disabled={!inputValue.trim()}>
                <Tooltip title={t('chatWindow.optimize')}>
                  <Button
                    type="text"
                    size="small"
                    disabled={!inputValue.trim()}
                    icon={<BulbOutlined />}
                    style={{ color: inputValue.trim() ? 'var(--accent-amber)' : 'var(--text-muted)', width: 28, height: 28, padding: 0, borderRadius: 6 }}
                  />
                </Tooltip>
              </Dropdown>

              {/* Attach images (file picker fallback for non-drag users) */}
              <Tooltip title={t('chatWindow.attachImage')}>
                <Button
                  type="text"
                  size="small"
                  icon={<PaperClipOutlined />}
                  onClick={() => {
                    const input = document.createElement('input');
                    input.type = 'file';
                    input.accept = 'image/*';
                    input.multiple = true;
                    input.onchange = () => {
                      const files = Array.from(input.files || []);
                      for (const file of files) {
                        const reader = new FileReader();
                        reader.onload = () => {
                          const base64 = (reader.result as string).split(',')[1];
                          setAttachedImages((prev) => [...prev, { name: file.name, data: base64 }]);
                        };
                        reader.readAsDataURL(file);
                      }
                    };
                    input.click();
                  }}
                  style={{ color: 'var(--text-muted)', width: 28, height: 28, padding: 0, borderRadius: 6 }}
                />
              </Tooltip>

              {/* Send / Stop button */}
              {isStreaming ? (
                <Button danger icon={<StopIcon />} onClick={abortStream}
                  style={{ height: 30, width: 30, padding: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--accent-danger-dim)', border: '1px solid rgba(255,107,107,0.3)', color: 'var(--accent-danger)', borderRadius: 8 }} />
              ) : (
                <Button type="primary" icon={<SendIcon />} onClick={handleSend} disabled={!inputValue.trim() || !piConnected}
                  style={{ height: 30, width: 30, padding: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
                    background: inputValue.trim() && piConnected ? 'linear-gradient(135deg, var(--accent-teal), #00b892)' : 'var(--bg-surface)',
                    border: inputValue.trim() && piConnected ? 'none' : '1px solid var(--border-color)', borderRadius: 8,
                    opacity: inputValue.trim() && piConnected ? 1 : 0.5, cursor: inputValue.trim() && piConnected ? 'pointer' : 'not-allowed',
                    boxShadow: inputValue.trim() && piConnected ? '0 0 16px rgba(0,212,170,0.2)' : 'none' }} />
              )}
            </div>
          </div>

          {/* Helper line */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 6, padding: '0 4px', fontSize: 10, color: 'var(--text-muted)' }}>
            <span>
              <kbd style={{ background: 'var(--bg-surface)', padding: '1px 5px', borderRadius: 3, border: '1px solid var(--border-color)', fontSize: 9 }}>Enter</kbd> {t('chatWindow.send')} ·{' '}
              <kbd style={{ background: 'var(--bg-surface)', padding: '1px 5px', borderRadius: 3, border: '1px solid var(--border-color)', fontSize: 9 }}>Shift+Enter</kbd> {t('chatWindow.newline')}
            </span>
            <span>
              {currentModel ? `${currentModel.provider}/${currentModel.modelId}` : ''}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ChatWindow;
