import React, { useState } from 'react';
import { Tooltip } from 'antd';
import { useTranslation } from 'react-i18next';
import {
  ChatBubbleIcon,
  HistoryIcon,
  SettingsIcon,
  PiIcon,
} from './icons';
import { useAppStore } from '../stores/appStore';
import { BarChartOutlined, DatabaseOutlined } from '@ant-design/icons';

const ActivityBar: React.FC = () => {
  const { t } = useTranslation();
  const {
    piConnected,
    piMissing,
    activeView,
    setActiveView,
  } = useAppStore();

  const piOnline = piConnected && !piMissing;
  const [hoveredBtn, setHoveredBtn] = useState<string | null>(null);

  const btnBase: React.CSSProperties = {
    width: 36,
    height: 36,
    borderRadius: 10,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    cursor: 'pointer',
    marginBottom: 4,
    transition: 'all 0.2s ease',
    position: 'relative',
  };

  const navBtn = (view: string, icon: React.ReactNode, tooltip: string) => {
    const isActive = activeView === view;
    return (
      <Tooltip key={view} title={tooltip} placement="right">
        <div
          onClick={() => setActiveView(view)}
          onMouseEnter={() => setHoveredBtn(view)}
          onMouseLeave={() => setHoveredBtn(null)}
          style={{
            ...btnBase,
            background: isActive
              ? 'var(--accent-teal-dim)'
              : hoveredBtn === view
                ? 'var(--bg-surface)'
                : 'transparent',
            border: isActive ? '1px solid rgba(0,212,170,0.2)' : 'none',
          }}
        >
          {icon}
          {isActive && (
            <div
              style={{
                position: 'absolute',
                left: -1,
                top: '50%',
                transform: 'translateY(-50%)',
                width: 2,
                height: 20,
                borderRadius: 1,
                background: 'var(--accent-teal)',
                boxShadow: '0 0 6px var(--accent-teal-glow)',
              }}
            />
          )}
        </div>
      </Tooltip>
    );
  };

  return (
    <div
      style={{
        width: 52,
        height: '100%',
        background: 'var(--bg-secondary)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        paddingTop: 12,
        paddingBottom: 12,
        flexShrink: 0,
        userSelect: 'none',
        borderRight: '1px solid var(--border-color)',
      }}
    >
      <Tooltip title={piOnline ? t('activityBar.piOnline') : t('activityBar.piOffline')} placement="right">
        <div
          style={{
            width: 36,
            height: 36,
            borderRadius: 10,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            marginBottom: 16,
            position: 'relative',
            background: piOnline
              ? 'linear-gradient(135deg, rgba(0,212,170,0.15), rgba(124,92,252,0.15))'
              : 'transparent',
            border: piOnline ? '1px solid rgba(0,212,170,0.2)' : 'none',
          }}
        >
          <PiIcon size={20} color={piOnline ? '#00d4aa' : '#5a5a7a'} />
          <div
            style={{
              position: 'absolute',
              bottom: 2,
              right: 2,
              width: 8,
              height: 8,
              borderRadius: '50%',
              background: piOnline ? 'var(--accent-teal)' : 'var(--accent-danger)',
              boxShadow: piOnline ? '0 0 6px var(--accent-teal-glow)' : 'none',
              animation: piOnline ? 'status-pulse 2s ease-in-out infinite' : 'none',
            }}
          />
        </div>
      </Tooltip>

      <div style={{ width: 24, height: 1, background: 'var(--border-color)', marginBottom: 12 }} />

      {navBtn('chat', <ChatBubbleIcon size={18} color={activeView === 'chat' ? 'var(--accent-teal)' : 'var(--text-muted)'} />, t('activityBar.chat'))}
      {navBtn('dashboard', <BarChartOutlined style={{ fontSize: 16, color: activeView === 'dashboard' ? 'var(--accent-teal)' : 'var(--text-muted)' }} />, t('activityBar.dashboard'))}
      {navBtn('sessions', <HistoryIcon size={18} color={activeView === 'sessions' ? 'var(--accent-teal)' : 'var(--text-muted)'} />, t('activityBar.sessions'))}
      {navBtn('memory', <DatabaseOutlined style={{ fontSize: 16, color: activeView === 'memory' ? 'var(--accent-teal)' : 'var(--text-muted)' }} />, t('activityBar.memory'))}

      <div style={{ flex: 1 }} />

      {navBtn('settings', <SettingsIcon size={18} color={activeView === 'settings' ? 'var(--accent-teal)' : 'var(--text-muted)'} />, t('activityBar.settings'))}
    </div>
  );
};

export default ActivityBar;