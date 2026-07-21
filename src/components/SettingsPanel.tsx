import React from 'react';
import {
  Typography,
  Switch,
  Select,
  Slider,
  Button,
  Space,
  Divider,
  Tag,
  Empty,
} from 'antd';
import {
  CloseOutlined,
  SettingOutlined,
  InfoCircleOutlined,
  ReloadOutlined,
} from '@ant-design/icons';
import { useAppStore } from '../stores/appStore';

const { Text, Title } = Typography;

const SettingsPanel: React.FC = () => {
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

  // Group models by provider
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
        padding: 24,
        maxWidth: 600,
        margin: '0 auto',
        height: '100%',
        overflow: 'auto',
      }}
    >
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: 24,
        }}
      >
        <Title level={4} style={{ margin: 0 }}>
          <SettingOutlined style={{ marginRight: 8 }} />
          Settings
        </Title>
        <Button
          icon={<CloseOutlined />}
          onClick={toggleSettings}
          type="text"
        />
      </div>

      {/* Appearance */}
      <div style={{ marginBottom: 24 }}>
        <Title level={5}>Appearance</Title>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: 12,
          }}
        >
          <Text>Theme</Text>
          <Select
            value={settings.theme}
            onChange={(value) => updateSettings({ theme: value as 'light' | 'dark' | 'system' })}
            style={{ width: 140 }}
            options={[
              { value: 'light', label: 'Light' },
              { value: 'dark', label: 'Dark' },
              { value: 'system', label: 'System' },
            ]}
          />
        </div>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <Text>Font Size</Text>
          <div style={{ width: 200 }}>
            <Slider
              min={12}
              max={24}
              value={settings.font_size}
              onChange={(value) => updateSettings({ font_size: value })}
            />
          </div>
        </div>
      </div>

      <Divider />

      {/* Model / Provider */}
      <div style={{ marginBottom: 24 }}>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <Title level={5} style={{ margin: 0, marginBottom: 12 }}>
            Model & Provider
          </Title>
          <Button
            size="small"
            icon={<ReloadOutlined />}
            onClick={loadAvailableModels}
          >
            Refresh
          </Button>
        </div>

        {availableModels.length === 0 ? (
          <Empty
            description="No models available"
            image={Empty.PRESENTED_IMAGE_SIMPLE}
            style={{ margin: '12px 0' }}
          >
            <Text type="secondary" style={{ fontSize: 12 }}>
              Configure a provider in Pi first: run{' '}
              <Tag>pi /login &lt;provider&gt;</Tag> in your terminal
            </Text>
          </Empty>
        ) : (
          <>
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: 12,
              }}
            >
              <Text>Provider</Text>
              <Select
                value={currentProvider}
                onChange={(provider) => {
                  const firstModel = modelsByProvider[provider]?.[0]?.value;
                  if (firstModel) {
                    setModel(provider, firstModel);
                  }
                }}
                style={{ width: 200 }}
                options={providerOptions}
              />
            </div>
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
              }}
            >
              <Text>Model</Text>
              <Select
                value={currentModel?.modelId}
                onChange={(modelId) => setModel(currentProvider, modelId)}
                style={{ width: 200 }}
                options={modelOptions}
              />
            </div>
          </>
        )}
      </div>

      <Divider />

      {/* Privacy */}
      <div style={{ marginBottom: 24 }}>
        <Title level={5}>Privacy</Title>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <Space>
            <Text>Telemetry</Text>
            <InfoCircleOutlined
              style={{ color: '#999', cursor: 'help' }}
              title="Anonymous usage data to improve the product"
            />
          </Space>
          <Switch
            checked={settings.telemetry_opt_in}
            onChange={(checked) =>
              updateSettings({ telemetry_opt_in: checked })
            }
          />
        </div>
      </div>

      <Divider />

      {/* About */}
      <div>
        <Title level={5}>About</Title>
        <div style={{ marginBottom: 8 }}>
          <Text type="secondary">Pi Version: </Text>
          <Tag>{piVersion || 'Not found'}</Tag>
        </div>
        <div style={{ marginBottom: 8 }}>
          <Text type="secondary">Binary Path: </Text>
          <Text code style={{ fontSize: 12 }}>
            {piBinaryPath || 'N/A'}
          </Text>
        </div>
        <div style={{ marginBottom: 8 }}>
          <Text type="secondary">App Version: </Text>
          <Tag>0.1.0</Tag>
        </div>
        <div style={{ marginTop: 16 }}>
          <Text type="secondary" style={{ fontSize: 12 }}>
            Pi Desktop is a GUI client for the Pi-Agent coding agent.
          </Text>
        </div>
      </div>
    </div>
  );
};

export default SettingsPanel;