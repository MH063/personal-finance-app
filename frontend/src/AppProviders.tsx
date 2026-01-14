import type { FC, ReactNode } from 'react';
import { ConfigProvider, App as AntdApp, theme as antdTheme } from 'antd';
import zhCN from 'antd/locale/zh_CN';
import { DesignSystemProvider } from './components/design-system';

/**
 * Antd 配置提供者
 * 使用设计系统颜色同步 Antd 主题
 */
const AntdConfigProvider: FC<{ children: ReactNode }> = ({ children }) => {
  return (
    <ConfigProvider
      locale={zhCN}
      theme={{
        algorithm: antdTheme.defaultAlgorithm,
        token: {
          colorPrimary: '#6366f1',
          colorInfo: '#6366f1',
          colorSuccess: '#22c55e',
          colorWarning: '#f59e0b',
          colorError: '#ef4444',
          borderRadius: 12,
          fontFamily: '"Inter", "Noto Sans SC", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
          fontSize: 16,
          controlHeight: 40,
          colorBgLayout: 'transparent',
          colorBgContainer: 'transparent',
        },
        components: {
          Button: {
            borderRadiusLG: 12,
            borderRadiusSM: 8,
            controlHeight: 40,
            paddingContentHorizontal: 20,
          },
          Card: {
            borderRadiusLG: 16,
            boxShadowTertiary: 'var(--shadow-sm)',
          },
          Layout: {
            bodyBg: 'transparent',
            headerBg: 'var(--color-bg-elevated)',
            headerHeight: 72,
          },
          Menu: {
            itemBorderRadius: 12,
            itemMarginInline: 8,
          },
          Input: {
            borderRadiusLG: 12,
            controlHeight: 44,
          },
          Select: {
            borderRadiusLG: 12,
            controlHeight: 44,
          },
          Table: {
            borderRadius: 12,
          },
          Modal: {
            borderRadiusLG: 24,
          },
          Tabs: {
            inkBarColor: '#6366f1',
            itemSelectedColor: '#6366f1',
            itemActiveColor: '#6366f1',
          },
        }
      }}
    >
      <AntdApp>
        {children}
      </AntdApp>
    </ConfigProvider>
  );
};

/**
 * 应用全局 Provider 集合
 * 集成 DesignSystemProvider 和 Antd ConfigProvider
 */
export const AppProviders: FC<{ children: ReactNode }> = ({ children }) => {
  return (
    <DesignSystemProvider>
      <AntdConfigProvider>
        {children}
      </AntdConfigProvider>
    </DesignSystemProvider>
  );
};
