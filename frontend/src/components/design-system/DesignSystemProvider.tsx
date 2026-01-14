import React, { useState, useEffect, useMemo } from 'react';
import designTokens from '../../assets/design-tokens.json';
import { getBestTextColor, getOptimalTextShadow } from '../../utils/colorUtils';
import DesignSystemContext, { ThemeMode } from './DesignSystemContext';

interface DesignSystemProviderProps {
  children: React.ReactNode;
  defaultTheme?: ThemeMode;
}

export function DesignSystemProvider({ 
  children 
}: DesignSystemProviderProps) {
  // 始终保持浅色模式以解决样式冲突
  const [theme] = useState<ThemeMode>('light');

  const isDark = false;

  useEffect(() => {
    // 确保移除 dark-mode 类
    document.documentElement.classList.remove('dark-mode');

    // 动态计算弹窗文字颜色
    const bgColor = theme === 'dark' 
      ? designTokens.theme.dark.color.background.elevated 
      : designTokens.theme.light.color.background.elevated;
    
    const textColor = getBestTextColor(bgColor);
    const textShadow = getOptimalTextShadow(textColor);
    
    const colorValue = textColor === 'white' ? '#ffffff' : '#0f172a';
    const secondaryColorValue = textColor === 'white' ? 'rgba(255, 255, 255, 0.7)' : 'rgba(15, 23, 42, 0.7)';
    const tertiaryColorValue = textColor === 'white' ? 'rgba(255, 255, 255, 0.45)' : 'rgba(15, 23, 42, 0.45)';
    const uiBgValue = textColor === 'white' ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.05)';
    const uiBorderValue = textColor === 'white' ? 'rgba(255, 255, 255, 0.15)' : 'rgba(0, 0, 0, 0.1)';
    const uiHoverBgValue = textColor === 'white' ? 'rgba(255, 255, 255, 0.12)' : 'rgba(0, 0, 0, 0.08)';
    const uiHoverBorderValue = textColor === 'white' ? 'rgba(255, 255, 255, 0.3)' : 'rgba(0, 0, 0, 0.2)';
    
    document.documentElement.style.setProperty('--modal-text-color', colorValue);
    document.documentElement.style.setProperty('--modal-text-secondary', secondaryColorValue);
    document.documentElement.style.setProperty('--modal-text-tertiary', tertiaryColorValue);
    document.documentElement.style.setProperty('--modal-text-shadow', textShadow);
    document.documentElement.style.setProperty('--modal-ui-bg', uiBgValue);
    document.documentElement.style.setProperty('--modal-ui-border', uiBorderValue);
    document.documentElement.style.setProperty('--modal-ui-hover-bg', uiHoverBgValue);
    document.documentElement.style.setProperty('--modal-ui-hover-border', uiHoverBorderValue);
  }, [theme]);

  const value = useMemo(() => ({
    theme,
    setTheme: () => {}, // 禁用主题切换
    toggleTheme: () => {}, // 禁用主题切换
    tokens: designTokens,
    isDark,
  }), [theme, isDark]);

  return (
    <DesignSystemContext.Provider value={value}>
      {children}
    </DesignSystemContext.Provider>
  );
}
