import React, { useEffect, useMemo, useRef } from 'react';
import { ConfigProvider, theme, App as AntApp } from 'antd';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { useAppStore } from './stores/appStore';
import { usePiConfigStore } from './stores/piConfigStore';
import { onPiEvent, onBinaryMissing, setTrayBadge, showDesktopNotification } from './services/piBridge';
import AppLayout from './components/AppLayout';
import './i18n';
import i18n from './i18n';

const App: React.FC = () => {
  const { settings, initialize, handlePiEvent, unreadCount, markAllRead } = useAppStore();
  const { initialized: piConfigInitialized, init: initPiConfig } = usePiConfigStore();
  const lastNotifiedMsgId = useRef<string | null>(null);

  // Initialize app on mount
  useEffect(() => {
    initialize();

    let isFocused = true;
    const win = getCurrentWindow();
    win.onFocusChanged(({ payload: focused }) => {
      isFocused = focused;
      if (focused) markAllRead();
    }).catch(() => {});

    const unlistenEvent = onPiEvent((event) => {
      handlePiEvent(event);

      // M7: Desktop notification on new assistant message_end if window not focused
      if (event.type === 'message_end' && !isFocused) {
        const msgs = useAppStore.getState().messages;
        const last = msgs[msgs.length - 1];
        if (last && last.role === 'assistant' && last.id !== lastNotifiedMsgId.current && last.content) {
          lastNotifiedMsgId.current = last.id;
          const preview = last.content.slice(0, 120).replace(/[#*`>\-]/g, '').trim();
          showDesktopNotification('Pi · New reply', preview || 'Assistant replied').catch(() => {});
        }
      }
    });

    const unlistenBinary = onBinaryMissing((payload) => {
      console.log('Pi binary missing:', payload.searched);
    });

    return () => {
      unlistenEvent.then((fn) => fn());
      unlistenBinary.then((fn) => fn());
    };
  }, []);

  // M7: Update tray badge whenever unreadCount changes
  useEffect(() => {
    setTrayBadge(unreadCount).catch(() => {});
  }, [unreadCount]);

  // Initialize pi config store
  useEffect(() => {
    if (!piConfigInitialized) {
      initPiConfig();
    }
  }, [piConfigInitialized, initPiConfig]);

  // Determine whether dark mode is active
  const isDark = useMemo(() => {
    if (settings.theme === 'dark') return true;
    if (settings.theme === 'light') return false;
    return window.matchMedia('(prefers-color-scheme: dark)').matches;
  }, [settings.theme]);

  // Apply data-theme attribute to root element
  useEffect(() => {
    const root = document.documentElement;
    const themeAttr = settings.theme === 'system' ? 'system' : isDark ? 'dark' : 'light';
    root.setAttribute('data-theme', themeAttr);
  }, [settings.theme, isDark]);

  // Listen for system theme changes
  useEffect(() => {
    if (settings.theme !== 'system') return;
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const handler = () => {
      document.documentElement.setAttribute('data-theme', 'system');
    };
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, [settings.theme]);

  // Sync language to i18n
  useEffect(() => {
    if (settings.language) {
      i18n.changeLanguage(settings.language);
      localStorage.setItem('pi-desktop-lang', settings.language);
    }
  }, [settings.language]);

  // Determine the Ant Design theme algorithm
  const getAlgorithm = () => {
    if (settings.theme === 'dark') return theme.darkAlgorithm;
    if (settings.theme === 'light') return theme.defaultAlgorithm;
    return window.matchMedia('(prefers-color-scheme: dark)').matches
      ? theme.darkAlgorithm
      : theme.defaultAlgorithm;
  };

  const antThemeTokens = useMemo(() => {
    if (isDark) {
      return {
        colorPrimary: '#00d4aa',
        colorLink: '#00d4aa',
        colorSuccess: '#00d4aa',
        colorWarning: '#ffb84d',
        colorError: '#ff6b6b',
        colorInfo: '#7c5cfc',
        colorBgContainer: '#1a1a2e',
        colorBgElevated: '#252540',
        colorBorder: '#2a2a45',
        colorText: '#e8e8f0',
        colorTextSecondary: '#9898b0',
        colorTextTertiary: '#5a5a7a',
        colorBgTextHover: 'rgba(0, 212, 170, 0.08)',
        colorFillAlter: '#12121a',
        colorSplit: '#2a2a45',
        colorBgSpotlight: '#252540',
        colorTextLightSolid: '#e8e8f0',
      };
    }
    return {
      colorPrimary: '#00b892',
      colorLink: '#00b892',
      colorSuccess: '#00b892',
      colorWarning: '#d4942e',
      colorError: '#e55353',
      colorInfo: '#6b4ce0',
      colorBgContainer: '#ffffff',
      colorBgElevated: '#ffffff',
      colorBorder: '#d0d0d8',
      colorText: '#1a1a2e',
      colorTextSecondary: '#555570',
      colorTextTertiary: '#909098',
      colorBgTextHover: 'rgba(0, 184, 146, 0.08)',
      colorFillAlter: '#f5f5f8',
      colorSplit: '#d0d0d8',
      colorBgSpotlight: '#e4e4ea',
      colorTextLightSolid: '#1a1a2e',
    };
  }, [isDark]);

  const antComponentTokens = useMemo(() => ({
    Button: {
      borderRadius: 6,
      controlHeight: 34,
      colorPrimaryHover: isDark ? '#00e6b8' : '#00d4a0',
      colorPrimaryActive: isDark ? '#00b892' : '#009e7a',
    },
    Input: {
      borderRadius: 8,
      colorBgContainer: isDark ? '#12121a' : '#f5f5f8',
      colorBorder: isDark ? '#2a2a45' : '#d0d0d8',
      colorText: isDark ? '#e8e8f0' : '#1a1a2e',
      colorTextPlaceholder: isDark ? '#5a5a7a' : '#909098',
    },
    Select: {
      borderRadius: 8,
      colorBgContainer: isDark ? '#12121a' : '#f5f5f8',
      colorBorder: isDark ? '#2a2a45' : '#d0d0d8',
      colorText: isDark ? '#e8e8f0' : '#1a1a2e',
      colorTextPlaceholder: isDark ? '#5a5a7a' : '#909098',
    },
    Switch: { colorPrimary: isDark ? '#00d4aa' : '#00b892' },
    Slider: { colorPrimary: isDark ? '#00d4aa' : '#00b892' },
    Collapse: {
      colorBgContainer: 'transparent',
      colorBorder: 'transparent',
      colorText: isDark ? '#e8e8f0' : '#1a1a2e',
      colorTextHeading: isDark ? '#9898b0' : '#555570',
      borderRadius: 6,
      lineType: 'none',
    },
    Tooltip: {
      colorBgSpotlight: isDark ? '#252540' : '#e4e4ea',
      colorTextLightSolid: isDark ? '#e8e8f0' : '#1a1a2e',
      borderRadius: 6,
    },
  }), [isDark]);

  return (
    <ConfigProvider
      theme={{
        algorithm: getAlgorithm(),
        token: {
          fontSize: settings.font_size,
          borderRadius: 8,
          ...antThemeTokens,
        },
        components: antComponentTokens,
      }}
    >
      <AntApp>
        <AppLayout />
      </AntApp>
    </ConfigProvider>
  );
};

export default App;