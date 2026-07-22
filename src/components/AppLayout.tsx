import React from 'react';
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
  const { sidebarOpen, activeView } = useAppStore();

  const renderView = () => {
    switch (activeView) {
      case 'dashboard': return <DashboardPage />;
      case 'sessions': return <SessionsPage />;
      case 'memory': return <MemoryPage />;
      case 'settings': return <SettingsPage />;
      default: return <ChatWindow />;
    }
  };

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

        {sidebarOpen && activeView === 'chat' && (
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
          {renderView()}
        </div>
      </div>

      <PiStatusBar />
    </div>
  );
};

export default AppLayout;
