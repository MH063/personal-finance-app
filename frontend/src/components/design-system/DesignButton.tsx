/**
 * Design Button Component
 * 
 * 基于设计系统的统一按钮组件
 */

import React from 'react';
import { Button, ButtonProps } from 'antd';
import type { ButtonType } from 'antd/es/button';
import './DesignButton.css';

type ButtonSize = 'small' | 'middle' | 'large';
type ButtonStyleVariant = 'income' | 'expense' | 'default';

interface DesignButtonProps extends Omit<ButtonProps, 'type' | 'size' | 'variant'> {
  type?: ButtonType;
  size?: ButtonSize;
  variant?: ButtonStyleVariant;
  icon?: React.ReactNode;
  iconPosition?: 'start' | 'end';
}

export const DesignButton: React.FC<DesignButtonProps> = ({
  children,
  type = 'primary',
  size = 'middle',
  variant = 'default',
  icon,
  iconPosition = 'start',
  className = '',
  ...props
}) => {
  const variantClass = variant !== 'default' ? `btn-${variant}` : '';
  const iconClass = iconPosition === 'end' ? 'icon-end' : '';

  return (
    <Button
      className={`design-button ${variantClass} ${iconClass} ${className}`}
      type={type === 'primary' ? 'primary' : undefined}
      size={size}
      icon={icon}
      {...props}
    >
      {children}
    </Button>
  );
};

export default DesignButton;
