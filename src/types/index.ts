// Pi RPC types matching the Rust backend

export interface RpcCommand {
  id?: string;
  type: string;
  params?: unknown;
}

export interface RpcResponse {
  id?: string;
  type: string;
  command?: string;
  success?: boolean;
  data?: unknown;
  error?: string;
}

export interface PiState {
  session?: SessionInfo;
  model?: ModelInfo;
  sessionFile?: string;
  cwd?: string;
}

export interface SessionInfo {
  id: string;
  cwd?: string;
  parentSession?: string;
  timestamp?: string;
}

export interface ModelInfo {
  provider?: string;
  modelId?: string;
  thinkingLevel?: string;
}

export interface SessionEntry {
  path: string;
  id: string;
  timestamp: string;
  cwd: string;
  parentSession?: string;
}

export interface AppSettings {
  theme: 'light' | 'dark' | 'system';
  font_size: number;
  window_geometry?: WindowGeometry;
  trusted_cwds: string[];
  last_session_path?: string;
  telemetry_opt_in: boolean;
}

export interface WindowGeometry {
  x: number;
  y: number;
  w: number;
  h: number;
  is_maximized: boolean;
}

export interface PiEvent {
  type: string;
  [key: string]: unknown;
}

// Chat message types
export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'tool' | 'system';
  content: string;
  timestamp: string;
  isStreaming?: boolean;
  metadata?: Record<string, unknown>;
}

export interface BootstrapInfo {
  binaryPath: string;
  piVersion: string;
  sessionId: string | null;
  cwd: string | null;
}

// Model/Provider types
export interface ProviderModel {
  provider: string;
  modelId: string;
  label?: string;
}

export interface SessionStats {
  totalTokens?: number;
  contextWindow?: number;
  cost?: number;
  turnCount?: number;
}