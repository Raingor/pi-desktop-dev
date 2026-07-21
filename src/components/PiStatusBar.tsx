import React from 'react';
import { useAppStore } from '../stores/appStore';
import { PiStatusIndicator } from './icons';

const PiStatusBar: React.FC = () => {
  const {
    piConnected,
    piMissing,
    piVersion,
    currentModel,
    currentSessionId,
    messages,
  } = useAppStore();

  const piOnline = piConnected && !piMissing;

  return (
    <div
      style={{
        height: 22,
        background: '#007acc',
        color: '#fff',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '0 10px',
        fontSize: 12,
        flexShrink: 0,
        userSelect: 'none',
      }}
    >
      {/* Left side */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
        {/* Pi status */}
        <div style={{ display: 'flex', alignItems: 'center', cursor: 'default' }}>
          <PiStatusIndicator online={piOnline} />
          <span>{piOnline ? `Pi ${piVersion || ''}` : 'Pi Offline'}</span>
        </div>

        {/* Model info */}
        {currentModel && piOnline && (
          <span style={{ opacity: 0.8 }}>
            {currentModel.provider}/{currentModel.modelId}
          </span>
        )}
      </div>

      {/* Right side */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, opacity: 0.8 }}>
        {currentSessionId && (
          <span>
            {messages.length} message{messages.length !== 1 ? 's' : ''}
          </span>
        )}
        <span>Pi Desktop v0.1.0</span>
      </div>
    </div>
  );
};

export default PiStatusBar;
