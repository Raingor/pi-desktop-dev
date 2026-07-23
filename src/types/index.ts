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
  sessionName?: string;
}

export interface AppSettings {
  theme: 'light' | 'dark' | 'system' | 'high-contrast';
  font_size: number;
  window_geometry?: WindowGeometry;
  trusted_cwds: string[];
  last_session_path?: string;
  telemetry_opt_in: boolean;
  language?: string;
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

// ─── pi-web-switch merged types ─────────────────────────────

export interface ModelCost {
  input: number; output: number; cacheRead: number; cacheWrite: number;
}

export interface Model {
  id: string; name?: string; api?: string; baseUrl?: string;
  reasoning?: boolean; input?: string[]; cost?: ModelCost;
  contextWindow?: number; maxTokens?: number; enabled?: boolean;
  compat?: Record<string, unknown>;
}

export interface ProviderAuth {
  type: 'api_key' | 'oauth'; key?: string; env?: Record<string, string>;
}

export interface Provider {
  id: string; name: string; type: 'builtin' | 'custom';
  baseUrl?: string; api?: string; apiKey?: string;
  models: Model[]; hasAuth: boolean; authMethod?: string;
  headers?: Record<string, string>;
}

export interface PiSettings {
  defaultProvider?: string; defaultModel?: string; defaultThinkingLevel?: string;
  theme?: string; hideThinkingBlock?: boolean; retry?: { enabled: boolean };
  packages?: string[]; enabledModels?: string[];
}

export interface PiAuth {
  [providerId: string]: ProviderAuth;
}

export interface CustomProviderConfig {
  baseUrl?: string; api?: string; apiKey?: string;
  models?: Model[]; compat?: Record<string, unknown>;
}

export interface PiModelsJson {
  providers: Record<string, CustomProviderConfig>;
}

export interface PiConfig {
  settings: PiSettings; auth: PiAuth; modelsJson: PiModelsJson | null;
}

export interface UsageRecord {
  date: string; hour?: number; providerId: string; modelId: string;
  inputTokens: number; outputTokens: number;
  cacheReadTokens: number; cacheWriteTokens: number;
  requests: number; cost: number;
}

export interface DailyBreakdown {
  date: string; input: number; output: number;
  cacheRead: number; cacheWrite: number; cost: number; requests: number;
}

export interface HourlyBreakdown {
  hour: string; input: number; output: number;
  cacheRead: number; cacheWrite: number; cost: number; requests: number;
}

export interface RequestLogEntry {
  timestamp: string; providerId: string; modelId: string;
  input: number; output: number; cost: number; requests: number;
}

export interface ProviderStat {
  providerId: string; totalTokens: number; totalInput: number;
  totalOutput: number; totalCost: number; totalRequests: number; modelCount: number;
}

export interface ModelStat {
  modelId: string; providerId: string; totalTokens: number;
  totalInput: number; totalOutput: number; totalCost: number; totalRequests: number;
}

export interface UsageRangeData {
  totalTokens: number; totalInput: number; totalOutput: number;
  totalCacheRead: number; totalCacheWrite: number; totalCost: number;
  totalRequests: number; cacheHitRate: number;
  dailyBreakdown: DailyBreakdown[]; hourlyBreakdown: HourlyBreakdown[];
  requestLog: RequestLogEntry[]; providerStats: ProviderStat[]; modelStats: ModelStat[];
}

export interface MemoryFile {
  name: string; filename: string; content: string; updatedAt: string;
}

export interface DetailedSessionEntry {
  id: string; fileName: string; filePath: string;
  timestamp: string; lastActive: string;
  name?: string; provider?: string; model?: string;
  messageCount: number; duration?: number;
}

export interface ProjectGroup {
  projectPath: string; projectName: string;
  sessions: DetailedSessionEntry[]; totalSessions: number; lastActive: string;
}

export interface TrashEntry {
  originalPath: string;
  trashPath: string;
  fileName: string;
  trashedAt: string;
  sessionId: string;
  sessionName?: string;
  lastActive: string;
  messageCount: number;
}

// ─── External agent import (opencode / claude code) ────────

export interface ExternalSession {
  tool: 'opencode' | 'claude_code' | string;
  project: string;
  filePath: string;
  sessionId: string;
  timestamp: string;
  preview: string;
}

// ─── Context usage / thinking level ────────────────────────

export interface ContextUsage {
  usedTokens: number;
  contextWindow: number;
  percent: number;
  thinkingLevel?: string;
}

export type ThinkingLevel = 'none' | 'low' | 'medium' | 'high' | 'max';

// ─── Slash command & @-mention autocomplete ────────────────

export interface SlashCommand {
  key: string;        // e.g. "/compact"
  label: string;      // display label
  description: string;
  insertText?: string; // text to insert (defaults to key + " ")
  category: 'action' | 'mode' | 'context';
}

export interface MentionItem {
  key: string;        // unique id
  label: string;      // display label
  description?: string;
  type: 'file' | 'session' | 'memory' | 'model';
  insertText: string;  // text to insert after @
}