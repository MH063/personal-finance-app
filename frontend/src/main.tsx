import dayjs from 'dayjs';
import 'dayjs/locale/zh-cn';
import localeData from 'dayjs/plugin/localeData';
import ReactDOM from 'react-dom/client';
import { HashRouter } from 'react-router-dom';
import { Provider } from 'react-redux';
import App from './App';
import { store } from './store';
import ErrorBoundary from './components/common/ErrorBoundary';
import './assets/styles/index.css';
import './assets/styles/variable-fonts.css';
import { AppProviders } from './AppProviders';
import { registerSW } from 'virtual:pwa-register';

dayjs.extend(localeData);
dayjs.locale('zh-cn');
console.log('已启用中文日期本地化');

// 注册 PWA Service Worker
const updateSW = registerSW({
  onNeedRefresh() {
    if (confirm('新版本可用，是否立即更新？')) {
      updateSW(true);
    }
  },
  onOfflineReady() {
    console.log('应用已准备好离线使用');
  },
});

const rootElement = document.getElementById('root')!;

// 在开发模式下，为了避免 HMR 导致重复调用 createRoot 的警告，将 root 挂载到 window 对象上
let root: ReactDOM.Root;
if (import.meta.hot) {
  if (!(window as any)._reactRoot) {
    (window as any)._reactRoot = ReactDOM.createRoot(rootElement);
  }
  root = (window as any)._reactRoot;
} else {
  root = ReactDOM.createRoot(rootElement);
}

root.render(
  <ErrorBoundary>
    <Provider store={store}>
      <HashRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <AppProviders>
          <App />
        </AppProviders>
      </HashRouter>
    </Provider>
  </ErrorBoundary>
);
