import React, { Suspense, useState, useCallback } from 'react';
import { Tooltip, Button, Spin } from 'antd';
import { LoadingOutlined, MenuUnfoldOutlined } from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import { useAppStore } from '../stores/appStore';
import ChatWindow from './ChatWindow';
import Sidebar from './Sidebar';
import ActivityBar from './ActivityBar';
import PiStatusBar from './PiStatusBar';

// Lazy-load secondary pages to reduce initial bundle size.
// recharts (~200KB) and other heavy deps are only loaded on first visit.
const DashboardPage = React.lazy(() => import('../pages/DashboardPage'));
const SessionsPage = React.lazy(() => import('../pages/SessionsPage'));
const MemoryPage = React.lazy(() => import('../pages/MemoryPage'));
const SettingsPage = React.lazy(() => import('../pages/SettingsPage'));

const PageFallback = () => (
  <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
    <Spin indicator={<LoadingOutlined style={{ fontSize: 24 }} spin />} />
  </div>
);

const AppLayout: React.FC = () => {
  const { t } = useTranslation();
  const { sidebarOpen, sidebarCollapsed, activeView, setSidebarCollapsed } = useAppStore();

  // Track which views have been visited — once mounted, keep them mounted
  // (hidden via CSS) so switching back is instant.
  const [visited, setVisited] = useState<Set<string>>(new Set(['chat']));
  const markVisited = useCallback((view: string) => {
    setVisited((prev) => prev.has(view) ? prev : new Set(prev).add(view));
  }, []);
  React.useEffect(() => { markVisited(activeView); }, [activeView, markVisited]);

  const showSecondary = sidebarOpen && !sidebarCollapsed && activeView === 'chat';

  // Render a secondary page; only mount it if it's been visited or is active.
  const renderLazyPage = (view: string, Comp: React.LazyExoticComponent<React.FC>) => {
    const isMounted = visited.has(view);
    const isActive = activeView === view;
    if (!isMounted && !isActive) return null;
    return (
      <div style={{ display: isActive ? 'flex' : 'none', flex: 1, flexDirection: 'column', overflow: 'hidden' }}>
        <Suspense fallback={<PageFallback />}>
          <Comp />
        </Suspense>
      </div>
    );
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

          {/* ChatWindow is always mounted — switching to other views just hides it,
              so switching back is instant (no remount of heavy message list). */}
          <div style={{ display: activeView === 'chat' ? 'flex' : 'none', flex: 1, flexDirection: 'column', overflow: 'hidden' }}>
            <ChatWindow />
          </div>

          {/* Secondary pages: lazy-loaded, mounted on first visit, then kept alive */}
          {renderLazyPage('dashboard', DashboardPage)}
          {renderLazyPage('sessions', SessionsPage)}
          {renderLazyPage('memory', MemoryPage)}
          {renderLazyPage('settings', SettingsPage)}
        </div>
      </div>

      <PiStatusBar />
    </div>
  );
};

export default AppLayout;
