import React from 'react';
import { useAppStore } from '../stores/appStore';
import ChatWindow from './ChatWindow';
import Sidebar from './Sidebar';
import SettingsPanel from './SettingsPanel';
import ActivityBar from './ActivityBar';
import PiStatusBar from './PiStatusBar';

const AppLayout: React.FC = () => {
  const { sidebarOpen, settingsOpen } = useAppStore();

  return (
    <div
      style={{
        height: '100vh',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        background: '#1e1e1e',
        color: '#cccccc',
      }}
    >
      {/* Main area: ActivityBar + Sidebar + Content */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
        {/* Activity Bar */}
        <ActivityBar />

        {/* Sidebar */}
        {sidebarOpen && (
          <div
            style={{
              width: 280,
              background: '#252526',
              borderRight: '1px solid #2d2d2d',
              display: 'flex',
              flexDirection: 'column',
              overflow: 'hidden',
              flexShrink: 0,
            }}
          >
            <Sidebar />
          </div>
        )}

        {/* Main Content */}
        <div
          style={{
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
            position: 'relative',
            background: '#1e1e1e',
          }}
        >
          {settingsOpen ? <SettingsPanel /> : <ChatWindow />}
        </div>
      </div>

      {/* Status Bar (bottom) */}
      <PiStatusBar />
    </div>
  );
};

export default AppLayout;
