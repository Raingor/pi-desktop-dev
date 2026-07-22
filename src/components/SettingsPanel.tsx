import React from 'react';
import { useTranslation } from 'react-i18next';
import {
  Typography,
  Switch,
  Select,
  Slider,
  Button,
  Space,
  Tag,
  Empty,
} from 'antd';
import {
  CloseOutlined,
  InfoCircleOutlined,
  ReloadOutlined,
} from '@ant-design/icons';
import { useAppStore } from '../stores/appStore';

const { Text, Title } = Typography;

const SettingsPanel: React.FC = () => {
  const { t } = useTranslation();
  const {
    settings,
    updateSettings,
    toggleSettings,
    piVersion,
    piBinaryPath,
    availableModels,
    currentModel,
    setModel,
    loadAvailableModels,
  } = useAppStore();

  const modelsByProvider = React.useMemo(() => {
    const map: Record<string, { value: string; label: string }[]> = {};
    for (const m of availableModels) {
      if (!map[m.provider]) map[m.provider] = [];
      map[m.provider].push({
        value: m.modelId,
        label: m.label || m.modelId,
      });
    }
    return map;
  }, [availableModels]);

  const providerOptions = Object.keys(modelsByProvider).map((p) => ({
    value: p,
    label: p,
  }));

  const currentProvider = currentModel?.provider || providerOptions[0]?.value || '';
  const modelOptions = modelsByProvider[currentProvider] || [];

  return (
    <div
      style={{
        padding: 32,
        maxWidth: 600,
        margin: '0 auto',
        height: '100%',
        overflow: 'auto',
      }}
    >
      {/* Header */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: 32,
        }}
      >
        <div>
          <Title level={4} style={{ margin: 0, color: 'var(--text-primary)', fontWeight: 600 }}>
            {t('settingsPanel.title')}
          </Title>
          <Text style={{ color: 'var(--text-muted)', fontSize: 12, marginTop: 2 }}>
            {t('settingsPanel.subtitle')}
          </Text>
        </div>
        <Button
          icon={<CloseOutlined />}
          onClick={toggleSettings}
          type="text"
          style={{ color: 'var(--text-muted)', borderRadius: 8, width: 32, height: 32 }}
        />
      </div>

      {/* Appearance */}
      <Section title={t('settingsPanel.appearance')}>
        <SettingRow label={t('settingsPanel.theme')}>
          <Select
            value={settings.theme}
            onChange={(value) => updateSettings({ theme: value as 'light' | 'dark' | 'system' })}
            size="small"
            style={{ width: 140 }}
            options={[
              { value: 'light', label: t('settingsPanel.light') },
              { value: 'dark', label: t('settingsPanel.dark') },
              { value: 'system', label: t('settingsPanel.system') },
            ]}
          />
        </SettingRow>
        <SettingRow label={t('settingsPanel.fontSize')}>
          <div style={{ width: 200 }}>
            <Slider
              min={12}
              max={24}
              value={settings.font_size}
              onChange={(value) => updateSettings({ font_size: value })}
            />
          </div>
        </SettingRow>
      </Section>

      <DividerLine />

      {/* Language */}
      <Section title={t('settingsPanel.language')}>
        <SettingRow label={t('settingsPanel.language')}>
          <Select
            value={settings.language || 'en'}
            onChange={(value) => updateSettings({ language: value })}
            size="small"
            style={{ width: 140 }}
            options={[
              { value: 'en', label: 'English' },
              { value: 'zh-CN', label: '简体中文' },
              { value: 'zh-TW', label: '繁體中文' },
              { value: 'ja', label: '日本語' },
            ]}
          />
        </SettingRow>
      </Section>

      <DividerLine />

      {/* Model / Provider */}
      <Section title={t('settingsPanel.modelProvider')}
        extra={
          <Button
            size="small"
            type="text"
            icon={<ReloadOutlined style={{ fontSize: 12 }} />}
            onClick={loadAvailableModels}
            style={{ color: 'var(--text-muted)', borderRadius: 6 }}
          >
            <span style={{ fontSize: 11 }}>{t('common.refresh')}</span>
          </Button>
        }
      >
        {availableModels.length === 0 ? (
          <Empty
            description={<span style={{ color: 'var(--text-muted)' }}>{t('settingsPanel.noModels')}</span>}
            image={Empty.PRESENTED_IMAGE_SIMPLE}
            style={{ margin: '16px 0' }}
          >
            <Text style={{ color: 'var(--text-muted)', fontSize: 12 }}>
              {t('settingsPanel.configureProvider')}{' '}
              <Tag style={{ borderColor: 'var(--border-color)', color: 'var(--accent-teal)' }}>pi /login &lt;provider&gt;</Tag>{' '}
              {t('settingsPanel.inTerminal')}
            </Text>
          </Empty>
        ) : (
          <>
            <SettingRow label={t('settingsPanel.provider')}>
              <Select
                size="small"
                value={currentProvider}
                onChange={(provider) => {
                  const firstModel = modelsByProvider[provider]?.[0]?.value;
                  if (firstModel) setModel(provider, firstModel);
                }}
                style={{ width: 200 }}
                options={providerOptions}
              />
            </SettingRow>
            <SettingRow label={t('settingsPanel.model')}>
              <Select
                size="small"
                value={currentModel?.modelId}
                onChange={(modelId) => setModel(currentProvider, modelId)}
                style={{ width: 200 }}
                options={modelOptions}
              />
            </SettingRow>
          </>
        )}
      </Section>

      <DividerLine />

      {/* Privacy */}
      <Section title={t('settingsPanel.privacy')}>
        <SettingRow
          label={
            <Space size={6}>
              <span>{t('settingsPanel.telemetry')}</span>
              <InfoCircleOutlined
                style={{ color: 'var(--text-muted)', fontSize: 12, cursor: 'help' }}
                title={t('settingsPanel.telemetryTooltip')}
              />
            </Space>
          }
        >
          <Switch
            checked={settings.telemetry_opt_in}
            onChange={(checked) => updateSettings({ telemetry_opt_in: checked })}
          />
        </SettingRow>
      </Section>

      <DividerLine />

      {/* About */}
      <Section title={t('settingsPanel.about')}>
        <AboutRow label={t('settingsPanel.piVersion')} value={piVersion || t('settingsPanel.notFound')} />
        <AboutRow label={t('settingsPanel.binaryPath')} value={piBinaryPath || t('settingsPanel.na')} mono />
        <AboutRow label={t('settingsPanel.appVersion')} value="0.1.0" />
        <div style={{ marginTop: 16 }}>
          <Text style={{ color: 'var(--text-muted)', fontSize: 12, lineHeight: 1.6 }}>
            {t('settingsPanel.aboutDesc')}
          </Text>
        </div>
      </Section>
    </div>
  );
};

