import { invoke } from '@tauri-apps/api/core';
import type {
  PiSettings, PiAuth, PiModelsJson, UsageRangeData,
  MemoryFile, ProjectGroup, UsageRecord, TrashEntry,
  ExternalSession,
} from '../types';

export async function piReadSettings(): Promise<PiSettings> { return invoke('pi_read_settings'); }
export async function piWriteSettings(settings: PiSettings): Promise<void> { return invoke('pi_write_settings', { settings }); }
export async function piReadAuth(): Promise<PiAuth> { return invoke('pi_read_auth'); }
export async function piWriteAuth(auth: PiAuth): Promise<void> { return invoke('pi_write_auth', { auth }); }
export async function piReadModels(): Promise<PiModelsJson> { return invoke('pi_read_models'); }
export async function piWriteModels(models: PiModelsJson): Promise<void> { return invoke('pi_write_models', { models }); }
export async function piListSessionsDetailed(): Promise<ProjectGroup[]> { return invoke('pi_list_sessions_detailed'); }
export async function piDeleteSession(path: string): Promise<boolean> { return invoke('pi_delete_session', { path }); }
export async function piReadMemoryFiles(): Promise<MemoryFile[]> { return invoke('pi_read_memory_files'); }
export async function piReadAllUsage(): Promise<UsageRecord[]> { return invoke('pi_read_all_usage'); }
export async function piGetUsageByRange(fromDate: string, toDate: string): Promise<UsageRangeData> {
  return invoke('pi_get_usage_by_range', { fromDate, toDate });
}

// Trash / Recycle bin
export async function piListTrash(): Promise<TrashEntry[]> { return invoke('pi_list_trash'); }
export async function piRestoreFromTrash(trashPath: string): Promise<boolean> { return invoke('pi_restore_from_trash', { trashPath }); }
export async function piPermanentlyDelete(trashPath: string): Promise<boolean> { return invoke('pi_permanently_delete', { trashPath }); }
export async function piAutoCleanup(): Promise<{ trashed: number; purged: number }> { return invoke('pi_auto_cleanup'); }

// ─── Rename session ────────────────────────────────────────────
export async function piRenameSession(path: string, newName: string): Promise<void> {
  return invoke('pi_rename_session', { path, newName });
}

// ─── Import from other agent tools (opencode / claude code) ────
export async function piListExternalSessions(): Promise<ExternalSession[]> {
  return invoke('pi_list_external_sessions');
}

export async function piImportExternalSession(filePath: string, source: string): Promise<string> {
  return invoke('pi_import_external_session', { filePath, source });
}