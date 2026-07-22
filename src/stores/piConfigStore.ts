import { create } from 'zustand';
import type {
  PiSettings, PiAuth, PiModelsJson, CustomProviderConfig,
  Provider, Model, UsageRangeData,
} from '../types';
import { BUILTIN_PROVIDERS } from '../data/builtin-providers';
import * as pi from '../services/piConfigService';

interface PiConfigState {
  settings: PiSettings | null;
  auth: PiAuth | null;
  modelsJson: PiModelsJson | null;
  allProviders: Provider[];
  allModels: (Model & { providerId: string; providerName: string })[];
  usage: UsageRangeData | null;
  initialized: boolean;
  loading: boolean;
  error: string | null;

  init: () => Promise<void>;
  refreshUsage: (fromDate: string, toDate: string) => Promise<void>;
  updateSettings: (patch: Partial<PiSettings>) => Promise<void>;
  setProviderAuth: (providerId: string, key: string) => Promise<void>;
  removeProviderAuth: (providerId: string) => Promise<void>;
  addCustomProvider: (id: string, cfg: CustomProviderConfig) => Promise<void>;
  removeCustomProvider: (id: string) => Promise<void>;
  updateCustomProvider: (id: string, cfg: Partial<CustomProviderConfig>) => Promise<void>;
  addCustomModel: (providerId: string, model: Model) => Promise<void>;
  updateCustomModel: (providerId: string, modelId: string, patch: Partial<Model>) => Promise<void>;
  removeCustomModel: (providerId: string, modelId: string) => Promise<void>;
  importConfig: (config: { settings: PiSettings; auth: PiAuth; modelsJson: PiModelsJson | null }) => Promise<void>;
  resetToDefaults: () => Promise<void>;
}

function getCustomProviders(modelsJson: PiModelsJson | null): Provider[] {
  if (!modelsJson) return [];
  return Object.entries(modelsJson.providers).map(([id, cfg]) => ({
    id,
    name: id.charAt(0).toUpperCase() + id.slice(1),
    type: 'custom' as const,
    baseUrl: cfg.baseUrl,
    api: cfg.api,
    apiKey: cfg.apiKey,
    compat: cfg.compat,
    hasAuth: !!cfg.apiKey,
    authMethod: (cfg.apiKey ? 'file' : 'none') as 'file' | 'none',
    models: (cfg.models ?? []).map((m) => ({ ...m, enabled: true })),
  }));
}

function mergeProviders(auth: PiAuth | null, customModels: PiModelsJson | null): Provider[] {
  const authMap = auth ?? {};
  const builtins = BUILTIN_PROVIDERS.map((p) => ({
    ...p,
    hasAuth: p.hasAuth || !!authMap[p.id],
    authMethod: authMap[p.id] ? 'file' : p.authMethod,
  }));
  const customs = getCustomProviders(customModels);
  return [...builtins, ...customs];
}

