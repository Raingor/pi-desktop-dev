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
  delayMs?: number;
  failed?: boolean;
}

export interface QueueState {
  /** number of queued mid-turn steering messages */
  steering: number;
  /** number of queued follow-up messages */
  followUp: number;
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
  piCwd: string;
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
  appendStreamingChunk: (kind: 'thinking' | 'text', delta: string) => void;
  loadMessages: () => Promise<void>;
  loadAvailableModels: () => Promise<void>;
  setModel: (provider: string, modelId: string) => Promise<void>;
  setThinkingLevel: (level: ThinkingLevel) => Promise<void>;
  refreshContextUsage: () => Promise<void>;
  setActiveView: (view: string) => void;
  dismissRetry: () => void;
  abortRetry: () => Promise<void>;
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
  // Top-level fields (direct text_delta / delta events)
  if (e.text_delta && typeof e.text_delta === 'string') return e.text_delta;
  if (e.delta && typeof e.delta === 'string') return e.delta;
  if (e.text && typeof e.text === 'string') return e.text;
  // Nested under assistantMessageEvent (message_update events from pi)
  if (e.assistantMessageEvent && typeof e.assistantMessageEvent === 'object') {
    const sub = e.assistantMessageEvent as Record<string, unknown>;
    if (sub.text_delta && typeof sub.text_delta === 'string') return sub.text_delta;
    if (sub.text && typeof sub.text === 'string') return sub.text;
    // Pi's AssistantMessageEvent carries the increment in `delta` (e.g. { type: 'text_delta', delta: '…' }).
    if (sub.delta && typeof sub.delta === 'string') return sub.delta;
    // Anthropic-style: delta is an object with text field
    if (sub.delta && typeof sub.delta === 'object') {
      const deltaObj = sub.delta as Record<string, unknown>;
      if (deltaObj.text && typeof deltaObj.text === 'string') return deltaObj.text;
      if (deltaObj.text_delta && typeof deltaObj.text_delta === 'string') return deltaObj.text_delta;
    }
  }
  return null;
}

/**
 * Resolve pi's default provider/model for a fresh session.
 * Prefers the live pi state (`get_state`); falls back to the persisted defaults
 * in settings.json when pi hasn't reported a model yet.
 */
async function resolveDefaultModel(): Promise<{ provider: string; modelId: string; thinkingLevel?: ThinkingLevel } | null> {
  try {
    const state = await pi.piGetState() as any;
    // pi's get_state returns { model: { id, provider, ... }, thinkingLevel: '...', ... }.
    // NOTE: the model identifier field is `id`, not `modelId`.
    // NOTE: thinkingLevel is at the TOP LEVEL, not nested under model.
    const provider = state?.model?.provider;
    const modelId = state?.model?.id || state?.model?.modelId;
    // Validate: skip placeholder values like "unknown" should not be treated as a real model
    if (provider && modelId && provider !== 'unknown' && modelId !== 'unknown') {
      const thinkingLevel = state?.thinkingLevel as ThinkingLevel | undefined;
      return { provider, modelId, thinkingLevel };
    }
  } catch { /* fall through to settings.json */ }
  try {
    const s = await piCfg.piReadSettings() as any;
    if (s?.defaultProvider && s?.defaultModel) {
      const thinkingLevel = s?.defaultThinkingLevel as ThinkingLevel | undefined;
      return { provider: s.defaultProvider, modelId: s.defaultModel, thinkingLevel };
    }
  } catch { /* no default available */ }
  return null;
}

