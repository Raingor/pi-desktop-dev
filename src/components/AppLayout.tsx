import React from 'react';
import { Tooltip, Button } from 'antd';
import { MenuUnfoldOutlined } from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import { useAppStore } from '../stores/appStore';
import ChatWindow from './ChatWindow';
import Sidebar from './Sidebar';
import ActivityBar from './ActivityBar';
import PiStatusBar from './PiStatusBar';
import DashboardPage from '../pages/DashboardPage';
import SessionsPage from '../pages/SessionsPage';
import MemoryPage from '../pages/MemoryPage';
import SettingsPage from '../pages/SettingsPage';

const AppLayout: React.FC = () => {
  const { t } = useTranslation();
  const { sidebarOpen, sidebarCollapsed, activeView, setSidebarCollapsed } = useAppStore();

  const renderView = () => {
    switch (activeView) {
      case 'dashboard': return <DashboardPage />;
      case 'sessions': return <SessionsPage />;
      case 'memory': return <MemoryPage />;
      case 'settings': return <SettingsPage />;
      default: return <ChatWindow />;
    }
  };

  const showSecondary = sidebarOpen && !sidebarCollapsed && activeView === 'chat';

  return (
    <div
      style={{
        height: '100vh',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        background: 'var(--bg-primary)',
        color: 'var(--text-primary)',
      }}
    >
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
        <ActivityBar />

        {showSecondary && (
          <div
            style={{
              width: 280,
              background: 'var(--bg-secondary)',
              borderRight: '1px solid var(--border-color)',
              display: 'flex',
              flexDirection: 'column',
              overflow: 'hidden',
              flexShrink: 0,
            }}
          >
            <Sidebar />
          </div>
        )}

        <div
          style={{
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
            position: 'relative',
            background: 'var(--bg-primary)',
          }}
        >
          {/* When sidebar is collapsed in chat view, show a thin expander rail */}
          {!showSecondary && activeView === 'chat' && (
            <div
              style={{
                position: 'absolute',
                top: 8,
                left: 8,
                zIndex: 10,
              }}
            >
              <Tooltip title={t('sidebar.expand')} placement="right">
                <Button
                  size="small"
                  type="text"
                  icon={<MenuUnfoldOutlined style={{ fontSize: 14, color: 'var(--text-muted)' }} />}
                  onClick={() => setSidebarCollapsed(false)}
                  style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border-color)', borderRadius: 6, width: 28, height: 28 }}
                />
              </Tooltip>
            </div>
          )}
          {renderView()}
        </div>
      </div>

      <PiStatusBar />
    </div>
  );
};

export default AppLayout;
