import { create } from 'zustand';
import type { ChatMessage, SessionEntry, AppSettings, PiEvent, ProviderModel } from '../types';
import * as pi from '../services/piBridge';

/** Infer message role from raw pi session entry */
function inferRole(entry: Record<string, unknown>): ChatMessage['role'] {
  if (entry.role === 'user' || entry.role === 'assistant' || entry.role === 'tool' || entry.role === 'system') {
    return entry.role;
  }
  // Pi's session format may mark roles differently
  if (entry.type === 'user' || entry.from === 'user') return 'user';
  if (entry.type === 'assistant' || entry.from === 'assistant') return 'assistant';
  if (entry.type === 'tool' || entry.type === 'tool_call') return 'tool';
  return 'assistant';
}

/** Extract text content from various entry formats */
function extractContent(entry: Record<string, unknown>): string {
  if (typeof entry.content === 'string') return entry.content;
  if (typeof entry.text === 'string') return entry.text;
  if (typeof entry.message === 'string') return entry.message;
  // Nested content object
  if (entry.content && typeof entry.content === 'object') {
    const c = entry.content as Record<string, unknown>;
    if (typeof c.text === 'string') return c.text;
    if (typeof c.content === 'string') return c.content;
  }
  // assistantMessageEvent
  if (entry.assistantMessageEvent && typeof entry.assistantMessageEvent === 'object') {
    const e = entry.assistantMessageEvent as Record<string, unknown>;
    if (typeof e.content === 'string') return e.content;
    if (typeof e.text === 'string') return e.text;
  }
  return JSON.stringify(entry).slice(0, 500);
}

interface AppState {
  // Bootstrap
  bootstrapped: boolean;
  piVersion: string;
  piBinaryPath: string;
  piConnected: boolean;
  piMissing: boolean;

  // Chat
  messages: ChatMessage[];
  isStreaming: boolean;
  inputValue: string;
  loadingMessages: boolean;

  // Sessions
  sessions: SessionEntry[];
  currentSessionId: string | null;

  // Settings
  settings: AppSettings;
  settingsOpen: boolean;

  // Model / Provider
  availableModels: ProviderModel[];
  currentModel: { provider: string; modelId: string } | null;

  // Sidebar
  sidebarOpen: boolean;

  // Actions
  initialize: () => Promise<void>;
  sendMessage: (content: string, images?: string[]) => Promise<void>;
  abortStream: () => Promise<void>;
  newSession: () => Promise<void>;
  loadSessions: () => Promise<void>;
  switchSession: (path: string) => Promise<void>;
  loadSettings: () => Promise<void>;
  updateSettings: (patch: Partial<AppSettings>) => Promise<void>;
  toggleSettings: () => void;
  toggleSidebar: () => void;
  setInputValue: (value: string) => void;
  handlePiEvent: (event: PiEvent) => void;
  appendMessage: (msg: Partial<ChatMessage>) => void;
  updateLastMessage: (content: string) => void;
  loadMessages: () => Promise<void>;
  loadAvailableModels: () => Promise<void>;
  setModel: (provider: string, modelId: string) => Promise<void>;
}

