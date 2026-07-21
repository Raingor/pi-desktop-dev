import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import type { 
  SessionEntry, 
  AppSettings, 
  PiEvent, 
  BootstrapInfo,
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