import React, { useEffect, useState } from 'react';
import { Typography, Button, Input, Select, Tag, Space, Modal, message } from 'antd';
import { DownloadOutlined, UploadOutlined, DeleteOutlined, PlusOutlined, SettingOutlined } from '@ant-design/icons';
import { usePiConfigStore } from '../stores/piConfigStore';
import { useAppStore } from '../stores/appStore';
import type { PiConfig } from '../types';

const { Text, Title } = Typography;

const SettingsPage: React.FC = () => {
  const { settings: piSettings, allProviders, allModels, initialized, init, updateSettings, setProviderAuth, removeProviderAuth, importConfig, resetToDefaults } = usePiConfigStore();
  const { settings: appSettings, updateSettings: updateAppSettings } = useAppStore();
  const [newPackage, setNewPackage] = useState('');
  const [apiKeys, setApiKeys] = useState<Record<string, string>>({});
  const [showReset, setShowReset] = useState(false);

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

  if (!piSettings) {
    return (
      <div style={{ padding: 24, height: '100%', overflow: 'auto' }}>
        <Text style={{ color: 'var(--text-muted)' }}>Loading...</Text>
      </div>
    );
  }

  return (
    <div style={{ padding: 24, height: '100%', overflow: 'auto' }}>
      <Title level={4} style={{ color: 'var(--text-primary)', marginBottom: 24 }}>
        <SettingOutlined style={{ marginRight: 8 }} />Pi Configuration
      </Title>

      {/* Appearance - Theme Switcher */}
      <Section title="Appearance">
        <SettingRow label="Theme">
          <Select
            value={appSettings.theme}
            onChange={(value) => updateAppSettings({ theme: value as 'light' | 'dark' | 'system' })}
            size="small"
            style={{ width: 140 }}
            options={[
              { value: 'light', label: '☀️ Light' },
              { value: 'dark', label: '🌙 Dark' },
              { value: 'system', label: '💻 System' },
            ]}
          />
        </SettingRow>
        <SettingRow label="Font Size">
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

      <Section title="Defaults">
        <SettingRow label="Default Provider">
          <Select size="small" value={piSettings.defaultProvider} onChange={(v) => updateSettings({ defaultProvider: v })}
            style={{ width: 200 }} options={providerOptions} placeholder="Select provider" allowClear />
        </SettingRow>
        <SettingRow label="Default Model">
          <Select size="small" value={piSettings.defaultModel} onChange={(v) => updateSettings({ defaultModel: v })}
            style={{ width: 200 }} options={modelOptions} placeholder="Select model" allowClear />
        </SettingRow>
      </Section>

      <DividerLine />

      <Section title="Enabled Models">
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

      <Section title="API Keys">
        {allProviders.filter((p) => p.hasAuth).map((p) => (
          <SettingRow key={p.id} label={p.name}>
            <Space size={8}>
              <Input.Password size="small" placeholder="Enter API key..." value={apiKeys[p.id] ?? ''}
                onChange={(e) => setApiKeys({ ...apiKeys, [p.id]: e.target.value })}
                style={{ width: 200 }} />
              <Button size="small" type="primary" onClick={() => { setProviderAuth(p.id, apiKeys[p.id]); message.success('Key saved'); }}
                style={{ background: 'var(--accent-teal)', borderColor: 'var(--accent-teal)', color: '#0a0a0f' }}>Save</Button>
              <Button size="small" danger onClick={() => { removeProviderAuth(p.id); setApiKeys({ ...apiKeys, [p.id]: '' }); }}>Clear</Button>
            </Space>
          </SettingRow>
        ))}
      </Section>

      <DividerLine />

      <Section title="Packages">
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
            placeholder="e.g. npm:pi-web-switch" style={{ width: 240 }}
            onPressEnter={addPackage} />
          <Button size="small" icon={<PlusOutlined />} onClick={addPackage}
            style={{ color: 'var(--text-muted)', borderRadius: 6 }}>Add</Button>
        </Space>
      </Section>

      <DividerLine />

      <Section title="Import / Export">
        <Space size={12}>
          <Button icon={<DownloadOutlined />} onClick={handleExport} style={{ color: 'var(--text-muted)', borderRadius: 8 }}>Export Config</Button>
          <Button icon={<UploadOutlined />} onClick={handleImport} style={{ color: 'var(--text-muted)', borderRadius: 8 }}>Import Config</Button>
          <Button danger icon={<DeleteOutlined />} onClick={() => setShowReset(true)}
            style={{ borderRadius: 8 }}>Factory Reset</Button>
        </Space>
      </Section>

      <Modal title="Reset to defaults?" open={showReset} onOk={handleReset} onCancel={() => setShowReset(false)}
        okText="Reset" cancelText="Cancel" okButtonProps={{ danger: true }}>
        <Text style={{ color: 'var(--text-secondary)' }}>This will clear all Pi configuration (settings, auth, custom models). This action cannot be undone.</Text>
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