export const usePiConfigStore = create<PiConfigState>((set, get) => ({
  settings: null,
  auth: null,
  modelsJson: null,
  allProviders: [],
  allModels: [],
  usage: null,
  initialized: false,
  loading: true,
  error: null,

  init: async () => {
    set({ loading: true, error: null });
    try {
      const [settings, auth, modelsJson] = await Promise.all([
        pi.piReadSettings(),
        pi.piReadAuth(),
        pi.piReadModels(),
      ]);

      const allProviders = mergeProviders(auth, modelsJson);
      const allModels = allProviders.flatMap((p) =>
        p.models.map((m) => ({ ...m, providerId: p.id, providerName: p.name }))
      );

      set({ settings, auth, modelsJson, allProviders, allModels, initialized: true, loading: false });
    } catch (e: any) {
      set({ error: e.message || 'Failed to load pi config', loading: false, initialized: true });
    }
  },

  refreshUsage: async (fromDate: string, toDate: string) => {
    try {
      set({ loading: true });
      const usage = await pi.piGetUsageByRange(fromDate, toDate);
      set({ usage, loading: false });
    } catch {
      set({ loading: false });
    }
  },

  updateSettings: async (partial) => {
    const { settings } = get();
    if (!settings) return;
    const updated = { ...settings, ...partial };
    try {
      await pi.piWriteSettings(updated);
      set({ settings: updated });
    } catch (e) {
      console.error('Failed to update settings:', e);
    }
  },

  setProviderAuth: async (providerId, key) => {
    const { auth } = get();
    const updated = { ...(auth ?? {}), [providerId]: { type: 'api_key' as const, key } };
    try {
      await pi.piWriteAuth(updated);
      set({ auth: updated });
      const { modelsJson } = get();
      set({ allProviders: mergeProviders(updated, modelsJson) });
    } catch (e) {
      console.error('Failed to set auth:', e);
    }
  },

  removeProviderAuth: async (providerId) => {
    const { auth } = get();
    if (!auth) return;
    const { [providerId]: _, ...rest } = auth;
    try {
      await pi.piWriteAuth(rest);
      set({ auth: rest });
      const { modelsJson } = get();
      set({ allProviders: mergeProviders(rest, modelsJson) });
    } catch (e) {
      console.error('Failed to remove auth:', e);
    }
  },

  addCustomProvider: async (id, cfg) => {
    const { modelsJson } = get();
    if (!modelsJson) return;
    const newProviders = { ...modelsJson.providers, [id]: cfg };
    const updated = { providers: newProviders };
    try {
      await pi.piWriteModels(updated);
      set({ modelsJson: updated });
      const { auth } = get();
      set({ allProviders: mergeProviders(auth, updated) });
    } catch (e) {
      console.error('Failed to add custom provider:', e);
    }
  },

  removeCustomProvider: async (id) => {
    const { modelsJson } = get();
    if (!modelsJson) return;
    const { [id]: _, ...rest } = modelsJson.providers;
    const updated = { providers: rest };
    try {
      await pi.piWriteModels(updated);
      set({ modelsJson: updated });
      const { auth } = get();
      const newAllProviders = mergeProviders(auth, updated);
      const newAllModels = newAllProviders.flatMap((p) =>
        p.models.map((m) => ({ ...m, providerId: p.id, providerName: p.name }))
      );
      set({ allProviders: newAllProviders, allModels: newAllModels });
    } catch (e) {
      console.error('Failed to remove custom provider:', e);
    }
  },

  updateCustomProvider: async (id, patch) => {
    const { modelsJson } = get();
    if (!modelsJson || !modelsJson.providers[id]) return;
    const existing = modelsJson.providers[id];
    const updatedCfg: CustomProviderConfig = {
      ...existing,
      ...patch,
      // Merge models array if provided
      models: patch.models ?? existing.models,
    };
    const updated = { providers: { ...modelsJson.providers, [id]: updatedCfg } };
    try {
      await pi.piWriteModels(updated);
      set({ modelsJson: updated });
      const { auth } = get();
      set({ allProviders: mergeProviders(auth, updated) });
    } catch (e) {
      console.error('Failed to update custom provider:', e);
    }
  },

  addCustomModel: async (providerId, model) => {
    const { modelsJson } = get();
    if (!modelsJson || !modelsJson.providers[providerId]) return;
    const existing = modelsJson.providers[providerId];
    const models = [...(existing.models ?? []), model] as Model[];
    const updatedCfg: CustomProviderConfig = { ...existing, models };
    const updated = { providers: { ...modelsJson.providers, [providerId]: updatedCfg } };
    try {
      await pi.piWriteModels(updated);
      set({ modelsJson: updated });
      const { auth } = get();
      const newAllProviders = mergeProviders(auth, updated);
      const newAllModels = newAllProviders.flatMap((p) =>
        p.models.map((m) => ({ ...m, providerId: p.id, providerName: p.name }))
      );
      set({ allProviders: newAllProviders, allModels: newAllModels });
    } catch (e) {
      console.error('Failed to add custom model:', e);
    }
  },

  updateCustomModel: async (providerId, modelId, patch) => {
    const { modelsJson } = get();
    if (!modelsJson || !modelsJson.providers[providerId]) return;
    const existing = modelsJson.providers[providerId];
    const models = (existing.models ?? []).map((m: any) =>
      m.id === modelId ? { ...m, ...patch } : m
    );
    const updatedCfg: CustomProviderConfig = { ...existing, models };
    const updated = { providers: { ...modelsJson.providers, [providerId]: updatedCfg } };
    try {
      await pi.piWriteModels(updated);
      set({ modelsJson: updated });
      const { auth } = get();
      const newAllProviders = mergeProviders(auth, updated);
      const newAllModels = newAllProviders.flatMap((p) =>
        p.models.map((m) => ({ ...m, providerId: p.id, providerName: p.name }))
      );
      set({ allProviders: newAllProviders, allModels: newAllModels });
    } catch (e) {
      console.error('Failed to update custom model:', e);
    }
  },

  removeCustomModel: async (providerId, modelId) => {
    const { modelsJson } = get();
    if (!modelsJson || !modelsJson.providers[providerId]) return;
    const existing = modelsJson.providers[providerId];
    const models = (existing.models ?? []).filter((m: any) => m.id !== modelId);
    const updatedCfg: CustomProviderConfig = { ...existing, models };
    const updated = { providers: { ...modelsJson.providers, [providerId]: updatedCfg } };
    try {
      await pi.piWriteModels(updated);
      set({ modelsJson: updated });
      const { auth } = get();
      const newAllProviders = mergeProviders(auth, updated);
      const newAllModels = newAllProviders.flatMap((p) =>
        p.models.map((m) => ({ ...m, providerId: p.id, providerName: p.name }))
      );
      set({ allProviders: newAllProviders, allModels: newAllModels });
    } catch (e) {
      console.error('Failed to remove custom model:', e);
    }
  },

  importConfig: async (config) => {
    try {
      await Promise.all([
        pi.piWriteSettings(config.settings),
        pi.piWriteAuth(config.auth),
        pi.piWriteModels(config.modelsJson ?? { providers: {} }),
      ]);
      await get().init();
    } catch (e) {
      console.error('Failed to import config:', e);
    }
  },

  resetToDefaults: async () => {
    try {
      await Promise.all([
        pi.piWriteSettings({}),
        pi.piWriteAuth({}),
        pi.piWriteModels({ providers: {} }),
      ]);
      await get().init();
    } catch (e) {
      console.error('Failed to reset:', e);
    }
  },
}));