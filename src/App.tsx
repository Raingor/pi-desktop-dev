import React, { useEffect } from 'react';
import { ConfigProvider, theme, App as AntApp } from 'antd';
import { useAppStore } from './stores/appStore';
import { onPiEvent, onBinaryMissing } from './services/piBridge';
import AppLayout from './components/AppLayout';

const App: React.FC = () => {
  const { settings, initialize, handlePiEvent } = useAppStore();

  // Initialize app on mount
  useEffect(() => {
    initialize();

    // Listen for Pi events
    const unlistenEvent = onPiEvent((event) => {
      handlePiEvent(event);
    });

    const unlistenBinary = onBinaryMissing((payload) => {
      console.log('Pi binary missing:', payload.searched);
    });

    // Listen for settings open event from tray
    // This would be set up via Tauri event listener

    return () => {
      unlistenEvent.then((fn) => fn());
      unlistenBinary.then((fn) => fn());
    };
  }, []);

  // Determine the theme algorithm
  const getAlgorithm = () => {
    if (settings.theme === 'dark') return theme.darkAlgorithm;
    if (settings.theme === 'light') return theme.defaultAlgorithm;
    // 'system' - use system preference
    return window.matchMedia('(prefers-color-scheme: dark)').matches
      ? theme.darkAlgorithm
      : theme.defaultAlgorithm;
  };

  return (
    <ConfigProvider
      theme={{
        algorithm: getAlgorithm(),
        token: {
          fontSize: settings.font_size,
        },
      }}
    >
      <AntApp>
        <AppLayout />
      </AntApp>
    </ConfigProvider>
  );
};

export default App;