import { create } from 'zustand';
import type { ChatMessage, SessionEntry, AppSettings, PiEvent, ProviderModel, ContextUsage, ThinkingLevel, ExternalSession } from '../types';
import * as pi from '../services/piBridge';
import * as piCfg from '../services/piConfigService';
import { optimizeInput as optimizeInputUtil } from '../utils/optimizeInput';

// ─── Pi session JSONL format parsers ───────────────────────

/** Pi session entry structure: { type, id, parentId, timestamp, message?: { role, content: ContentItem[] } } */
interface PiMessage {
  role?: string;
  content?: Array<Record<string, unknown>>;
  errorMessage?: string;
  [key: string]: unknown;
}

/** Infer message role from raw pi session entry */
function inferRole(entry: Record<string, unknown>): ChatMessage['role'] {
  const msg = entry.message as PiMessage | undefined;
  if (msg?.role) {
    const r = msg.role;
    if (r === 'user') return 'user';
    if (r === 'assistant') return 'assistant';
    if (r === 'toolResult' || r === 'tool') return 'tool';
    if (r === 'system') return 'system';
  }
  if (entry.type === 'user' || entry.from === 'user') return 'user';
  if (entry.type === 'assistant') return 'assistant';
  if (entry.type === 'toolResult' || entry.type === 'tool') return 'tool';
  return 'assistant';
}

/** Extract displayable text from Pi's content array format */
function extractContent(entry: Record<string, unknown>): string {
  const parts: string[] = [];
  const msg = entry.message as PiMessage | undefined;
  const contentItems = msg?.content;

  if (Array.isArray(contentItems) && contentItems.length > 0) {
    for (const item of contentItems) {
      const t = item.type;
      if (t === 'text' && typeof item.text === 'string') {
        parts.push(item.text);
      } else if (t === 'thinking' && typeof item.thinking === 'string') {
        const maxThinkLen = 300;
        const truncated = item.thinking.length > maxThinkLen
          ? item.thinking.slice(0, maxThinkLen) + '…'
          : item.thinking;
        parts.push(`**💭 Thinking:**\n> ${truncated.replace(/\n/g, '\n> ')}`);
      } else if (t === 'toolCall' && typeof item.name === 'string') {
        const args = typeof item.arguments === 'string'
          ? item.arguments
          : typeof item.arguments === 'object'
            ? JSON.stringify(item.arguments, null, 2)
            : '';
        parts.push(`\n\`\`\`tool:${item.name}\n${args}\n\`\`\``);
      } else if (t === 'toolResult') {
        continue;
      }
    }
  }

  if (parts.length > 0) return parts.join('\n\n');
  if (typeof (entry.message as any)?.errorMessage === 'string') {
    return `⚠️ Error: ${(entry.message as any).errorMessage}`;
  }
  if (typeof entry.content === 'string') return entry.content;
  if (typeof entry.text === 'string') return entry.text;
  if (typeof entry.message === 'string') return entry.message;
  return '';
}

/** Normalize timestamp: handle both ISO strings and epoch numbers */
function normalizeTimestamp(entry: Record<string, unknown>): string {
  if (typeof entry.timestamp === 'string') return entry.timestamp;
  if (typeof entry.timestamp === 'number') {
    return new Date(entry.timestamp).toISOString();
  }
  const msg = entry.message as Record<string, unknown> | undefined;
  if (msg && typeof msg.timestamp === 'number') {
    return new Date(msg.timestamp).toISOString();
  }
  return new Date().toISOString();
}

export type InputMode = 'prompt' | 'steer' | 'follow_up';

export interface RetryInfo {
  visible: boolean;
  attempt: number;
  maxAttempts?: number;
  reason?: string;
}

export interface QueueState {
  active: number;
  pending: number;
  total: number;
}

export interface CompactionInfo {
  visible: boolean;
  phase: 'started' | 'progress' | 'completed' | 'failed';
  progress?: number;
  message?: string;
}

