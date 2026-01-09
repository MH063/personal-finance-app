import ReactDOM from 'react-dom/client';
import { HashRouter } from 'react-router-dom';
import { Provider, useSelector } from 'react-redux';
import { ConfigProvider, App as AntdApp, theme as antdTheme } from 'antd';
import zhCN from 'antd/locale/zh_CN';
import App from './App';
import { store, RootState } from './store';
import ErrorBoundary from './components/common/ErrorBoundary';
import './assets/styles/index.css';

const ConnectedConfigProvider = () => {
  const { darkMode } = useSelector((state: RootState) => state.app);
  
  return (
    <ConfigProvider
      locale={zhCN}
      theme={{
        algorithm: darkMode ? antdTheme.darkAlgorithm : antdTheme.defaultAlgorithm,
        token: {
          colorPrimary: '#1677ff',
          colorInfo: '#1677ff',
          colorSuccess: '#52c41a',
          colorWarning: '#faad14',
          colorError: '#ff4d4f',
          borderRadius: 8,
          fontFamily: '"Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, "Noto Sans", sans-serif',
          fontSize: 14,
          controlHeight: 36,
          colorBgLayout: darkMode ? '#121212' : '#f8f9fa',
          colorBgContainer: darkMode ? '#1e1e1e' : '#ffffff',
        },
        components: {
          Button: {
            borderRadius: 6,
            controlHeight: 38,
            paddingContentHorizontal: 20,
          },
          Card: {
            borderRadiusLG: 12,
            boxShadowTertiary: darkMode ? '0 2px 8px rgba(0,0,0,0.4)' : '0 2px 8px rgba(0,0,0,0.04)',
          },
          Layout: {
            bodyBg: darkMode ? '#121212' : '#f8f9fa',
            headerBg: darkMode ? '#1e1e1e' : '#ffffff',
            headerHeight: 72,
          },
          Menu: {
            itemBorderRadius: 8,
            itemMarginInline: 8,
          }
        }
      }}
    >
      <AntdApp>
        <HashRouter
          future={{
            v7_startTransition: true,
            v7_relativeSplatPath: true,
          }}
        >
          <App />
        </HashRouter>
      </AntdApp>
    </ConfigProvider>
  );
};

ReactDOM.createRoot(document.getElementById('root')!).render(
  <ErrorBoundary>
    <Provider store={store}>
      <ConnectedConfigProvider />
    </Provider>
  </ErrorBoundary>
);

