import React, { useRef, useEffect, useState, useCallback, useMemo } from 'react';
import { Button, Typography, Image, Tooltip, Dropdown, Tag, Modal, message } from 'antd';
import { DownOutlined, SettingOutlined, PaperClipOutlined, ThunderboltOutlined, ReloadOutlined, ExportOutlined, ImportOutlined, CloseOutlined, BulbOutlined, AimOutlined, CompressOutlined, EditOutlined, CheckOutlined, FolderOutlined, FileOutlined, FolderOpenOutlined, FilePdfOutlined, CodeOutlined } from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import { useVirtualizer } from '@tanstack/react-virtual';
import { useAppStore, InputMode } from '../stores/appStore';
import type { ThinkingLevel, SlashCommand, MentionItem, ProjectGroup } from '../types';
import { PlusIcon, SendIcon, StopIcon } from './icons';
import MessageBubble from './MessageBubble';
import { pickDirectory, listDirectoryFiles } from '../services/piBridge';
import { piListSessionsDetailed } from '../services/piConfigService';

const { Text } = Typography;

const MODE_LABELS: Record<InputMode, { color: string; key: string }> = {
  prompt: { color: 'var(--accent-teal)', key: 'chatWindow.modePrompt' },
  steer: { color: 'var(--accent-amber)', key: 'chatWindow.modeSteer' },
  follow_up: { color: 'var(--accent-purple)', key: 'chatWindow.modeFollowUp' },
};

// File extensions we can render as code/text previews.
const CODE_EXTENSIONS = new Set([
  'js','jsx','ts','tsx','py','rs','go','java','c','cpp','h','hpp','cs','rb','php','swift','kt','scala',
  'json','yml','yaml','toml','xml','html','css','scss','less','md','txt','sh','bash','zsh','sql','graphql',
  'vue','svelte','dart','lua','r','pl','vim','conf','ini','env','gitignore','dockerfile','makefile',
]);

// Maximum file size (in bytes) we'll inline into the prompt — anything larger
// would blow the context window. 256 KB.
const MAX_INLINE_FILE_SIZE = 256 * 1024;

// Threshold above which we switch from plain DOM list to virtualized list.
const VIRTUAL_LIST_THRESHOLD = 50;

type AttachedFileKind = 'image' | 'code' | 'pdf' | 'binary';

interface AttachedFile {
  name: string;
  data: string;          // base64 for images/pdf; raw text for code/text
  kind: AttachedFileKind;
  size: number;
  language?: string;     // language hint for code files (e.g. "ts", "py")
  preview?: string;      // first ~400 chars of text content for code files
}

function detectFileKind(name: string): AttachedFileKind {
  const ext = name.split('.').pop()?.toLowerCase() || '';
  if (ext === 'pdf') return 'pdf';
  if (['png','jpg','jpeg','gif','webp','bmp','svg'].includes(ext)) return 'image';
  if (CODE_EXTENSIONS.has(ext)) return 'code';
  return 'binary';
}