// ─── Sub-components ────────────────────────────────────────

const Section: React.FC<{ title: string; children: React.ReactNode; extra?: React.ReactNode }> = ({ title, children, extra }) => (
  <div style={{ marginBottom: 28 }}>
    <div style={{
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: 16,
    }}>
      <Text style={{
        fontSize: 13,
        fontWeight: 600,
        color: 'var(--text-primary)',
        letterSpacing: '0.3px',
      }}>
        {title}
      </Text>
      {extra}
    </div>
    {children}
  </div>
);

const SettingRow: React.FC<{ label: React.ReactNode; children: React.ReactNode }> = ({ label, children }) => (
  <div
    style={{
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      padding: '10px 12px',
      marginBottom: 4,
      borderRadius: 8,
      background: 'var(--bg-secondary)',
      border: '1px solid var(--border-color)',
    }}
  >
    <Text style={{ color: 'var(--text-secondary)', fontSize: 13 }}>{label}</Text>
    {children}
  </div>
);

const AboutRow: React.FC<{ label: string; value: string; mono?: boolean }> = ({ label, value, mono }) => (
  <div style={{
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    padding: '6px 0',
  }}>
    <Text style={{ color: 'var(--text-muted)', fontSize: 12, minWidth: 80 }}>{label}</Text>
    <Tag style={{
      borderColor: 'var(--border-color)',
      color: 'var(--text-secondary)',
      background: 'var(--bg-surface)',
      fontFamily: mono ? 'var(--font-mono)' : undefined,
      fontSize: 11,
    }}>
      {value}
    </Tag>
  </div>
);

const DividerLine: React.FC = () => (
  <div style={{ height: 1, background: 'var(--border-color)', margin: '0 0 28px 0' }} />
);

export default SettingsPanel;