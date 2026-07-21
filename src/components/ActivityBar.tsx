import React from 'react';
import { Tooltip } from 'antd';
import {
  ChatBubbleIcon,
  HistoryIcon,
  SettingsIcon,
  PiIcon,
} from './icons';
import { useAppStore } from '../stores/appStore';

const ActivityBar: React.FC = () => {
  const {
    piConnected,
    piMissing,
    toggleSidebar,
    sidebarOpen,
    toggleSettings,
  } = useAppStore();

  const piOnline = piConnected && !piMissing;

  return (
    <div
      style={{
        width: 48,
        height: '100%',
        background: '#2b2d30',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        paddingTop: 8,
        paddingBottom: 8,
        flexShrink: 0,
        userSelect: 'none',
      }}
    >
      {/* Pi logo / status */}
      <Tooltip title={piOnline ? 'Pi Online' : 'Pi Offline'} placement="right">
        <div
          style={{
            width: 32,
            height: 32,
            borderRadius: 8,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            marginBottom: 16,
            position: 'relative',
          }}
        >
          <PiIcon />
          <div
            style={{
              position: 'absolute',
              bottom: 0,
              right: 0,
              width: 8,
              height: 8,
              borderRadius: '50%',
              background: piOnline ? '#34d399' : '#ef4444',
              border: '2px solid #2b2d30',
            }}
          />
        </div>
      </Tooltip>

      {/* Divider */}
      <div style={{ width: 24, height: 1, background: '#3c3c3f', marginBottom: 8 }} />

      {/* Chat */}
      <Tooltip title="Chat" placement="right">
        <div
          style={{
            width: 32,
            height: 32,
            borderRadius: 6,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
            background: '#3c3c3f',
            marginBottom: 4,
            transition: 'background 0.1s',
          }}
          onMouseEnter={(e) => { e.currentTarget.style.background = '#4a4a4d'; }}
          onMouseLeave={(e) => { e.currentTarget.style.background = '#3c3c3f'; }}
        >
          <ChatBubbleIcon />
        </div>
      </Tooltip>

      {/* Sessions / Sidebar toggle */}
      <Tooltip title={sidebarOpen ? 'Close Sidebar' : 'Sessions'} placement="right">
        <div
          onClick={toggleSidebar}
          style={{
            width: 32,
            height: 32,
            borderRadius: 6,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
            background: sidebarOpen ? '#454548' : 'transparent',
            marginBottom: 4,
            transition: 'background 0.1s',
          }}
          onMouseEnter={(e) => { e.currentTarget.style.background = '#4a4a4d'; }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = sidebarOpen ? '#454548' : 'transparent';
          }}
        >
          <HistoryIcon />
        </div>
      </Tooltip>

      {/* Spacer */}
      <div style={{ flex: 1 }} />

      {/* Settings */}
      <Tooltip title="Settings" placement="right">
        <div
          onClick={toggleSettings}
          style={{
            width: 32,
            height: 32,
            borderRadius: 6,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
            transition: 'background 0.1s',
          }}
          onMouseEnter={(e) => { e.currentTarget.style.background = '#4a4a4d'; }}
          onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
        >
          <SettingsIcon />
        </div>
      </Tooltip>
    </div>
  );
};

export default ActivityBar;
