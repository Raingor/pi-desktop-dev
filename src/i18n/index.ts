import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import en from './locales/en';
import zhCN from './locales/zh-CN';
import zhTW from './locales/zh-TW';
import ja from './locales/ja';

const savedLang = typeof window !== 'undefined'
  ? localStorage.getItem('pi-desktop-lang') || 'en'
  : 'en';

i18n.use(initReactI18next).init({
  resources: {
    en: { translation: en },
    'zh-CN': { translation: zhCN },
    'zh-TW': { translation: zhTW },
    ja: { translation: ja },
  },
  lng: savedLang,
  fallbackLng: 'en',
  interpolation: { escapeValue: false },
});

export default i18n;