function detectLanguage(name: string): string | undefined {
  const ext = name.split('.').pop()?.toLowerCase() || '';
  // Common mapping; undefined falls back to plain text in the code block.
  const map: Record<string, string> = {
    js: 'javascript', jsx: 'jsx', ts: 'typescript', tsx: 'tsx',
    py: 'python', rs: 'rust', go: 'go', java: 'java',
    c: 'c', cpp: 'cpp', h: 'c', hpp: 'cpp', cs: 'csharp',
    rb: 'ruby', php: 'php', swift: 'swift', kt: 'kotlin',
    json: 'json', yml: 'yaml', yaml: 'yaml', toml: 'toml',
    xml: 'xml', html: 'html', css: 'css', scss: 'scss', less: 'less',
    md: 'markdown', sh: 'bash', bash: 'bash', sql: 'sql',
    graphql: 'graphql', vue: 'vue', svelte: 'svelte', dart: 'dart', lua: 'lua', r: 'r',
  };
  return map[ext];
}

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
    abortRetry,
    dismissCompaction,
    dismissCrashRecovery,
    triggerCompaction,
    exportHtml,
    exportMarkdown,
    exportJson,
    importJsonl,
    loadSessions,
    loadAvailableModels,
    contextUsage,
    thinkingLevel,
    setThinkingLevel,
    refreshContextUsage,
    optimizeInput,
    sessions,
    piCwd,
  } = useAppStore();

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const dropRef = useRef<HTMLDivElement>(null);
  const messagesScrollRef = useRef<HTMLDivElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const [attachedFiles, setAttachedFiles] = useState<AttachedFile[]>([]);
  const [modelPickerOpen, setModelPickerOpen] = useState(false);

  // Virtualized list: only enabled when message count exceeds the threshold.
  // Below the threshold, plain DOM rendering is faster and simpler.
  const useVirtual = messages.length > VIRTUAL_LIST_THRESHOLD;
  const virtualizer = useVirtualizer({
    count: useVirtual ? messages.length : 0,
    getScrollElement: () => messagesScrollRef.current,
    estimateSize: () => 180,   // rough average; refined via measureElement
    overscan: 8,
    enabled: useVirtual,
  });

  // Slash-command ("/") and mention ("@") popup state.
  const [slashOpen, setSlashOpen] = useState(false);
  const [slashQuery, setSlashQuery] = useState('');
  const [slashIndex, setSlashIndex] = useState(0);
  const [mentionOpen, setMentionOpen] = useState(false);
  const [mentionQuery, setMentionQuery] = useState('');
  const [mentionIndex, setMentionIndex] = useState(0);

  // File search results for @mention file suggestion
  const [fileEntries, setFileEntries] = useState<{name: string; type: 'file' | 'directory'; size: number; path: string}[]>([]);

  // ─── Project selector state ────────────────────────────────
  const [knownProjects, setKnownProjects] = useState<ProjectGroup[]>([]);
  const [selectedProjectPath, setSelectedProjectPath] = useState<string>('');

  useEffect(() => {
    piListSessionsDetailed().then((groups) => {
      setKnownProjects(groups);
      // Default to the first (most recent) project if none selected
      if (groups.length > 0 && !selectedProjectPath) {
        setSelectedProjectPath(groups[0].projectPath);
      } else if (groups.length === 0 && !selectedProjectPath && piCwd) {
        // No sessions yet — fall back to pi's current working directory
        setSelectedProjectPath(piCwd);
      }
    }).catch(() => {});
  }, [piCwd]);

  // Fetch files from the selected project directory when mention opens
  useEffect(() => {
    if (mentionOpen && selectedProjectPath) {
      listDirectoryFiles(selectedProjectPath, mentionQuery || undefined)
        .then(setFileEntries)
        .catch(() => setFileEntries([]));
    } else if (!mentionOpen) {
      setFileEntries([]);
    }
  }, [mentionOpen, mentionQuery, selectedProjectPath]);

  const selectedProjectName = useMemo(() => {
    const found = knownProjects.find(g => g.projectPath === selectedProjectPath);
    return found?.projectName || selectedProjectPath.split('/').pop() || '';
  }, [knownProjects, selectedProjectPath]);

  const projectMenuItems = useMemo(() => {
    const items = knownProjects.map((g) => ({
      key: g.projectPath,
      label: (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 180 }}>
          {g.projectPath === selectedProjectPath && <CheckOutlined style={{ fontSize: 10, color: 'var(--accent-teal)' }} />}
          <span style={{ paddingLeft: g.projectPath === selectedProjectPath ? 0 : 14, fontSize: 12, color: 'var(--text-secondary)' }}>
            {g.projectName}
          </span>
          <span style={{ fontSize: 10, color: 'var(--text-muted)', marginLeft: 'auto' }}>
            {g.projectPath}
          </span>
        </div>
      ),
      onClick: () => setSelectedProjectPath(g.projectPath),
    }));
    items.push({
      key: '__open_folder__',
      label: (
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--accent-teal)', paddingTop: 4, borderTop: '1px solid var(--border-color)' }}>
          <FolderOutlined /> {t('chatWindow.openFolder')}
        </div>
      ),
      onClick: async () => {
        try {
          const path = await pickDirectory();
          if (path) {
            setSelectedProjectPath(path);
            // Add to known projects if not already there
            if (!knownProjects.find(g => g.projectPath === path)) {
              setKnownProjects(prev => [{ projectPath: path, projectName: path.split('/').pop() || path, sessions: [], totalSessions: 0, lastActive: '' }, ...prev]);
            }
          }
        } catch { /* cancelled */ }
      },
    });
    return items;
  }, [knownProjects, selectedProjectPath, t]);

  // Auto-scroll on new messages (only when user is already near the bottom,
  // to avoid hijacking scroll during manual review of long histories).
  useEffect(() => {
    if (useVirtual) {
      virtualizer.scrollToIndex(messages.length - 1, { align: 'end', behavior: 'smooth' });
    } else {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, useVirtual, virtualizer]);

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

  // M9: Focus the input when the global quick-open shortcut fires.
  useEffect(() => {
    const focusInput = () => textareaRef.current?.focus();
    window.addEventListener('pi:focus-chat-input', focusInput);
    return () => window.removeEventListener('pi:focus-chat-input', focusInput);
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

  // ─── Drag & drop / file attach (images + code + pdf) ─────
  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault(); e.stopPropagation(); setDragOver(true);
  }, []);
  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault(); e.stopPropagation(); setDragOver(false);
  }, []);

  // Add an arbitrary File to the attachment list. Images and PDFs are read as
  // base64 data URLs; text/code files are read as plain text so we can inline
  // them into the prompt as a fenced code block on send.
  const addFile = useCallback((file: File) => {
    if (file.size > MAX_INLINE_FILE_SIZE) {
      message.warning(t('chatWindow.fileTooLarge', { name: file.name }));
      return;
    }
    const kind = detectFileKind(file.name);
    const reader = new FileReader();
    if (kind === 'image' || kind === 'pdf') {
      reader.onload = () => {
        const base64 = (reader.result as string).split(',')[1];
        setAttachedFiles((prev) => [...prev, { name: file.name, data: base64, kind, size: file.size }]);
      };
      reader.readAsDataURL(file);
    } else if (kind === 'code') {
      reader.onload = () => {
        const text = String(reader.result || '');
        setAttachedFiles((prev) => [...prev, {
          name: file.name,
          data: text,
          kind,
          size: file.size,
          language: detectLanguage(file.name),
          preview: text.slice(0, 400),
        }]);
      };
      reader.readAsText(file);
    } else {
      // binary — record filename only; will be sent as a placeholder note.
      setAttachedFiles((prev) => [...prev, { name: file.name, data: '', kind: 'binary', size: file.size }]);
    }
  }, [t]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault(); e.stopPropagation(); setDragOver(false);
    const files = Array.from(e.dataTransfer.files);
    for (const file of files) addFile(file);
  }, [addFile]);

  const removeFile = useCallback((name: string) => {
    setAttachedFiles((prev) => prev.filter((f) => f.name !== name));
  }, []);

  // ─── Export dialog state ────────────────────────────────────
  const [exportModalOpen, setExportModalOpen] = useState(false);

  // ─── Send / mode actions ──────────────────────────────────
  const handleSend = () => {
    const text = inputValue.trim();
    if (!text || isStreaming) return;

    // Intercept slash-action commands before sending to Pi.
    const firstWord = text.split(/\s+/)[0];
    if (firstWord === '/export') {
      const format = text.split(/\s+/)[1]?.toLowerCase();
      if (format === 'html' || format === 'md' || format === 'json') {
        // Direct export in specified format
        doExport(format as 'html' | 'md' | 'json');
      } else {
        // Show format picker
        setExportModalOpen(true);
      }
      setInputValue('');
      return;
    }
    if (firstWord === '/compact') {
      triggerCompaction();
      setInputValue('');
      return;
    }
    if (firstWord === '/clear') {
      newSession();
      setInputValue('');
      return;
    }

    // Build the outgoing message. Code/text files are inlined as fenced code
    // blocks so Pi can read them directly; images go through the `images`
    // field; PDFs and unknown binaries become a one-line reference note
    // (Pi's prompt command does not currently accept arbitrary binary blobs).
    let composed = text;
    const images: string[] = [];
    const trailingNotes: string[] = [];

    for (const f of attachedFiles) {
      if (f.kind === 'image') {
        images.push(f.data);
      } else if (f.kind === 'code') {
        const lang = f.language || '';
        composed += `\n\n\`\`\`${lang}:${f.name}\n${f.data}\n\`\`\``;
      } else if (f.kind === 'pdf') {
        trailingNotes.push(`_(Attached PDF: ${f.name}, ${(f.size / 1024).toFixed(1)} KB — Pi cannot read PDFs directly; convert to text or images first.)_`);
      } else {
        trailingNotes.push(`_(Attached file: ${f.name}, ${(f.size / 1024).toFixed(1)} KB)_`);
      }
    }
    if (trailingNotes.length > 0) {
      composed += '\n\n' + trailingNotes.join('\n');
    }

    sendMessage(composed.trim(), images.length > 0 ? images : undefined);
    setAttachedFiles([]);
    setSlashOpen(false);
    setMentionOpen(false);
  };

  // ─── Export helpers ────────────────────────────────────────
  const doExport = async (format: 'html' | 'md' | 'json') => {
    try {
      setExportModalOpen(false);
      let exportFn: () => Promise<string>;
      if (format === 'html') exportFn = () => exportHtml();
      else if (format === 'md') exportFn = () => exportMarkdown();
      else exportFn = () => exportJson();
      const path = await exportFn();
      message.success(t('chatWindow.exportSuccess', 'Exported to ') + path);
    } catch (e: any) {
      if (e !== 'Save dialog cancelled') {
        message.error(t('chatWindow.exportFailed', 'Export failed'));
      }
    }
  };

  const handleImportJsonl = async () => {
    try {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = '.jsonl';
      input.onchange = async () => {
        const file = input.files?.[0];
        if (!file) return;
        try {
          await importJsonl((file as any).path || file.name);
          message.success(t('chatWindow.importSuccess', 'Session imported'));
          loadSessions();
        } catch (e: any) {
          message.error(t('chatWindow.importFailed', 'Import failed'));
        }
      };
      input.click();
    } catch { /* cancelled */ }
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

  // Build mention candidates — files/sessions/memory first, models last
  // so user sees file suggestions immediately instead of being buried by models.
  const mentionItems = useMemo<MentionItem[]>(() => {
    const items: MentionItem[] = [];

    // Actual file entries from the project directory
    for (const f of fileEntries.slice(0, 40)) {
      const isDir = f.type === 'directory';
      items.push({
        key: `file-${f.path}`,
        label: f.name,
        description: isDir ? 'directory' : `${(f.size / 1024).toFixed(1)} KB`,
        type: 'file',
        insertText: isDir ? `@file:${f.path}/` : `@file:${f.path}`,
      });
    }
    // Fallback file placeholder for manual path entry
    if (fileEntries.length === 0) {
      items.push({ key: 'mem-file', label: 'file', description: 'reference a file path', type: 'file', insertText: '@file:' });
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
    // Models (at the end — least likely to be what user wants with @)
    for (const m of availableModels.slice(0, 30)) {
      items.push({
        key: `model-${m.provider}-${m.modelId}`,
        label: `${m.label || m.modelId}`,
        description: `model · ${m.provider}`,
        type: 'model',
        insertText: `@model:${m.provider}/${m.modelId}`,
      });
    }
    return items;
  }, [availableModels, sessions, fileEntries]);

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
    // ZCode-style: show "@provider/modelId" for the active model.
    // Only use currentModel if it actually exists in the available list
    // (protects against stale/unknown values during startup transitions).
    const isValid = currentModel?.provider && currentModel?.modelId
      && availableModels.some((m) => m.provider === currentModel.provider && m.modelId === currentModel.modelId);
    if (isValid) {
      return `@${currentModel!.provider}/${currentModel!.modelId}`;
    }
    const first = availableModels[0];
    if (first) return `@${first.provider}/${first.modelId}`;
    return t('chatWindow.selectModel');
  }, [availableModels, currentModel, t]);

  const handlePickModel = (provider: string, modelId: string) => {
    setModel(provider, modelId);
    setModelPickerOpen(false);
  };

  const modelMenu = useMemo(() => {
    // ZCode-style cascade: top level = providers, hover reveals their models.
    const items: any[] = Object.entries(modelsByProvider).map(([provider, models]) => {
      const isCurrentProvider = currentModel?.provider === provider;
      return {
        key: `provider-${provider}`,
        label: (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 24, minWidth: 150 }}>
            <span style={{ color: isCurrentProvider ? 'var(--accent-teal)' : 'var(--text-secondary)', fontWeight: isCurrentProvider ? 600 : 400 }}>
              {provider}
            </span>
            {isCurrentProvider && <CheckOutlined style={{ fontSize: 11, color: 'var(--accent-teal)' }} />}
          </div>
        ),
        children: models.map((m) => {
          const isCurrent = currentModel?.provider === m.provider && currentModel?.modelId === m.modelId;
          return {
            key: `${m.provider}::${m.modelId}`,
            label: (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 24, minWidth: 170 }}>
                <span style={{ color: isCurrent ? 'var(--accent-teal)' : 'var(--text-secondary)', fontWeight: isCurrent ? 600 : 400 }}>
                  {m.label || m.modelId}
                </span>
                {isCurrent && <CheckOutlined style={{ fontSize: 11, color: 'var(--accent-teal)' }} />}
              </div>
            ),
            onClick: () => handlePickModel(m.provider, m.modelId),
          };
        }),
      };
    });
    // Divider + "Manage models" footer entry.
    items.push({ type: 'divider' as const });
    items.push({
      key: '__manage_action__',
      label: (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--text-secondary)' }}>
          <SettingOutlined style={{ fontSize: 11 }} />
          <span>{t('chatWindow.manageModels')}</span>
        </div>
      ),
      onClick: () => {
        setModelPickerOpen(false);
        useAppStore.getState().toggleSettings();
      },
    });
    return { items };
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
            <Tooltip title={t('chatWindow.queueTooltip', { steering: queueState.steering, followUp: queueState.followUp })}>
              <Tag color="blue" style={{ marginLeft: 4, fontSize: 10, padding: '1px 8px', borderRadius: 4 }}>
                {t('chatWindow.queueChip', { count: queueState.total })}
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
          padding: '6px 16px',
          background: retryInfo.failed ? 'var(--accent-danger-dim)' : 'var(--accent-amber)' + '20',
          borderBottom: `1px solid ${retryInfo.failed ? 'rgba(255,107,107,0.3)' : 'rgba(255,184,77,0.3)'}`,
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 12,
          color: retryInfo.failed ? 'var(--accent-danger)' : 'var(--accent-amber)',
        }}>
          <span>
            {retryInfo.failed
              ? `✕ ${t('chatWindow.retryFailed', { attempt: retryInfo.attempt })}`
              : `⚠ ${t('chatWindow.autoRetry', { attempt: retryInfo.attempt, max: retryInfo.maxAttempts || '?' })}`}
            {!retryInfo.failed && retryInfo.delayMs ? ` · ${t('chatWindow.retryIn', { secs: Math.ceil(retryInfo.delayMs / 1000) })}` : ''}
            {retryInfo.reason ? ` — ${retryInfo.reason}` : ''}
          </span>
          {retryInfo.failed ? (
            <Button type="text" size="small" icon={<CloseOutlined />} onClick={dismissRetry} style={{ color: 'var(--text-muted)', padding: 0, height: 16 }} />
          ) : (
            <Button type="text" size="small" onClick={abortRetry} style={{ color: 'var(--accent-amber)', padding: '0 8px', height: 18, fontSize: 11 }}>
              {t('chatWindow.retryCancel')}
            </Button>
          )}
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
      <div ref={messagesScrollRef} role="log" aria-live="polite" aria-label={t('chatWindow.ariaLog')}
        style={{ flex: 1, overflowY: 'auto', padding: '20px 0' }}>
        {messages.length === 0 ? (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', padding: 40, userSelect: 'none' }}>
            {/* Pi logo — larger, with glow */}
            <div style={{
              width: 72, height: 72, borderRadius: 22,
              background: 'linear-gradient(135deg, rgba(0,212,170,0.12), rgba(124,92,252,0.12))',
              border: '1px solid var(--border-color)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              marginBottom: 28, fontSize: 34,
              boxShadow: '0 0 32px rgba(0,212,170,0.06)',
            }}>π</div>

            {/* Time-based greeting — large, friendly */}
            <Text style={{
              fontSize: 26, fontWeight: 600,
              color: 'var(--text-primary)',
              marginBottom: 10, textAlign: 'center',
              letterSpacing: '-0.3px',
            }}>
              {(() => {
                const h = new Date().getHours();
                if (h >= 5 && h < 12) return t('chatWindow.greetMorning');
                if (h >= 12 && h < 18) return t('chatWindow.greetAfternoon');
                if (h >= 18 && h < 22) return t('chatWindow.greetEvening');
                return t('chatWindow.greetNight');
              })()}
            </Text>

            {/* Subtitle hint */}
            <Text style={{
              fontSize: 14, color: 'var(--text-muted)',
              textAlign: 'center', maxWidth: 420, lineHeight: 1.6,
            }}>
              {t('chatWindow.welcomeHint')}
            </Text>

            {/* Current project indicator */}
            {selectedProjectName && (
              <Dropdown menu={{ items: projectMenuItems }} trigger={['click']}>
                <div style={{
                  display: 'flex', alignItems: 'center', gap: 6,
                  marginTop: 16, padding: '4px 12px', borderRadius: 8,
                  background: 'var(--bg-surface)', border: '1px solid var(--border-color)',
                  cursor: 'pointer', fontSize: 12, color: 'var(--text-secondary)',
                }}>
                  <FolderOutlined style={{ fontSize: 12, color: 'var(--accent-teal)', opacity: 0.7 }} />
                  <span>{selectedProjectName}</span>
                  <DownOutlined style={{ fontSize: 8, opacity: 0.5 }} />
                </div>
              </Dropdown>
            )}

            {/* Quick hint chips */}
            <div style={{ display: 'flex', gap: 8, marginTop: 24, flexWrap: 'wrap', justifyContent: 'center' }}>
              {[
                { label: '/', desc: t('chatWindow.hintSlash') },
                { label: '@', desc: t('chatWindow.hintMention') },
                { label: 'Enter', desc: t('chatWindow.send') },
              ].map((chip) => (
                <span key={chip.label} style={{
                  fontSize: 11, color: 'var(--text-muted)',
                  padding: '3px 10px', borderRadius: 6,
                  background: 'var(--bg-surface)',
                  border: '1px solid var(--border-color)',
                }}>
                  <kbd style={{ color: 'var(--text-secondary)', fontWeight: 600, marginRight: 4 }}>{chip.label}</kbd>
                  {chip.desc}
                </span>
              ))}
            </div>
          </div>
        ) : useVirtual ? (
          // Virtualized list for long histories (≥50 messages).
          // Uses dynamic measurement so each bubble keeps its natural height.
          <div style={{ maxWidth: 760, margin: '0 auto', padding: '0 24px', height: '100%', position: 'relative' }}>
            <div style={{ height: virtualizer.getTotalSize(), width: '100%', position: 'relative' }}>
              {virtualizer.getVirtualItems().map((vItem) => {
                const msg = messages[vItem.index];
                if (!msg) return null;
                return (
                  <div
                    key={msg.id}
                    data-index={vItem.index}
                    ref={virtualizer.measureElement}
                    style={{
                      position: 'absolute',
                      top: 0,
                      left: 0,
                      width: '100%',
                      transform: `translateY(${vItem.start}px)`,
                    }}
                  >
                    <MessageBubble msg={msg} index={vItem.index} />
                  </div>
                );
              })}
            </div>
          </div>
        ) : (
          // Plain list for short histories — avoids virtualizer overhead.
          <div style={{ maxWidth: 760, margin: '0 auto', padding: '0 24px' }}>
            {messages.filter(Boolean).map((msg, i) => (
              <MessageBubble key={msg.id} msg={msg} index={i} />
            ))}
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* ─── ZCode-style input area ─────────────────────────── */}
      <div style={{ padding: '12px 16px 16px', background: 'var(--bg-primary)', borderTop: '1px solid var(--border-color)' }}>
        <div style={{ maxWidth: 760, margin: '0 auto', width: '100%' }}>

          {/* Attached files preview (images + code/text + pdf) */}
          {attachedFiles.length > 0 && (
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 10, padding: '8px 12px', background: 'var(--bg-secondary)', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-color)' }}>
              {attachedFiles.map((f) => (
                <div key={f.name} style={{ position: 'relative' }}>
                  {f.kind === 'image' ? (
                    <div style={{ position: 'relative', width: 44, height: 44 }}>
                      <Image src={`data:image/png;base64,${f.data}`} preview={false} style={{ width: 44, height: 44, objectFit: 'cover', borderRadius: 8, border: '1px solid var(--border-color)' }} />
                      <Tooltip title={f.name}>
                        <div onClick={() => removeFile(f.name)} style={{ position: 'absolute', top: -5, right: -5, width: 16, height: 16, borderRadius: '50%', background: 'rgba(0,0,0,0.7)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 9, cursor: 'pointer', border: '2px solid var(--bg-secondary)' }}>✕</div>
                      </Tooltip>
                    </div>
                  ) : (
                    <Tooltip title={f.kind === 'code' ? (f.preview || f.name) : `${f.name} · ${(f.size / 1024).toFixed(1)} KB`}>
                      <div style={{
                        display: 'flex', alignItems: 'center', gap: 6, padding: '4px 10px 4px 8px',
                        background: 'var(--bg-surface)', border: '1px solid var(--border-color)',
                        borderRadius: 8, fontSize: 11, color: 'var(--text-secondary)', maxWidth: 220,
                        cursor: 'default',
                      }}>
                        {f.kind === 'pdf' ? <FilePdfOutlined style={{ color: 'var(--accent-danger)', fontSize: 14 }} />
                          : f.kind === 'code' ? <CodeOutlined style={{ color: 'var(--accent-purple)', fontSize: 14 }} />
                          : <FileOutlined style={{ color: 'var(--text-muted)', fontSize: 14 }} />}
                        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>{f.name}</span>
                        <span onClick={() => removeFile(f.name)} style={{ cursor: 'pointer', color: 'var(--text-muted)', fontSize: 12, padding: '0 2px' }}>✕</span>
                      </div>
                    </Tooltip>
                  )}
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
                        {item.type === 'file' && <span style={{ marginRight: 4 }}>{item.description === 'directory' ? <FolderOpenOutlined style={{ fontSize: 10 }} /> : <FileOutlined style={{ fontSize: 10 }} />}</span>}
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
              aria-label={t('chatWindow.ariaInput')}
              aria-multiline="true"
              aria-disabled={isStreaming || !piConnected}
              placeholder={dragOver ? t('chatWindow.dropFiles') : (
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

            {/* Bottom toolbar: project | model | thinking | mode | spacer | context | optimize | attach | send */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 8px 6px 10px' }}>
              {/* Project selector (ZCode-style: folder icon + project name + dropdown) */}
              <Dropdown
                menu={{ items: projectMenuItems }}
                trigger={['click']}
              >
                <Button
                  type="text"
                  size="small"
                  style={{
                    color: 'var(--text-secondary)',
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
                  <FolderOutlined style={{ fontSize: 11, opacity: 0.7 }} />
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {selectedProjectName || t('chatWindow.selectProject')}
                  </span>
                  <DownOutlined style={{ fontSize: 9, opacity: 0.5 }} />
                </Button>
              </Dropdown>

              {/* Divider between project and model */}
              <div style={{ width: 1, height: 14, background: 'var(--border-color)', flexShrink: 0 }} />

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

              {/* Attach files (images / code / pdf) — file picker fallback for non-drag users */}
              <Tooltip title={t('chatWindow.attachFile')}>
                <Button
                  type="text"
                  size="small"
                  icon={<PaperClipOutlined />}
                  aria-label={t('chatWindow.attachFile')}
                  onClick={() => {
                    const input = document.createElement('input');
                    input.type = 'file';
                    input.accept = 'image/*,.pdf,.txt,.md,.json,.yml,.yaml,.toml,.js,.jsx,.ts,.tsx,.py,.rs,.go,.java,.c,.cpp,.h,.hpp,.cs,.rb,.php,.swift,.kt,.scala,.xml,.html,.css,.scss,.less,.sh,.bash,.zsh,.sql,.graphql,.vue,.svelte,.dart,.lua,.r,.pl';
                    input.multiple = true;
                    input.onchange = () => {
                      const files = Array.from(input.files || []);
                      for (const file of files) addFile(file);
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
              {messages.length > 0 && (
                <>
                  {' · '}
                  <span onClick={() => setExportModalOpen(true)} style={{ cursor: 'pointer', color: 'var(--text-muted)' }}>
                    <ExportOutlined style={{ fontSize: 9, marginRight: 2 }} />
                    {t('chatWindow.export')}
                  </span>
                  {' · '}
                  <span onClick={handleImportJsonl} style={{ cursor: 'pointer', color: 'var(--text-muted)' }}>
                    <ImportOutlined style={{ fontSize: 9, marginRight: 2 }} />
                    {t('chatWindow.importJsonl')}
                  </span>
                </>
              )}
            </span>
            <span>
              {currentModel ? `${currentModel.provider}/${currentModel.modelId}` : ''}
            </span>
          </div>
        </div>
      </div>

      {/* ─── Export format modal ───────────────────────────── */}
      <Modal
        title={t('chatWindow.export')}
        open={exportModalOpen}
        onCancel={() => setExportModalOpen(false)}
        footer={null}
        width={340}
        destroyOnHidden
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: '8px 0' }}>
          <Button
            block
            icon={<FileOutlined />}
            onClick={() => doExport('md')}
            style={{ height: 44, justifyContent: 'flex-start', padding: '0 16px', fontSize: 14 }}
          >
            Markdown (.md)
          </Button>
          <Button
            block
            icon={<FileOutlined />}
            onClick={() => doExport('html')}
            style={{ height: 44, justifyContent: 'flex-start', padding: '0 16px', fontSize: 14 }}
          >
            HTML (.html)
          </Button>
          <Button
            block
            icon={<FileOutlined />}
            onClick={() => doExport('json')}
            style={{ height: 44, justifyContent: 'flex-start', padding: '0 16px', fontSize: 14 }}
          >
            JSON (.json)
          </Button>
        </div>
      </Modal>
    </div>
  );
};

export default ChatWindow;
