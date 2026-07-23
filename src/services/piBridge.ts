import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import type {
  SessionEntry,
  AppSettings,
  PiEvent,
  BootstrapInfo,
  ContextUsage,
} from '../types';

// ─── Tauri IPC Commands ───────────────────────────────────────

export async function piBootstrap(): Promise<BootstrapInfo> {
  return invoke('pi_bootstrap');
}

export async function piPrompt(message: string, images?: string[]): Promise<void> {
  return invoke('pi_prompt', { message, images: images ?? null });
}

export async function piSteer(message: string, images?: string[]): Promise<void> {
  return invoke('pi_steer', { message, images: images ?? null });
}

export async function piFollowUp(message: string, images?: string[]): Promise<void> {
  return invoke('pi_follow_up', { message, images: images ?? null });
}

export async function piAbort(): Promise<void> {
  return invoke('pi_abort');
}

export async function piAbortRetry(): Promise<void> {
  return invoke('pi_abort_retry');
}

export async function piNewSession(): Promise<{ cancelled: boolean }> {
  return invoke('pi_new_session');
}

export async function piGetState(): Promise<object> {
  return invoke('pi_get_state');
}

export async function piGetMessages(): Promise<object> {
  return invoke('pi_get_messages');
}

/** Fallback: read session file directly from disk */
export async function piReadSessionFile(path: string): Promise<object[]> {
  return invoke('pi_read_session_file', { path });
}

export async function piGetAvailableModels(): Promise<object> {
  return invoke('pi_get_available_models');
}

export async function piSwitchSession(sessionPath: string): Promise<object> {
  return invoke('pi_switch_session', { sessionPath });
}

export async function piSetModel(provider: string, modelId: string): Promise<object> {
  return invoke('pi_set_model', { provider, modelId });
}

export async function piGetSessionStats(): Promise<object> {
  return invoke('pi_get_session_stats');
}

export async function piCompact(): Promise<object> {
  return invoke('pi_compact');
}

// ─── Thinking level / context usage ───────────────────────────

export async function piSetThinkingLevel(level: string): Promise<object> {
  return invoke('pi_set_thinking_level', { level });
}

export async function piGetContextUsage(): Promise<ContextUsage> {
  return invoke('pi_get_context_usage');
}

export async function piListSessions(cwd?: string): Promise<SessionEntry[]> {
  return invoke('pi_list_sessions', { cwd: cwd ?? null });
}

export async function appGetSettings(): Promise<AppSettings> {
  return invoke('app_get_settings');
}

export async function appSetSettings(patch: Partial<AppSettings>): Promise<void> {
  return invoke('app_set_settings', { patch });
}

export async function appTrustCwd(cwd: string, trusted: boolean): Promise<void> {
  return invoke('app_trust_cwd', { cwd, trusted });
}

// ─── M8: Export / Import ───────────────────────────────────────

/** Open a native directory picker dialog. Returns selected path or throws if cancelled. */
export async function pickDirectory(): Promise<string> {
  return invoke('pick_directory');
}

/** List files in a directory. Without query: shallow scan; with query: recursive search (up to 4 levels). Used by @mention file search. */
export async function listDirectoryFiles(path: string, query?: string): Promise<{name: string; type: 'file' | 'directory'; size: number; path: string}[]> {
  return invoke('list_directory_files', { path, query: query ?? null });
}

/** Save export content to a file (uses Tauri dialog + fs). Returns chosen path. */
export async function saveExportFile(defaultName: string, content: string): Promise<string> {
  return invoke('save_export_file', { defaultName, content });
}

/** Pick and import a .jsonl session file into Pi sessions directory. */
export async function importJsonl(filePath: string): Promise<void> {
  return invoke('import_jsonl', { filePath });
}

// ─── M7: Notifications ─────────────────────────────────────────

/** Show a desktop notification (fire-and-forget on the Rust side). */
export async function showDesktopNotification(title: string, body: string): Promise<void> {
  try {
    return invoke('show_notification', { title, body });
  } catch {
    // notification may be unavailable; ignore
  }
}

/** Update the tray icon badge (unread count). 0 clears the badge. */
export async function setTrayBadge(count: number): Promise<void> {
  try {
    return invoke('set_tray_badge', { count });
  } catch {
    // ignore if unsupported
  }
}

// ─── Crash recovery ────────────────────────────────────────────

/** Manually trigger a pi process restart. */
export async function restartPiProcess(): Promise<void> {
  return invoke('pi_restart');
}

// ─── Event Listeners ──────────────────────────────────────────

export function onPiEvent(callback: (event: PiEvent) => void) {
  return listen<PiEvent>('pi:event', (event) => {
    callback(event.payload);
  });
}

export function onProcessDied(callback: (payload: { reason: string; restart_attempt: number }) => void) {
  return listen('pi:process_died', (event) => {
    callback(event.payload as { reason: string; restart_attempt: number });
  });
}

export function onBinaryMissing(callback: (payload: { searched: string[] }) => void) {
  return listen('pi:binary_missing', (event) => {
    callback(event.payload as { searched: string[] });
  });
}