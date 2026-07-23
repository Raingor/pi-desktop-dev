import React from 'react';
import { useTranslation } from 'react-i18next';
import { useAppStore } from '../stores/appStore';
import { PiStatusIndicator } from './icons';

const PiStatusBar: React.FC = () => {
  const { t } = useTranslation();
  const {
    piConnected,
    piMissing,
    piVersion,
    currentModel,
    availableModels,
    currentSessionId,
    messages,
  } = useAppStore();

  const piOnline = piConnected && !piMissing;
  const hasValidModel = currentModel?.provider && currentModel?.modelId
    && availableModels.some((m) => m.provider === currentModel.provider && m.modelId === currentModel.modelId);

  return (
    <div
      style={{
        height: 26,
        background: 'linear-gradient(135deg, #0d1117 0%, #161b22 100%)',
        borderTop: '1px solid var(--border-color)',
        color: 'var(--text-secondary)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '0 12px',
        fontSize: 12,
        flexShrink: 0,
        userSelect: 'none',
        fontFamily: 'var(--font-sans)',
      }}
    >
      {/* Left side */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
        {/* Pi status */}
        <div style={{ display: 'flex', alignItems: 'center', cursor: 'default', gap: 6 }}>
          <PiStatusIndicator online={piOnline} />
          <span style={{
            color: piOnline ? 'var(--accent-teal)' : 'var(--text-muted)',
            fontWeight: 500,
            fontSize: 11,
          }}>
            {piOnline ? t('statusBar.piVersion', { version: piVersion || '' }) : t('statusBar.piOffline')}
          </span>
        </div>

        {/* Model info */}
        {hasValidModel && piOnline && (
          <span style={{
            opacity: 0.7,
            fontSize: 11,
            padding: '1px 8px',
            borderRadius: 4,
            background: 'var(--bg-surface)',
            border: '1px solid var(--border-color)',
          }}>
            {currentModel.provider}/{currentModel.modelId}
          </span>
        )}
      </div>

      {/* Right side */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, opacity: 0.7, fontSize: 11 }}>
        {currentSessionId && (
          <span>
            {t('common.messages', { count: messages.length })}
          </span>
        )}
        <span>{t('statusBar.appVersion')}</span>
      </div>
    </div>
  );
};

export default PiStatusBar;