interface AppState {
  bootstrapped: boolean;
  piVersion: string;
  piBinaryPath: string;
  piConnected: boolean;
  piMissing: boolean;
  messages: ChatMessage[];
  isStreaming: boolean;
  inputValue: string;
  loadingMessages: boolean;
  sessions: SessionEntry[];
  currentSessionId: string | null;
  settings: AppSettings;
  settingsOpen: boolean;
  availableModels: ProviderModel[];
  currentModel: { provider: string; modelId: string } | null;
  sidebarOpen: boolean;
  activeView: string;

  // M3: stream/queue state
  inputMode: InputMode;
  retryInfo: RetryInfo | null;
  queueState: QueueState | null;
  compactionInfo: CompactionInfo | null;
  agentPhase: 'idle' | 'thinking' | 'acting' | 'observing';
  unreadCount: number;

  // M3: crash recovery
  crashRecovery: { visible: boolean; reason: string; restartAttempt: number } | null;

  // Context usage / thinking level
  contextUsage: ContextUsage | null;
  thinkingLevel: ThinkingLevel;
  sidebarCollapsed: boolean;

  initialize: () => Promise<void>;
  sendMessage: (content: string, images?: string[]) => Promise<void>;
  sendSteer: (content: string, images?: string[]) => Promise<void>;
  sendFollowUp: (content: string, images?: string[]) => Promise<void>;
  abortStream: () => Promise<void>;
  newSession: () => Promise<void>;
  loadSessions: () => Promise<void>;
  switchSession: (path: string) => Promise<void>;
  renameSession: (path: string, newName: string) => Promise<void>;
  loadSettings: () => Promise<void>;
  updateSettings: (patch: Partial<AppSettings>) => Promise<void>;
  toggleSettings: () => void;
  toggleSidebar: () => void;
  setSidebarCollapsed: (collapsed: boolean) => void;
  setInputValue: (value: string) => void;
  setInputMode: (mode: InputMode) => void;
  handlePiEvent: (event: PiEvent) => void;
  appendMessage: (msg: Partial<ChatMessage>) => void;
  updateLastMessage: (content: string) => void;
  loadMessages: () => Promise<void>;
  loadAvailableModels: () => Promise<void>;
  setModel: (provider: string, modelId: string) => Promise<void>;
  setThinkingLevel: (level: ThinkingLevel) => Promise<void>;
  refreshContextUsage: () => Promise<void>;
  setActiveView: (view: string) => void;
  dismissRetry: () => void;
  dismissCompaction: () => void;
  dismissCrashRecovery: () => void;
  triggerCompaction: () => Promise<void>;
  markAllRead: () => void;
  optimizeInput: (text: string, mode: 'structure' | 'concise' | 'detailed' | 'fix') => string;

  // External agent sessions (opencode / claude code)
  externalSessions: ExternalSession[];
  loadExternalSessions: () => Promise<void>;
  importExternalSession: (filePath: string, source: string) => Promise<string>;

  // M8: export/import
  exportHtml: (outPath?: string) => Promise<string>;
  exportMarkdown: (outPath?: string) => Promise<string>;
  exportJson: (outPath?: string) => Promise<string>;
  importJsonl: (filePath: string) => Promise<void>;
  exportCurrentMessagesHtml: () => string;
  exportCurrentMessagesMarkdown: () => string;
}

function extractDelta(event: PiEvent): string | null {
  const e = event as Record<string, unknown>;
  if (e.text_delta && typeof e.text_delta === 'string') return e.text_delta;
  if (e.delta && typeof e.delta === 'string') return e.delta;
  if (e.assistantMessageEvent && typeof e.assistantMessageEvent === 'object') {
    const sub = e.assistantMessageEvent as Record<string, unknown>;
    if (sub.text_delta && typeof sub.text_delta === 'string') return sub.text_delta;
  }
  return null;
}

