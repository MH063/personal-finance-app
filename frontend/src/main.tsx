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

/**
 * 过滤 React 在开发环境中针对 findDOMNode 的废弃警告
 * 说明：
 * - 某些第三方组件（如 rc-motion / rc-resize-observer 等）在 React 18 环境下仍可能触发
 *   “findDOMNode is deprecated” 警告，这在严格模式或开发环境中会频繁出现；
 * - 为避免噪声影响调试体验，这里在开发模式下拦截并忽略这类特定警告；
 * - 仅过滤该警告，不影响其他重要日志输出；
 */
function filterReactFindDomNodeWarnings() {
  if (import.meta.env.DEV) {
    const originalWarn = console.warn.bind(console);
    const pattern = /findDOMNode is deprecated/i;
    const patternLink = /reactjs\.org\/link\/strict-mode-find-node/i;
    console.warn = (...args: any[]) => {
      const first = args[0];
      if (typeof first === 'string' && (pattern.test(first) || patternLink.test(first))) {
        return;
      }
      originalWarn(...args);
    };
  }
}
filterReactFindDomNodeWarnings();

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
