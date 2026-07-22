import React, { useEffect, useState } from 'react';
import { Typography, Button, Input, Select, Tag, Space, Modal, message, Collapse, Switch, InputNumber } from 'antd';
import { DownloadOutlined, UploadOutlined, DeleteOutlined, PlusOutlined, SettingOutlined, MinusCircleOutlined } from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import { usePiConfigStore } from '../stores/piConfigStore';
import { useAppStore } from '../stores/appStore';
import type { PiConfig, Model, CustomProviderConfig } from '../types';

const { Text, Title } = Typography;

const SettingsPage: React.FC = () => {
  const { t } = useTranslation();
  const {
    settings: piSettings, allProviders, allModels, initialized, init,
    updateSettings, setProviderAuth, removeProviderAuth, importConfig, resetToDefaults,
    addCustomProvider, removeCustomProvider,
    addCustomModel, updateCustomModel, removeCustomModel,
  } = usePiConfigStore();
  const { settings: appSettings, updateSettings: updateAppSettings } = useAppStore();
  const [newPackage, setNewPackage] = useState('');
  const [apiKeys, setApiKeys] = useState<Record<string, string>>({});
  const [showReset, setShowReset] = useState(false);

  // Manage Models panel state.
  const [newProviderId, setNewProviderId] = useState('');
  const [newProviderBaseUrl, setNewProviderBaseUrl] = useState('');
  const [newProviderApi, setNewProviderApi] = useState('openai-completions');
  const [newProviderKey, setNewProviderKey] = useState('');
  const [addingProvider, setAddingProvider] = useState(false);
  const [newModelFor, setNewModelFor] = useState<string | null>(null);
  const [newModelDraft, setNewModelDraft] = useState<Partial<Model>>({ id: '', name: '', contextWindow: 128000, maxTokens: 8192, reasoning: false });

  useEffect(() => {
    if (!initialized) init();
  }, [initialized, init]);

  const providerOptions = allProviders.map((p) => ({ value: p.id, label: p.name }));
  const modelOptions = allModels.map((m) => ({ value: m.id, label: `${m.name || m.id} (${m.providerName})` }));

  const handleExport = () => {
    if (!piSettings) return;
    const config: PiConfig = { settings: piSettings, auth: {}, modelsJson: null };
    const blob = new Blob([JSON.stringify(config, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'pi-config.json';
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleImport = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;
      try {
        const text = await file.text();
        const config = JSON.parse(text) as PiConfig;
        await importConfig(config);
        message.success('Config imported successfully');
      } catch {
        message.error('Failed to import config');
      }
    };
    input.click();
  };

  const handleReset = async () => {
    await resetToDefaults();
    setShowReset(false);
    message.success('Config reset to defaults');
  };

  const addPackage = () => {
    if (!newPackage.trim() || !piSettings) return;
    const list = piSettings.packages ?? [];
    if (!list.includes(newPackage.trim())) {
      updateSettings({ packages: [...list, newPackage.trim()] });
    }
    setNewPackage('');
  };

  // ─── Manage Models handlers ───────────────────────────────
  const handleAddProvider = async () => {
    const id = newProviderId.trim().toLowerCase().replace(/[^a-z0-9-_]/g, '-');
    if (!id) { message.error(t('settingsPage.providerIdRequired')); return; }
    if (allProviders.some((p) => p.id === id)) { message.error(t('settingsPage.providerIdExists')); return; }
    setAddingProvider(true);
    try {
      const cfg: CustomProviderConfig = {
        baseUrl: newProviderBaseUrl.trim() || undefined,
        api: newProviderApi || undefined,
        apiKey: newProviderKey.trim() || undefined,
        models: [],
      };
      await addCustomProvider(id, cfg);
      message.success(t('settingsPage.providerAdded'));
      setNewProviderId(''); setNewProviderBaseUrl(''); setNewProviderApi('openai-completions'); setNewProviderKey('');
    } catch (e) {
      message.error(t('settingsPage.providerAddFailed'));
    } finally {
      setAddingProvider(false);
    }
  };

  const handleRemoveProvider = async (id: string) => {
    Modal.confirm({
      title: t('settingsPage.removeProviderTitle'),
      content: t('settingsPage.removeProviderDesc', { id }),
      okText: t('common.delete'), okButtonProps: { danger: true }, cancelText: t('common.cancel'),
      onOk: async () => {
        try { await removeCustomProvider(id); message.success(t('settingsPage.providerRemoved')); }
        catch { message.error(t('settingsPage.providerRemoveFailed')); }
      },
    });
  };

  const handleAddModel = async (providerId: string) => {
    const id = (newModelDraft.id || '').trim();
    if (!id) { message.error(t('settingsPage.modelIdRequired')); return; }
    const provider = allProviders.find((p) => p.id === providerId);
    if (provider?.models.some((m) => m.id === id)) { message.error(t('settingsPage.modelIdExists')); return; }
    try {
      const model: Model = {
        id,
        name: newModelDraft.name?.trim() || id,
        reasoning: newModelDraft.reasoning ?? false,
        contextWindow: newModelDraft.contextWindow ?? 128000,
        maxTokens: newModelDraft.maxTokens ?? 8192,
        input: ['text'],
        enabled: true,
      };
      await addCustomModel(providerId, model);
      message.success(t('settingsPage.modelAdded'));
      setNewModelDraft({ id: '', name: '', contextWindow: 128000, maxTokens: 8192, reasoning: false });
      setNewModelFor(null);
    } catch {
      message.error(t('settingsPage.modelAddFailed'));
    }
  };

  const handleToggleModelEnabled = async (providerId: string, modelId: string, enabled: boolean) => {
    try { await updateCustomModel(providerId, modelId, { enabled }); }
    catch { message.error(t('settingsPage.modelUpdateFailed')); }
  };

  const handleRemoveModel = async (providerId: string, modelId: string) => {
    try { await removeCustomModel(providerId, modelId); message.success(t('settingsPage.modelRemoved')); }
    catch { message.error(t('settingsPage.modelRemoveFailed')); }
  };

  // Custom providers from the models.json file (excluding builtins).
  const customProviders = allProviders.filter((p) => p.type === 'custom');

  if (!piSettings) {
    return (
      <div style={{ padding: 24, height: '100%', overflow: 'auto' }}>
        <Text style={{ color: 'var(--text-muted)' }}>{t('common.loading')}</Text>
      </div>
    );
  }

  return (
    <div style={{ padding: 24, height: '100%', overflow: 'auto' }}>
      <Title level={4} style={{ color: 'var(--text-primary)', marginBottom: 24 }}>
        <SettingOutlined style={{ marginRight: 8 }} />{t('settingsPage.title')}
      </Title>

      {/* Appearance - Theme Switcher */}
      <Section title={t('settingsPage.appearance')}>
        <SettingRow label={t('settingsPage.theme')}>
          <Select
            value={appSettings.theme}
            onChange={(value) => updateAppSettings({ theme: value as 'light' | 'dark' | 'system' })}
            size="small"
            style={{ width: 140 }}
            options={[
              { value: 'light', label: t('settingsPage.light') },
              { value: 'dark', label: t('settingsPage.dark') },
              { value: 'system', label: t('settingsPage.system') },
            ]}
          />
        </SettingRow>
        <SettingRow label={t('settingsPage.fontSize')}>
          <div style={{ width: 200 }}>
            <Input
              type="number"
              size="small"
              min={12}
              max={24}
              value={appSettings.font_size}
              onChange={(e) => {
                const v = parseInt(e.target.value, 10);
                if (v >= 12 && v <= 24) updateAppSettings({ font_size: v });
              }}
              style={{ width: 80 }}
            />
          </div>
        </SettingRow>
      </Section>

      <DividerLine />

      <Section title={t('settingsPage.defaults')}>
        <SettingRow label={t('settingsPage.defaultProvider')}>
          <Select size="small" value={piSettings.defaultProvider} onChange={(v) => updateSettings({ defaultProvider: v })}
            style={{ width: 200 }} options={providerOptions} placeholder={t('settingsPage.selectProvider')} allowClear />
        </SettingRow>
        <SettingRow label={t('settingsPage.defaultModel')}>
          <Select size="small" value={piSettings.defaultModel} onChange={(v) => updateSettings({ defaultModel: v })}
            style={{ width: 200 }} options={modelOptions} placeholder={t('settingsPage.selectModel')} allowClear />
        </SettingRow>
      </Section>

      <DividerLine />

      <Section title={t('settingsPage.enabledModels')}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {allModels.map((m) => (
            <Tag key={`${m.providerId}/${m.id}`}
              style={{
                borderColor: 'var(--border-color)',
                background: (piSettings.enabledModels ?? []).includes(m.id) ? 'var(--accent-teal-dim)' : 'var(--bg-surface)',
                color: (piSettings.enabledModels ?? []).includes(m.id) ? 'var(--accent-teal)' : 'var(--text-muted)',
                cursor: 'pointer', padding: '2px 8px',
              }}
              onClick={() => {
                const list = piSettings.enabledModels ?? [];
                const idx = list.indexOf(m.id);
                if (idx >= 0) updateSettings({ enabledModels: list.filter((x) => x !== m.id) });
                else updateSettings({ enabledModels: [...list, m.id] });
              }}
            >
              {m.name || m.id}
            </Tag>
          ))}
        </div>
      </Section>

      <DividerLine />

      {/* ─── ZCode-style Manage Models panel ─────────────────── */}
      <Section title={<span><SettingOutlined style={{ marginRight: 6 }} />{t('settingsPage.manageModels')}</span>}>
        <Text style={{ display: 'block', fontSize: 11, color: 'var(--text-muted)', marginBottom: 12 }}>
          {t('settingsPage.manageModelsDesc')}
        </Text>

        {/* Existing custom providers (collapsible, each shows its models) */}
        {customProviders.length > 0 && (
          <Collapse
            size="small"
            style={{ marginBottom: 12, background: 'var(--bg-secondary)', border: '1px solid var(--border-color)', borderRadius: 8 }}
            items={customProviders.map((p) => ({
              key: p.id,
              label: (
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                  <Space size={6}>
                    <Tag color="purple" style={{ margin: 0, fontSize: 9, padding: '0 6px', borderRadius: 4 }}>custom</Tag>
                    <Text style={{ fontSize: 13, color: 'var(--text-primary)', fontWeight: 500 }}>{p.name}</Text>
                    <Text style={{ fontSize: 10, color: 'var(--text-muted)' }}>· {p.models.length} model(s)</Text>
                  </Space>
                  <Button
                    size="small" type="text" danger
                    icon={<DeleteOutlined style={{ fontSize: 12 }} />}
                    onClick={(e) => { e.stopPropagation(); handleRemoveProvider(p.id); }}
                  />
                </div>
              ),
              children: (
                <div>
                  {/* Provider details */}
                  <div style={{ marginBottom: 10, padding: 8, background: 'var(--bg-surface)', borderRadius: 6, fontSize: 11, color: 'var(--text-muted)' }}>
                    <div><Text style={{ color: 'var(--text-secondary)' }}>baseUrl:</Text> {p.baseUrl || '—'}</div>
                    <div><Text style={{ color: 'var(--text-secondary)' }}>api:</Text> {p.api || '—'}</div>
                  </div>
                  {/* Model list */}
                  {p.models.length === 0 ? (
                    <Text style={{ fontSize: 11, color: 'var(--text-muted)' }}>{t('settingsPage.noModelsInProvider')}</Text>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 8 }}>
                      {p.models.map((m) => (
                        <div key={m.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, padding: '6px 8px', background: 'var(--bg-surface)', borderRadius: 6, border: '1px solid var(--border-color)' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0, flex: 1 }}>
                            <Switch size="small" checked={m.enabled !== false} onChange={(v) => handleToggleModelEnabled(p.id, m.id, v)} />
                            <div style={{ minWidth: 0, flex: 1 }}>
                              <Text style={{ fontSize: 12, color: 'var(--text-primary)', display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                {m.name || m.id}
                              </Text>
                              <Text style={{ fontSize: 10, color: 'var(--text-muted)' }}>
                                {m.id} · {m.contextWindow ? `${(m.contextWindow / 1000).toFixed(0)}k ctx` : '—'}{m.reasoning ? ' · reasoning' : ''}
                              </Text>
                            </div>
                          </div>
                          <Button size="small" type="text" danger icon={<MinusCircleOutlined style={{ fontSize: 12 }} />} onClick={() => handleRemoveModel(p.id, m.id)} />
                        </div>
                      ))}
                    </div>
                  )}
                  {/* Add model inline form */}
                  {newModelFor === p.id ? (
                    <div style={{ padding: 8, background: 'var(--bg-surface)', borderRadius: 6, border: '1px solid var(--accent-teal)', display: 'flex', flexDirection: 'column', gap: 6 }}>
                      <Space size={6} wrap>
                        <Input size="small" placeholder={t('settingsPage.modelIdPlaceholder')} value={newModelDraft.id} onChange={(e) => setNewModelDraft({ ...newModelDraft, id: e.target.value })} style={{ width: 180 }} />
                        <Input size="small" placeholder={t('settingsPage.modelNamePlaceholder')} value={newModelDraft.name} onChange={(e) => setNewModelDraft({ ...newModelDraft, name: e.target.value })} style={{ width: 160 }} />
                      </Space>
                      <Space size={6} wrap>
                        <InputNumber size="small" placeholder="ctx" min={1000} value={newModelDraft.contextWindow} onChange={(v) => setNewModelDraft({ ...newModelDraft, contextWindow: v ?? undefined })} style={{ width: 110 }} addonAfter="ctx" />
                        <InputNumber size="small" placeholder="max" min={256} value={newModelDraft.maxTokens} onChange={(v) => setNewModelDraft({ ...newModelDraft, maxTokens: v ?? undefined })} style={{ width: 110 }} addonAfter="max" />
                        <Space size={4}>
                          <Switch size="small" checked={!!newModelDraft.reasoning} onChange={(v) => setNewModelDraft({ ...newModelDraft, reasoning: v })} />
                          <Text style={{ fontSize: 11, color: 'var(--text-muted)' }}>reasoning</Text>
                        </Space>
                      </Space>
                      <Space size={6}>
                        <Button size="small" type="primary" onClick={() => handleAddModel(p.id)}
                          style={{ background: 'var(--accent-teal)', borderColor: 'var(--accent-teal)', color: '#0a0a0f' }}>{t('common.add')}</Button>
                        <Button size="small" onClick={() => { setNewModelFor(null); setNewModelDraft({ id: '', name: '', contextWindow: 128000, maxTokens: 8192, reasoning: false }); }}>{t('common.cancel')}</Button>
                      </Space>
                    </div>
                  ) : (
                    <Button size="small" type="dashed" icon={<PlusOutlined />} onClick={() => { setNewModelFor(p.id); setNewModelDraft({ id: '', name: '', contextWindow: 128000, maxTokens: 8192, reasoning: false }); }}
                      style={{ borderRadius: 6, fontSize: 11 }}>
                      {t('settingsPage.addModel')}
                    </Button>
                  )}
                </div>
              ),
            }))}
          />
        )}

        {/* Add new custom provider form */}
        <div style={{ padding: 12, background: 'var(--bg-secondary)', borderRadius: 8, border: '1px dashed var(--border-color)' }}>
          <Text style={{ display: 'block', fontSize: 12, color: 'var(--text-secondary)', marginBottom: 8, fontWeight: 500 }}>
            <PlusOutlined style={{ marginRight: 6 }} />{t('settingsPage.addCustomProvider')}
          </Text>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <Space size={8} wrap>
              <Input size="small" placeholder={t('settingsPage.providerIdPlaceholder')} value={newProviderId} onChange={(e) => setNewProviderId(e.target.value)} style={{ width: 160 }} />
              <Select size="small" value={newProviderApi} onChange={setNewProviderApi} style={{ width: 200 }}
                options={[
                  { value: 'openai-completions', label: 'openai-completions' },
                  { value: 'anthropic-messages', label: 'anthropic-messages' },
                  { value: 'google-generative-ai', label: 'google-generative-ai' },
                  { value: 'mistral-conversations', label: 'mistral-conversations' },
                ]} />
            </Space>
            <Input size="small" placeholder={t('settingsPage.baseUrlPlaceholder')} value={newProviderBaseUrl} onChange={(e) => setNewProviderBaseUrl(e.target.value)} style={{ width: '100%' }} />
            <Input.Password size="small" placeholder={t('settingsPage.apiKeyPlaceholder')} value={newProviderKey} onChange={(e) => setNewProviderKey(e.target.value)} style={{ width: '100%' }} />
            <Button size="small" type="primary" loading={addingProvider} onClick={handleAddProvider} icon={<PlusOutlined />}
              style={{ alignSelf: 'flex-start', background: 'var(--accent-teal)', borderColor: 'var(--accent-teal)', color: '#0a0a0f' }}>
              {t('settingsPage.addProvider')}
            </Button>
          </div>
        </div>
      </Section>

      <DividerLine />

      <Section title={t('settingsPage.apiKeys')}>
        {allProviders.filter((p) => p.hasAuth).map((p) => (
          <SettingRow key={p.id} label={p.name}>
            <Space size={8}>
              <Input.Password size="small" placeholder={t('settingsPage.enterApiKey')} value={apiKeys[p.id] ?? ''}
                onChange={(e) => setApiKeys({ ...apiKeys, [p.id]: e.target.value })}
                style={{ width: 200 }} />
              <Button size="small" type="primary" onClick={() => { setProviderAuth(p.id, apiKeys[p.id]); message.success(t('settingsPage.keySaved')); }}
                style={{ background: 'var(--accent-teal)', borderColor: 'var(--accent-teal)', color: '#0a0a0f' }}>{t('common.save')}</Button>
              <Button size="small" danger onClick={() => { removeProviderAuth(p.id); setApiKeys({ ...apiKeys, [p.id]: '' }); }}>{t('common.clear')}</Button>
            </Space>
          </SettingRow>
        ))}
      </Section>

      <DividerLine />

      <Section title={t('settingsPage.packages')}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
          {(piSettings.packages ?? []).map((pkg) => (
            <Tag key={pkg} closable onClose={() => updateSettings({ packages: (piSettings.packages ?? []).filter((p) => p !== pkg) })}
              style={{ borderColor: 'var(--border-color)', color: 'var(--text-secondary)', background: 'var(--bg-surface)' }}>
              {pkg}
            </Tag>
          ))}
        </div>
        <Space size={8}>
          <Input size="small" value={newPackage} onChange={(e) => setNewPackage(e.target.value)}
            placeholder={t('settingsPage.packagePlaceholder')} style={{ width: 240 }}
            onPressEnter={addPackage} />
          <Button size="small" icon={<PlusOutlined />} onClick={addPackage}
            style={{ color: 'var(--text-muted)', borderRadius: 6 }}>{t('common.add')}</Button>
        </Space>
      </Section>

      <DividerLine />

      <Section title={t('settingsPage.importExport')}>
        <Space size={12}>
          <Button icon={<DownloadOutlined />} onClick={handleExport} style={{ color: 'var(--text-muted)', borderRadius: 8 }}>{t('settingsPage.exportConfig')}</Button>
          <Button icon={<UploadOutlined />} onClick={handleImport} style={{ color: 'var(--text-muted)', borderRadius: 8 }}>{t('settingsPage.importConfig')}</Button>
          <Button danger icon={<DeleteOutlined />} onClick={() => setShowReset(true)}
            style={{ borderRadius: 8 }}>{t('settingsPage.factoryReset')}</Button>
        </Space>
      </Section>

      <Modal title={t('settingsPage.resetTitle')} open={showReset} onOk={handleReset} onCancel={() => setShowReset(false)}
        okText={t('common.reset')} cancelText={t('common.cancel')} okButtonProps={{ danger: true }}>
        <Text style={{ color: 'var(--text-secondary)' }}>{t('settingsPage.resetDesc')}</Text>
      </Modal>
    </div>
  );
};

const Section: React.FC<{ title: React.ReactNode; children: React.ReactNode }> = ({ title, children }) => (
  <div style={{ marginBottom: 24 }}>
    <Text style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', display: 'block', marginBottom: 12 }}>{title}</Text>
    {children}
  </div>
);

const SettingRow: React.FC<{ label: React.ReactNode; children: React.ReactNode }> = ({ label, children }) => (
  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 12px', marginBottom: 4, borderRadius: 8, background: 'var(--bg-secondary)', border: '1px solid var(--border-color)' }}>
    <Text style={{ color: 'var(--text-secondary)', fontSize: 13 }}>{label}</Text>
    {children}
  </div>
);

const DividerLine: React.FC = () => (
  <div style={{ height: 1, background: 'var(--border-color)', margin: '0 0 24px 0' }} />
);

export default SettingsPage;