export const useAppStore = create<AppState>((set, get) => ({
  bootstrapped: false,
  piVersion: '',
  piBinaryPath: '',
  piConnected: false,
  piMissing: false,
  piCwd: '',
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
  // Map pi thinking levels to our UI levels for validation
  // pi supports: off, minimal, low, medium, high, xhigh, max
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
        piCwd: info.cwd || '',
      });

      if (info.binaryPath) {
        get().loadSessions();
        get().loadSettings();
        get().loadAvailableModels();
        // Read pi's default provider/model directly so a plain webview reload
        // (which never re-fires the one-shot `bootstrap` event) still shows the
        // real default instead of "no model" / the first available model.
        resolveDefaultModel().then((model) => {
          if (model) {
            set({ currentModel: { provider: model.provider, modelId: model.modelId } });
            if (model.thinkingLevel) set({ thinkingLevel: model.thinkingLevel });
          }
        });
      }
    } catch (e) {
      console.error('Failed to initialize:', e);
      // Only mark as missing if bootstrap explicitly reports empty binary path.
      // Other errors (deadlock, timeout) should allow retry.
      set({ bootstrapped: true });
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
        const msgs = state.messages.slice();
        const last = msgs[msgs.length - 1];
        if (last && last.role === 'assistant') {
          msgs[msgs.length - 1] = { ...last, content: `Error: ${e}`, isStreaming: false };
        }
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
    } catch (e) {
      console.error('Failed to abort:', e);
    } finally {
      // Always end the streaming UI state, even if the abort RPC failed,
      // so the stop button never gets stuck and the cursor stops blinking.
      set({ isStreaming: false, agentPhase: 'idle' });
      set((state) => {
        const msgs = state.messages.slice();
        const last = msgs[msgs.length - 1];
        if (last && last.isStreaming) {
          msgs[msgs.length - 1] = { ...last, isStreaming: false };
        }
        return { messages: msgs };
      });
    }
  },

  newSession: async () => {
    try {
      set({ messages: [], currentSessionId: null });
      await pi.piNewSession();
      // Resolve the real session file path (the `session` event also does this,
      // but we set it explicitly here to avoid a race / missing event).
      const st = await pi.piGetState().catch(() => null) as any;
      if (st?.sessionFile) set({ currentSessionId: st.sessionFile });
      // A fresh session inherits pi's default provider/model. Refresh the model
      // list and read the default back (with a settings.json fallback) so the
      // selector shows pi's real default instead of "no model".
      get().loadAvailableModels();
      const model = await resolveDefaultModel();
      if (model) {
        set({ currentModel: { provider: model.provider, modelId: model.modelId } });
        if (model.thinkingLevel) set({ thinkingLevel: model.thinkingLevel });
      }
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
      // Prefer the local session JSONL file: it's an instant, lock-free disk read,
      // so history renders immediately even when the pi RPC is slow or unresponsive.
      // (pi_get_messages holds the global bridge lock for its whole duration and can
      //  time out, which previously left the UI stuck on "loading messages".)
      if (sessionPath) {
        try {
          const fileEntries = await pi.piReadSessionFile(sessionPath);
          if (fileEntries && fileEntries.length > 0) {
            const model = extractModel(fileEntries);
            set({ messages: toMessages(fileEntries), ...(model ? { currentModel: model } : {}) });
            return;
          }
        } catch (e) {
          console.warn('Local session file read failed, falling back to get_messages RPC:', e);
        }
      }

      // Fallback: ask pi for the message list (used for sessions with no file yet).
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
      set({ messages: [] });
    } catch (e) {
      console.error('loadMessages failed:', e);
      set({ messages: [] });
    } finally { set({ loadingMessages: false }); }
  },

  loadAvailableModels: async () => {
    // Step 1: Always load enabledModels from settings.json first.
    // This is reliable (no subprocess dependency) and guarantees the dropdown
    // shows the user's configured models immediately, even if the pi RPC
    // subprocess is still starting up or returns empty.
    try {
      const s = await piCfg.piReadSettings() as any;
      const enabled: string[] = s?.enabledModels || [];
      if (enabled.length > 0) {
        const mapped: ProviderModel[] = enabled.map((entry: string) => {
          const [provider, modelId] = entry.split('/');
          return { provider: provider || '', modelId: modelId || '', label: modelId || entry };
        });
        set({ availableModels: mapped });
        // Ensure currentModel is valid: if not set or not in the list,
        // pick the default from settings.json or the first enabled model.
        const cur = get().currentModel;
        const isValid = cur && mapped.some((m) => m.provider === cur.provider && m.modelId === cur.modelId);
        if (!isValid) {
          const defaultProvider = s?.defaultProvider;
          const defaultModel = s?.defaultModel;
          const defaultMatch = mapped.find((m) => m.provider === defaultProvider && m.modelId === defaultModel);
          const pick = defaultMatch || mapped[0];
          set({ currentModel: { provider: pick.provider, modelId: pick.modelId } });
        }
      }
    } catch (e) {
      console.warn('Failed to read enabledModels from settings.json:', e);
    }

    // Step 2: Refresh from pi RPC in the background.
    // The RPC may return a larger catalog (all available models, not just enabled).
    // If it succeeds, we merge any models not already in the list.
    try {
      const result = await pi.piGetAvailableModels();
      let rpcModels: ProviderModel[] = [];
      if (Array.isArray(result)) {
        rpcModels = result as ProviderModel[];
      } else if (result && typeof result === 'object' && Array.isArray((result as any).models)) {
        rpcModels = (result as any).models.map((m: any) => ({
          provider: m.provider || '',
          modelId: m.id || '',
          label: m.name || m.id || '',
        }));
      }

      if (rpcModels.length > 0) {
        // Merge: keep existing (settings.json) models, append any new RPC models.
        // This way enabled models appear first, followed by the full catalog.
        const existing = get().availableModels;
        const existingKeys = new Set(existing.map((m) => `${m.provider}/${m.modelId}`));
        const merged = [...existing, ...rpcModels.filter((m) => !existingKeys.has(`${m.provider}/${m.modelId}`))];
        set({ availableModels: merged });
      }
    } catch (e) {
      // RPC failed — settings.json models (loaded in step 1) remain. Non-fatal.
      console.warn('pi_get_available_models RPC failed (using settings.json models):', e);
    }
  },

  setModel: async (provider: string, modelId: string) => {
    // Update optimistically immediately
    set({ currentModel: { provider, modelId } });
    // Fire RPC in background (don't block on failure)
    pi.piSetModel(provider, modelId).catch((e) => console.warn('set_model RPC failed (non-critical):', e));
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
  abortRetry: async () => {
    // Optimistically clear the banner, then ask pi to stop retrying.
    set({ retryInfo: null });
    try {
      await pi.piAbortRetry();
    } catch (e) {
      console.warn('abort_retry RPC failed (non-critical):', e);
    }
  },
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
    const e = event as Record<string, unknown>;
    switch (event.type) {
      case 'bootstrap':
        set({ piConnected: true, piMissing: false, piVersion: e.piVersion as string || '', crashRecovery: null });
        get().loadAvailableModels();
        // Read pi's default provider/model (get_state, with settings.json fallback).
        resolveDefaultModel().then((model) => {
          if (model) {
            set({ currentModel: { provider: model.provider, modelId: model.modelId } });
            if (model.thinkingLevel) set({ thinkingLevel: model.thinkingLevel });
          }
        });
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
        const msg = e.message as Record<string, unknown> | undefined;
        const role = msg?.role as string | undefined;
        // Pi emits message_start for both user and assistant messages.
        // Only create a new message bubble for assistant messages;
        // user messages are already added optimistically by sendMessage().
        if (role !== 'assistant') break;
        const msgId = msg?.id as string || crypto.randomUUID();
        set((state) => {
          // Avoid duplicate: if last message is already an empty streaming assistant message, don't add another
          const last = state.messages[state.messages.length - 1];
          if (last && last.role === 'assistant' && last.isStreaming && !last.content) {
            return { isStreaming: true, agentPhase: 'thinking' };
          }
          return {
            messages: [...state.messages, { id: msgId, role: 'assistant', content: '', thinking: '', timestamp: new Date().toISOString(), isStreaming: true }],
            isStreaming: true,
            agentPhase: 'thinking',
          };
        });
        break;
      }
      case 'message_update': case 'text_delta': {
        // Determine whether this chunk is a *thinking* delta or a *text* delta.
        // pi nests the increment under `assistantMessageEvent` with a `type`
        // of `thinking_start|thinking_delta|thinking_end` or
        // `text_start|text_delta|text_end`.
        const sub = e.assistantMessageEvent as Record<string, unknown> | undefined;
        const subType = typeof sub?.type === 'string' ? (sub.type as string) : undefined;
        const isThinking = subType ? subType.startsWith('thinking') : false;
        const d = extractDelta(event);
        if (d) {
          get().appendStreamingChunk(isThinking ? 'thinking' : 'text', d);
          set({ agentPhase: 'thinking' });
        }
        break;
      }
      case 'message_end': {
        // pi emits `message_end` for BOTH user and assistant messages.
        // Only the assistant message_end should end the streaming state and
        // count as an unread reply. The user message_end is just the echo of
        // the prompt we already added optimistically — ignoring it prevents
        // the stop button from vanishing and `isStreaming` from flipping false
        // before pi even starts generating the assistant reply.
        const lastMsg = get().messages[get().messages.length - 1];
        if (lastMsg && lastMsg.role === 'assistant') {
          set((state) => {
            const msgs = state.messages.slice();
            const last = msgs[msgs.length - 1];
            if (last && last.isStreaming) {
              msgs[msgs.length - 1] = { ...last, isStreaming: false };
            }
            return { messages: msgs, isStreaming: false, agentPhase: 'idle' };
          });
          // Increment unread only for assistant replies (best-effort; reset on focus)
          set((s) => ({ unreadCount: s.unreadCount + 1 }));
        }
        break;
      }
      case 'session': {
        // pi emits `session` when a new session branch is created. Its `id` is a
        // session UUID, NOT a file path. We resolve the real file path from
        // get_state().sessionFile and track that as currentSessionId — otherwise
        // loadMessages() would try to read a UUID as a path and return empty,
        // making the conversation vanish after switching sessions.
        const sid = e.id as string | undefined;
        pi.piGetState().then((st: any) => {
          const file = st?.sessionFile as string | undefined;
          if (file) {
            set({ currentSessionId: file });
            get().loadSessions();
            get().loadMessages();
          } else if (sid) {
            set({ currentSessionId: sid });
          }
        }).catch(() => { if (sid) set({ currentSessionId: sid }); });
        break;
      }
      case 'error':
        console.error('Pi error event:', e.error);
        set({ isStreaming: false, agentPhase: 'idle' });
        break;
      // Pi returns error responses (type: "response", success: false) for failed
      // prompt/steer/follow_up commands. Since these commands are fire-and-forget
      // (no pending response channel), the error response is emitted as an event.
      // We must handle it here to reset isStreaming and show the error to the user.
      case 'response': {
        const success = e.success as boolean | undefined;
        if (success === false) {
          const errorMsg = (e.error as string) || (e.errorMessage as string) || 'Unknown error';
          console.error('Pi command error response:', errorMsg);
          set((state) => {
            const msgs = state.messages.slice();
            const last = msgs[msgs.length - 1];
            // If there's an empty streaming assistant message, replace it with the error
            if (last && last.role === 'assistant' && last.isStreaming && !last.content) {
              msgs[msgs.length - 1] = { ...last, content: `⚠️ ${errorMsg}`, isStreaming: false };
            } else if (!last || last.role !== 'assistant' || !last.isStreaming) {
              // No streaming assistant message — add an error message
              msgs.push({ id: crypto.randomUUID(), role: 'assistant', content: `⚠️ ${errorMsg}`, timestamp: new Date().toISOString(), isStreaming: false });
            }
            return { messages: msgs, isStreaming: false, agentPhase: 'idle' };
          });
        }
        break;
      }
      // M3: queue events — Pi emits the full pending queues on every change.
      case 'queue_update': {
        // Payload: { steering: string[]; followUp: string[] }
        const steering = Array.isArray(e.steering) ? (e.steering as unknown[]).length : (e.steering as number) || 0;
        const followUp = Array.isArray(e.followUp) ? (e.followUp as unknown[]).length : (e.followUp as number) || 0;
        const total = steering + followUp;
        set({ queueState: total > 0 ? { steering, followUp, total } : null });
        break;
      }
      // M3: retry events — Pi emits auto_retry_start / auto_retry_end.
      // summarization_retry_scheduled shares the same shape during compaction retries.
      case 'auto_retry_start':
      case 'summarization_retry_scheduled': {
        const attempt = (e.attempt as number) || 1;
        const max = e.maxAttempts as number | undefined;
        const reason = (e.errorMessage as string) || undefined;
        const delayMs = e.delayMs as number | undefined;
        set({ retryInfo: { visible: true, attempt, maxAttempts: max, reason, delayMs, failed: false } });
        break;
      }
      case 'auto_retry_end': {
        // Payload: { success: boolean; attempt: number; finalError?: string }
        if (e.success === true) {
          set({ retryInfo: null });
        } else {
          const prev = get().retryInfo;
          const attempt = (e.attempt as number) || prev?.attempt || 1;
          const reason = (e.finalError as string) || prev?.reason || 'Retries exhausted';
          set({ retryInfo: { visible: true, attempt, maxAttempts: prev?.maxAttempts, reason, failed: true } });
        }
        break;
      }
      // M3: compaction events — Pi emits compaction_start / compaction_end
      // (covers both manual and automatic compaction).
      case 'compaction_start':
        set({ compactionInfo: { visible: true, phase: 'started', message: 'Compacting context…' } });
        break;
      case 'compaction_end': {
        // Payload: { reason; result?; aborted: boolean; willRetry: boolean; errorMessage? }
        const aborted = e.aborted === true;
        const errMsg = e.errorMessage as string | undefined;
        const willRetry = e.willRetry === true;
        if (errMsg || aborted) {
          set({ compactionInfo: { visible: true, phase: 'failed', message: errMsg || 'Compaction aborted' } });
          // If pi will retry (summarization_retry), keep the banner; otherwise auto-dismiss.
          if (!willRetry) setTimeout(() => set({ compactionInfo: null }), 4000);
        } else {
          set({ compactionInfo: { visible: true, phase: 'completed', message: 'Context compacted' } });
          setTimeout(() => {
            if (get().compactionInfo?.phase === 'completed') set({ compactionInfo: null });
          }, 2500);
        }
        // Context window usage changed after compaction — refresh the indicator.
        get().refreshContextUsage();
        break;
      }
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

  // Append a streamed chunk to the last assistant message. Uses an IMMUTABLE
  // update (new message object) so React re-renders the bubble — mutating the
  // message in place would leave MessageBubble's memoized reference unchanged
  // and the streamed text/thinking would never appear.
  appendStreamingChunk: (kind: 'thinking' | 'text', delta: string) => {
    set((state) => {
      const msgs = state.messages.slice();
      let last = msgs[msgs.length - 1];
      // No streaming assistant message yet (e.g. message_start was missed) —
      // create one so the chunk has a home.
      if (!last || last.role !== 'assistant' || !last.isStreaming) {
        const newMsg: ChatMessage = {
          id: crypto.randomUUID(),
          role: 'assistant',
          content: '',
          thinking: '',
          timestamp: new Date().toISOString(),
          isStreaming: true,
        };
        msgs.push(newMsg);
        last = newMsg;
        return { messages: msgs };
      }
      const updated: ChatMessage = { ...last };
      if (kind === 'thinking') {
        updated.thinking = (last.thinking || '') + delta;
      } else {
        updated.content = last.content + delta;
      }
      msgs[msgs.length - 1] = updated;
      return { messages: msgs };
    });
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