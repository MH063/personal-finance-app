/**
 * Design Theme Switch Component
 * 
 * 基于设计系统的主题切换组件
 */

import React from 'react';
import { Switch, Tooltip } from 'antd';
import { MoonOutlined, SunOutlined } from '@ant-design/icons';
import { useDesignSystem } from './DesignSystemContext';
import './DesignThemeSwitch.css';

interface DesignThemeSwitchProps {
  showLabel?: boolean;
  size?: 'small' | 'default';
}

export const DesignThemeSwitch: React.FC<DesignThemeSwitchProps> = () => {
  // 由于已禁用暗黑模式，此组件不再渲染
  return null;
};

export default DesignThemeSwitch;