/**
 * Extract text delta from various event shapes.
 * Pi can send it as:
 *   { type: "message_update", text_delta: "..." }
 *   { type: "message_update", assistantMessageEvent: { text_delta: "..." } }
 *   { type: "text_delta", delta: "..." }
 */
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
  // Initial state
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
  },
  settingsOpen: false,
  sidebarOpen: true,

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
      }
    } catch (e) {
      console.error('Failed to initialize:', e);
      set({ bootstrapped: true, piMissing: true });
    }
  },

  sendMessage: async (content: string, images?: string[]) => {
    if (!content.trim() || get().isStreaming) return;

    const userMsg: ChatMessage = {
      id: crypto.randomUUID(),
      role: 'user',
      content: content.trim(),
      timestamp: new Date().toISOString(),
    };

    set((state) => ({
      messages: [...state.messages, userMsg],
      inputValue: '',
      isStreaming: true,
    }));

    try {
      await pi.piPrompt(content, images);
    } catch (e) {
      console.error('Failed to send prompt:', e);
      set((state) => {
        const msgs = [...state.messages];
        const last = msgs[msgs.length - 1];
        if (last && last.role === 'assistant') {
          last.content = `Error: ${e}`;
          last.isStreaming = false;
        }
        return { messages: msgs, isStreaming: false };
      });
    }
  },

  abortStream: async () => {
    try {
      await pi.piAbort();
      set({ isStreaming: false });
      set((state) => {
        const msgs = [...state.messages];
        const last = msgs[msgs.length - 1];
        if (last && last.isStreaming) {
          last.isStreaming = false;
        }
        return { messages: msgs };
      });
    } catch (e) {
      console.error('Failed to abort:', e);
    }
  },

  newSession: async () => {
    try {
      set({ messages: [], currentSessionId: null, availableModels: [] });
      await pi.piNewSession();
    } catch (e) {
      console.error('Failed to create new session:', e);
    }
  },

  loadSessions: async () => {
    try {
      const sessions = await pi.piListSessions();
      set({ sessions });
    } catch (e) {
      console.error('Failed to load sessions:', e);
    }
  },

  switchSession: async (path: string) => {
    // Find the session entry to get display info
    const session = get().sessions.find((s) => s.path === path);

    set({
      messages: [],
      loadingMessages: true,
      currentSessionId: path,
    });

    // Fire-and-forget: try to tell pi to switch sessions, but don't block on it
    pi.piSwitchSession(path).catch((e) =>
      console.warn('switch_session RPC failed (non-critical):', e)
    );

    // Load messages from the session file
    // We try three approaches in order:
    // 1. RPC get_messages (best, but may fail if pi version doesn't support it)
    // 2. Local session file parse (fallback, gives us the raw entries)
    // 3. Show session metadata if all else fails
    try {
      await get().loadMessages();
    } catch (e) {
      console.error('Failed to load messages for session:', e);
      // Show a fallback message with session info
      if (session) {
        set({
          messages: [{
            id: session.id,
            role: 'system',
            content: `Session: ${session.id}\nCreated: ${session.timestamp}\nDirectory: ${session.cwd}`,
            timestamp: session.timestamp,
          }],
        });
      }
      set({ loadingMessages: false });
    }
  },

  loadMessages: async () => {
    const sessionPath = get().currentSessionId;
    set({ loadingMessages: true });

    // Helper to parse raw entries into ChatMessage format
    const toMessages = (entries: any[]): ChatMessage[] =>
      entries
        .filter((e: Record<string, unknown>) => e.type !== 'session' && e.type !== 'response')
        .map((m: Record<string, unknown>) => ({
          id: (m.id as string) || crypto.randomUUID(),
          role: inferRole(m),
          content: extractContent(m),
          timestamp: (m.timestamp as string) || new Date().toISOString(),
        }));

    try {
      // Try 1: RPC get_messages
      const result = await pi.piGetMessages();

      let rawMessages: any[] | null = null;

      if (Array.isArray(result)) {
        rawMessages = result;
      } else if (result && typeof result === 'object') {
        const obj = result as Record<string, unknown>;
        if (Array.isArray(obj.messages)) rawMessages = obj.messages;
        else if (Array.isArray(obj.entries)) rawMessages = obj.entries;
        else if (Array.isArray(obj.data)) rawMessages = obj.data;
      }

      if (rawMessages && rawMessages.length > 0) {
        set({ messages: toMessages(rawMessages) });
        return;
      }

      // Try 2: Fallback — read session file directly
      if (sessionPath) {
        const fileEntries = await pi.piReadSessionFile(sessionPath);
        if (fileEntries && fileEntries.length > 0) {
          set({ messages: toMessages(fileEntries) });
          return;
        }
      }

      // No messages found
      set({ messages: [] });

    } catch (e) {
      console.error('loadMessages failed:', e);
      if (sessionPath) {
        try {
          const fileEntries = await pi.piReadSessionFile(sessionPath);
          if (fileEntries && fileEntries.length > 0) {
            set({ messages: toMessages(fileEntries) });
            return;
          }
        } catch (e2) {
          console.error('Fallback file read also failed:', e2);
        }
      }
      set({ messages: [] });
    } finally {
      set({ loadingMessages: false });
    }
  },

  loadAvailableModels: async () => {
    try {
      const result = await pi.piGetAvailableModels();
      if (result && Array.isArray(result)) {
        set({ availableModels: result as ProviderModel[] });
      } else if (result && typeof result === 'object') {
        // Some versions return {models: [...]}
        const data = result as Record<string, unknown>;
        if (Array.isArray(data.models)) {
          set({ availableModels: data.models as ProviderModel[] });
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
    } catch (e) {
      console.error('Failed to set model:', e);
    }
  },

  loadSettings: async () => {
    try {
      const settings = await pi.appGetSettings();
      set({ settings });
    } catch (e) {
      console.error('Failed to load settings:', e);
    }
  },

  updateSettings: async (patch: Partial<AppSettings>) => {
    try {
      await pi.appSetSettings(patch);
      set((state) => ({
        settings: { ...state.settings, ...patch },
      }));
    } catch (e) {
      console.error('Failed to update settings:', e);
    }
  },

  toggleSettings: () => {
    const wasOpen = get().settingsOpen;
    set({ settingsOpen: !wasOpen });
    // Load available models when settings panel opens
    if (!wasOpen) {
      get().loadAvailableModels();
    }
  },

  toggleSidebar: () => {
    set((state) => ({ sidebarOpen: !state.sidebarOpen }));
  },

  setInputValue: (value: string) => {
    set({ inputValue: value });
  },

  // ─── Event Handling ─────────────────────────────────────────

  handlePiEvent: (event: PiEvent) => {
    const delta = extractDelta(event);

    switch (event.type) {
      case 'bootstrap':
        set({
          piConnected: true,
          piMissing: false,
          piVersion: (event as Record<string, string>).piVersion || '',
        });
        break;

      case 'binary_missing':
      case 'process_died':
        set({ piMissing: true, piConnected: false, isStreaming: false });
        break;

      case 'agent_start':
        set({ isStreaming: true });
        break;

      case 'agent_end':
        set({ isStreaming: false });
        get().loadSessions();
        break;

      case 'turn_start':
        set({ isStreaming: true });
        break;

      case 'turn_end':
        set({ isStreaming: false });
        break;

      case 'message_start':
        // Pi sends a message_start when a new assistant message begins
        const startPayload = event as Record<string, unknown>;
        const msgId = (startPayload.message as Record<string, unknown>)?.id as string || crypto.randomUUID();
        const newMsg: ChatMessage = {
          id: msgId,
          role: 'assistant',
          content: '',
          timestamp: new Date().toISOString(),
          isStreaming: true,
        };
        set((state) => ({
          messages: [...state.messages, newMsg],
          isStreaming: true,
        }));
        break;

      case 'message_update':
      case 'text_delta':
        if (delta) {
          get().updateLastMessage(delta);
        }
        break;

      case 'message_end':
        set({ isStreaming: false });
        set((state) => {
          const msgs = [...state.messages];
          const last = msgs[msgs.length - 1];
          if (last && last.isStreaming) {
            last.isStreaming = false;
          }
          return { messages: msgs };
        });
        break;

      case 'session':
        set({
          currentSessionId: (event as Record<string, string>).id || null,
        });
        break;

      case 'error':
        console.error('Pi error event:', (event as Record<string, unknown>).error);
        break;

      case 'compaction_start':
        // Could show a compaction banner
        break;

      case 'compaction_end':
        // Hide compaction banner, refresh stats
        break;

      case 'auto_retry_start':
      case 'auto_retry_end':
        // Could show retry countdown/banner
        break;

      case 'queue_update':
        // Could show queue count
        break;
    }
  },

  appendMessage: (msg: Partial<ChatMessage>) => {
    const fullMsg: ChatMessage = {
      id: msg.id || crypto.randomUUID(),
      role: msg.role || 'assistant',
      content: msg.content || '',
      timestamp: msg.timestamp || new Date().toISOString(),
      isStreaming: msg.isStreaming,
      metadata: msg.metadata,
    };
    set((state) => ({
      messages: [...state.messages, fullMsg],
    }));
  },

  updateLastMessage: (content: string) => {
    set((state) => {
      const msgs = [...state.messages];
      const last = msgs[msgs.length - 1];
      if (last) {
        last.content += content;
      }
      return { messages: msgs };
    });
  },
}));