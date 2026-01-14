/**
 * Design System Context
 * 
 * 提供设计令牌和主题管理功能
 */

import { createContext, useContext } from 'react';
import designTokens from '../../assets/design-tokens.json';

export type ThemeMode = 'light' | 'dark';

export interface DesignSystemContextType {
  theme: ThemeMode;
  setTheme: (theme: ThemeMode) => void;
  toggleTheme: () => void;
  tokens: typeof designTokens;
  isDark: boolean;
}

const DesignSystemContext = createContext<DesignSystemContextType | undefined>(undefined);

export function useDesignSystem() {
  const context = useContext(DesignSystemContext);
  if (!context) {
    throw new Error('useDesignSystem must be used within DesignSystemProvider');
  }
  return context;
}

export default DesignSystemContext;