export const useAppStore = create<AppState>((set, get) => ({
  bootstrapped: false,
  piVersion: '',
  piBinaryPath: '',
  piConnected: false,
  piMissing: false,
  messages: [],
  isStreaming: false,
  inputValue: '',
  loadingMessages: false,
  sessions: [],
  currentSessionId: null,
  availableModels: [],
  currentModel: null,
  settings: {
    theme: 'system',
    font_size: 14,
    trusted_cwds: [],
    last_session_path: undefined,
    telemetry_opt_in: false,
    language: undefined,
  },
  settingsOpen: false,
  sidebarOpen: true,
  activeView: 'chat',

  // M3: stream/queue state
  inputMode: 'prompt' as InputMode,
  retryInfo: null,
  queueState: null,
  compactionInfo: null,
  agentPhase: 'idle' as const,
  unreadCount: 0,
  crashRecovery: null,

  // Context usage / thinking level
  contextUsage: null,
  thinkingLevel: 'medium' as ThinkingLevel,
  sidebarCollapsed: false,
  externalSessions: [],

  // ─── Actions ─────────────────────────────────────────────────

  initialize: async () => {
    try {
      const info = await pi.piBootstrap();
      set({
        bootstrapped: true,
        piVersion: info.piVersion,
        piBinaryPath: info.binaryPath,
        piConnected: !!info.binaryPath,
        piMissing: !info.binaryPath,
      });

      if (info.binaryPath) {
        get().loadSessions();
        get().loadSettings();
        get().loadAvailableModels();
      }
    } catch (e) {
      console.error('Failed to initialize:', e);
      set({ bootstrapped: true, piMissing: true });
    }
  },

  sendMessage: async (content: string, images?: string[]) => {
    if (!content.trim() || get().isStreaming) return;
    const mode = get().inputMode;
    const userMsg: ChatMessage = {
      id: crypto.randomUUID(),
      role: 'user',
      content: content.trim(),
      timestamp: new Date().toISOString(),
      metadata: mode !== 'prompt' ? { mode } : undefined,
    };
    set((state) => ({ messages: [...state.messages, userMsg], inputValue: '', isStreaming: true, retryInfo: null, compactionInfo: null }));
    try {
      if (mode === 'steer') {
        await pi.piSteer(content, images);
      } else if (mode === 'follow_up') {
        await pi.piFollowUp(content, images);
      } else {
        await pi.piPrompt(content, images);
      }
      // Reset back to prompt mode after sending a steer/follow_up
      if (mode !== 'prompt') set({ inputMode: 'prompt' });
    } catch (e) {
      console.error('Failed to send prompt:', e);
      set((state) => {
        const msgs = [...state.messages];
        const last = msgs[msgs.length - 1];
        if (last && last.role === 'assistant') { last.content = `Error: ${e}`; last.isStreaming = false; }
        return { messages: msgs, isStreaming: false };
      });
    }
  },

  sendSteer: async (content: string, images?: string[]) => {
    if (!content.trim() || get().isStreaming) return;
    const userMsg: ChatMessage = {
      id: crypto.randomUUID(),
      role: 'user',
      content: content.trim(),
      timestamp: new Date().toISOString(),
      metadata: { mode: 'steer' },
    };
    set((state) => ({ messages: [...state.messages, userMsg], inputValue: '', isStreaming: true }));
    try {
      await pi.piSteer(content, images);
    } catch (e) {
      console.error('Failed to send steer:', e);
      set({ isStreaming: false });
    }
  },

  sendFollowUp: async (content: string, images?: string[]) => {
    if (!content.trim() || get().isStreaming) return;
    const userMsg: ChatMessage = {
      id: crypto.randomUUID(),
      role: 'user',
      content: content.trim(),
      timestamp: new Date().toISOString(),
      metadata: { mode: 'follow_up' },
    };
    set((state) => ({ messages: [...state.messages, userMsg], inputValue: '', isStreaming: true }));
    try {
      await pi.piFollowUp(content, images);
    } catch (e) {
      console.error('Failed to send follow_up:', e);
      set({ isStreaming: false });
    }
  },

  abortStream: async () => {
    try {
      await pi.piAbort();
      set({ isStreaming: false });
      set((state) => {
        const msgs = [...state.messages];
        const last = msgs[msgs.length - 1];
        if (last && last.isStreaming) last.isStreaming = false;
        return { messages: msgs };
      });
    } catch (e) { console.error('Failed to abort:', e); }
  },

  newSession: async () => {
    try {
      set({ messages: [], currentSessionId: null, availableModels: [] });
      await pi.piNewSession();
      // Get current model from pi state
      try {
        const state = await pi.piGetState() as any;
        if (state?.model?.provider && state?.model?.modelId) {
          set({ currentModel: { provider: state.model.provider, modelId: state.model.modelId } });
        }
      } catch {}
    } catch (e) { console.error('Failed to create new session:', e); }
  },

  loadSessions: async () => {
    try {
      const sessions = await pi.piListSessions();
      set({ sessions });
    } catch (e) { console.error('Failed to load sessions:', e); }
  },

  switchSession: async (path: string) => {
    const session = get().sessions.find((s) => s.path === path);
    set({ messages: [], loadingMessages: true, currentSessionId: path });
    pi.piSwitchSession(path).catch((e) => console.warn('switch_session RPC failed (non-critical):', e));
    try {
      await get().loadMessages();
    } catch (e) {
      console.error('Failed to load messages for session:', e);
      if (session) {
        set({ messages: [{ id: session.id, role: 'system', content: `Session: ${session.id}\nCreated: ${session.timestamp}\nDirectory: ${session.cwd}`, timestamp: session.timestamp }] });
      }
      set({ loadingMessages: false });
    }
  },

  loadMessages: async () => {
    const sessionPath = get().currentSessionId;
    set({ loadingMessages: true });

    const toMessages = (entries: any[]): ChatMessage[] =>
      entries.filter((e: Record<string, unknown>) => (e.type as string) === 'message')
        .map((m: Record<string, unknown>) => {
          const content = extractContent(m);
          if (!content) return null;
          return { id: (m.id as string) || crypto.randomUUID(), role: inferRole(m), content, timestamp: normalizeTimestamp(m) } as ChatMessage;
        }).filter(Boolean) as ChatMessage[];

    // Extract current model from session entries (model_change type)
    const extractModel = (entries: any[]) => {
      let lastModel: { provider: string; modelId: string } | null = null;
      for (const e of entries) {
        if ((e.type as string) === 'model_change' && e.provider && e.modelId) {
          lastModel = { provider: e.provider, modelId: e.modelId };
        }
      }
      return lastModel;
    };

    try {
      const result = await pi.piGetMessages();
      let rawMessages: any[] | null = null;
      if (Array.isArray(result)) { rawMessages = result; }
      else if (result && typeof result === 'object') {
        const obj = result as Record<string, unknown>;
        if (Array.isArray(obj.messages)) rawMessages = obj.messages;
        else if (Array.isArray(obj.entries)) rawMessages = obj.entries;
        else if (Array.isArray(obj.data)) rawMessages = obj.data;
      }
      if (rawMessages && rawMessages.length > 0) {
        const model = extractModel(rawMessages);
        set({ messages: toMessages(rawMessages), ...(model ? { currentModel: model } : {}) });
        return;
      }
      if (sessionPath) {
        const fileEntries = await pi.piReadSessionFile(sessionPath);
        if (fileEntries && fileEntries.length > 0) {
          const model = extractModel(fileEntries);
          set({ messages: toMessages(fileEntries), ...(model ? { currentModel: model } : {}) });
          return;
        }
      }
      set({ messages: [] });
    } catch (e) {
      console.error('loadMessages failed:', e);
      if (sessionPath) {
        try { const fileEntries = await pi.piReadSessionFile(sessionPath); if (fileEntries && fileEntries.length > 0) { set({ messages: toMessages(fileEntries) }); return; } } catch {}
      }
      set({ messages: [] });
    } finally { set({ loadingMessages: false }); }
  },

  loadAvailableModels: async () => {
    try {
      const result = await pi.piGetAvailableModels();
      if (result && Array.isArray(result)) {
        set({ availableModels: result as ProviderModel[] });
      } else if (result && typeof result === 'object') {
        const data = result as Record<string, unknown>;
        if (Array.isArray(data.models)) {
          // Pi RPC returns {models: [{id, name, provider, ...}]} - map to ProviderModel format
          const mapped = (data.models as any[]).map((m: any) => ({
            provider: m.provider || '',
            modelId: m.id || '',
            label: m.name || m.id || '',
          }));
          set({ availableModels: mapped });
        }
      }
    } catch (e) {
      console.error('Failed to load models:', e);
    }
  },

  setModel: async (provider: string, modelId: string) => {
    try {
      await pi.piSetModel(provider, modelId);
      set({ currentModel: { provider, modelId } });
    } catch (e) { console.error('Failed to set model:', e); }
  },

  loadSettings: async () => {
    try { const settings = await pi.appGetSettings(); set({ settings }); } catch (e) { console.error('Failed to load settings:', e); }
  },

  updateSettings: async (patch: Partial<AppSettings>) => {
    try { await pi.appSetSettings(patch); set((state) => ({ settings: { ...state.settings, ...patch } })); } catch (e) { console.error('Failed to update settings:', e); }
  },

  setActiveView: (view: string) => { set({ activeView: view }); },

  toggleSettings: () => {
    const wasOpen = get().settingsOpen;
    set({ settingsOpen: !wasOpen, activeView: wasOpen ? 'chat' : 'settings' });
    if (!wasOpen) { get().loadAvailableModels(); }
  },

  toggleSidebar: () => { set((state) => ({ sidebarOpen: !state.sidebarOpen })); },

  setSidebarCollapsed: (collapsed: boolean) => { set({ sidebarCollapsed: collapsed }); },

  setInputValue: (value: string) => { set({ inputValue: value }); },

  setInputMode: (mode: InputMode) => { set({ inputMode: mode }); },

  renameSession: async (path: string, newName: string) => {
    try {
      await piCfg.piRenameSession(path, newName);
      // Update local session list in-place
      set((state) => ({
        sessions: state.sessions.map((s) =>
          s.path === path ? { ...s, sessionName: newName } : s
        ),
      }));
    } catch (e) {
      console.error('Failed to rename session:', e);
      throw e;
    }
  },

  setThinkingLevel: async (level: ThinkingLevel) => {
    set({ thinkingLevel: level });
    try {
      await pi.piSetThinkingLevel(level);
    } catch (e) {
      console.warn('Failed to set thinking level via RPC (non-critical):', e);
    }
  },

  refreshContextUsage: async () => {
    try {
      const usage = await pi.piGetContextUsage();
      set({ contextUsage: usage });
    } catch (e) {
      console.warn('Failed to refresh context usage:', e);
    }
  },

  loadExternalSessions: async () => {
    try {
      const sessions = await piCfg.piListExternalSessions();
      set({ externalSessions: sessions });
    } catch (e) {
      console.warn('Failed to load external sessions:', e);
      set({ externalSessions: [] });
    }
  },

  importExternalSession: async (filePath: string, source: string) => {
    const destPath = await piCfg.piImportExternalSession(filePath, source);
    get().loadSessions();
    return destPath;
  },

  optimizeInput: (text: string, mode: 'structure' | 'concise' | 'detailed' | 'fix') => {
    return optimizeInputUtil(text, mode);
  },

  dismissRetry: () => { set({ retryInfo: null }); },
  dismissCompaction: () => { set({ compactionInfo: null }); },
  dismissCrashRecovery: () => { set({ crashRecovery: null }); },

  markAllRead: () => { set({ unreadCount: 0 }); },

  triggerCompaction: async () => {
    set({ compactionInfo: { visible: true, phase: 'started', message: 'Compacting context…' } });
    try {
      await pi.piCompact();
    } catch (e) {
      console.error('Compaction failed:', e);
      set({ compactionInfo: { visible: true, phase: 'failed', message: `Compaction failed: ${e}` } });
      setTimeout(() => set({ compactionInfo: null }), 4000);
    }
  },

  handlePiEvent: (event: PiEvent) => {
    const delta = extractDelta(event);
    const e = event as Record<string, unknown>;
    switch (event.type) {
      case 'bootstrap':
        set({ piConnected: true, piMissing: false, piVersion: e.piVersion as string || '', crashRecovery: null });
        get().loadAvailableModels();
        pi.piGetState().then((state: any) => {
          if (state?.model?.provider && state?.model?.modelId) {
            set({ currentModel: { provider: state.model.provider, modelId: state.model.modelId } });
          }
        }).catch(() => {});
        break;
      case 'binary_missing':
        set({ piMissing: true, piConnected: false, isStreaming: false });
        break;
      case 'process_died': {
        const reason = (e.reason as string) || (e.error as string) || 'Pi process exited unexpectedly';
        const restartAttempt = (e.restart_attempt as number) || 0;
        set({ piConnected: false, isStreaming: false, crashRecovery: { visible: true, reason, restartAttempt } });
        break;
      }
      case 'process_restarted':
        set({ piConnected: true, piMissing: false, crashRecovery: null, isStreaming: false });
        // Restore last session if any
        if (get().currentSessionId) {
          get().loadMessages().catch(() => {});
        }
        break;
      case 'agent_start':
        set({ isStreaming: true, agentPhase: 'thinking', retryInfo: null });
        break;
      case 'agent_end':
        set({ isStreaming: false, agentPhase: 'idle', queueState: null });
        get().loadSessions();
        break;
      case 'turn_start':
        set({ isStreaming: true, agentPhase: 'acting' });
        break;
      case 'turn_end':
        set({ isStreaming: false, agentPhase: 'idle' });
        break;
      case 'tool_call_start': case 'tool_call':
        set({ agentPhase: 'acting' });
        break;
      case 'tool_result': case 'tool_call_end':
        set({ agentPhase: 'observing' });
        break;
      case 'message_start': {
        const msgId = (e.message as Record<string, unknown>)?.id as string || crypto.randomUUID();
        set((state) => ({
          messages: [...state.messages, { id: msgId, role: 'assistant', content: '', timestamp: new Date().toISOString(), isStreaming: true }],
          isStreaming: true,
          agentPhase: 'thinking',
        }));
        break;
      }
      case 'message_update': case 'text_delta':
        if (delta) {
          get().updateLastMessage(delta);
          set({ agentPhase: 'thinking' });
        }
        break;
      case 'message_end':
        set((state) => {
          const msgs = [...state.messages];
          const last = msgs[msgs.length - 1];
          if (last && last.isStreaming) last.isStreaming = false;
          return { messages: msgs, isStreaming: false, agentPhase: 'idle' };
        });
        // Increment unread if window not focused (best-effort, frontend can reset)
        set((s) => ({ unreadCount: s.unreadCount + 1 }));
        break;
      case 'session':
        set({ currentSessionId: (e.id as string) || null });
        break;
      case 'error':
        console.error('Pi error event:', e.error);
        break;
      // M3: retry / queue / compaction events
      case 'auto_retry_started': case 'auto_retry': {
        const attempt = (e.attempt as number) || (e.retryCount as number) || 1;
        const max = (e.maxAttempts as number) || (e.maxRetries as number);
        const reason = (e.reason as string) || (e.error as string);
        set({ retryInfo: { visible: true, attempt, maxAttempts: max, reason } });
        break;
      }
      case 'auto_retry_succeeded':
        set({ retryInfo: null });
        break;
      case 'auto_retry_failed': case 'auto_retry_exhausted': {
        const attempt = (e.attempt as number) || (e.retryCount as number) || 1;
        const reason = (e.reason as string) || (e.error as string) || 'Retries exhausted';
        set({ retryInfo: { visible: true, attempt, reason } });
        break;
      }
      case 'queue_update': case 'queue_state': {
        const active = (e.active as number) ?? 0;
        const pending = (e.pending as number) ?? 0;
        const total = (e.total as number) ?? (active + pending);
        set({ queueState: total > 0 ? { active, pending, total } : null });
        break;
      }
      case 'compaction_started':
        set({ compactionInfo: { visible: true, phase: 'started', message: 'Compacting context…' } });
        break;
      case 'compaction_progress': {
        const progress = (e.progress as number) || (e.percent as number);
        set({ compactionInfo: { visible: true, phase: 'progress', progress, message: 'Compacting context…' } });
        break;
      }
      case 'compaction_completed': case 'compaction_success':
        set({ compactionInfo: { visible: true, phase: 'completed', message: 'Context compacted' } });
        setTimeout(() => {
          if (get().compactionInfo?.phase === 'completed') set({ compactionInfo: null });
        }, 2500);
        break;
      case 'compaction_failed': case 'compaction_error':
        set({ compactionInfo: { visible: true, phase: 'failed', message: (e.error as string) || 'Compaction failed' } });
        setTimeout(() => set({ compactionInfo: null }), 4000);
        break;
      case 'new_chat':
        get().newSession().catch(() => {});
        break;
      case 'open_settings':
        get().toggleSettings();
        break;
    }
  },

  appendMessage: (msg: Partial<ChatMessage>) => {
    set((state) => ({ messages: [...state.messages, { id: msg.id || crypto.randomUUID(), role: msg.role || 'assistant', content: msg.content || '', timestamp: msg.timestamp || new Date().toISOString(), isStreaming: msg.isStreaming, metadata: msg.metadata }] }));
  },

  updateLastMessage: (content: string) => {
    set((state) => { const msgs = [...state.messages]; const last = msgs[msgs.length - 1]; if (last) last.content += content; return { messages: msgs }; });
  },

  // ─── M8: Export / Import ───────────────────────────────────

  exportCurrentMessagesMarkdown: () => {
    const msgs = get().messages;
    const lines: string[] = [];
    lines.push(`# Pi Desktop Session Export`);
    lines.push('');
    lines.push(`_Exported: ${new Date().toISOString()}_`);
    if (get().currentSessionId) lines.push(`_Session: ${get().currentSessionId}_`);
    if (get().currentModel) lines.push(`_Model: ${get().currentModel?.provider}/${get().currentModel?.modelId}_`);
    lines.push('');
    lines.push('---');
    lines.push('');
    for (const m of msgs) {
      const ts = m.timestamp ? new Date(m.timestamp).toLocaleString() : '';
      const role = m.role === 'user' ? '🧑 User' : m.role === 'assistant' ? '🤖 Pi' : m.role === 'tool' ? '🛠 Tool' : 'System';
      lines.push(`## ${role} — ${ts}`);
      lines.push('');
      lines.push(m.content || '_(empty)_');
      lines.push('');
    }
    return lines.join('\n');
  },

  exportCurrentMessagesHtml: () => {
    const msgs = get().messages;
    const escape = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const body = msgs.map((m) => {
      const role = m.role === 'user' ? 'user' : 'assistant';
      const ts = m.timestamp ? new Date(m.timestamp).toLocaleString() : '';
      return `<div class="msg ${role}"><div class="role">${escape(m.role)}</div><div class="ts">${escape(ts)}</div><div class="content"><pre>${escape(m.content || '')}</pre></div></div>`;
    }).join('\n');
    return `<!doctype html><html><head><meta charset="utf-8"><title>Pi Desktop Export</title>
<style>
body{font-family:-apple-system,sans-serif;max-width:820px;margin:40px auto;padding:0 20px;color:#222;background:#fafafa}
.msg{padding:14px 18px;margin:10px 0;border-radius:8px;border:1px solid #e0e0e0}
.msg.user{background:#e8f5ff;border-color:#b8dcf5}
.msg.assistant{background:#fff}
.role{font-weight:600;text-transform:uppercase;font-size:11px;letter-spacing:.5px;color:#666}
.ts{font-size:11px;color:#999;margin-bottom:8px}
.content pre{white-space:pre-wrap;font-family:'SF Mono',monospace;font-size:13px;margin:0}
</style></head><body><h1>Pi Desktop Session Export</h1>
<p><em>Exported: ${new Date().toISOString()}</em></p>
${body}
</body></html>`;
  },

  exportMarkdown: async (outPath?: string) => {
    const content = get().exportCurrentMessagesMarkdown();
    const target = outPath || `pi-session-${Date.now()}.md`;
    if (pi.saveExportFile) {
      return await pi.saveExportFile(target, content);
    }
    return target;
  },

  exportHtml: async (outPath?: string) => {
    const content = get().exportCurrentMessagesHtml();
    const target = outPath || `pi-session-${Date.now()}.html`;
    if (pi.saveExportFile) {
      return await pi.saveExportFile(target, content);
    }
    return target;
  },

  exportJson: async (outPath?: string) => {
    const data = {
      version: 1,
      exportedAt: new Date().toISOString(),
      sessionId: get().currentSessionId,
      model: get().currentModel,
      messages: get().messages,
    };
    const content = JSON.stringify(data, null, 2);
    const target = outPath || `pi-session-${Date.now()}.json`;
    if (pi.saveExportFile) {
      return await pi.saveExportFile(target, content);
    }
    return target;
  },

  importJsonl: async (filePath: string) => {
    if (pi.importJsonl) {
      await pi.importJsonl(filePath);
    }
    get().loadSessions();
  },
}));