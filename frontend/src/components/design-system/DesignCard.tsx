/**
 * Design Card Component
 * 
 * 基于设计系统的统一卡片组件
 */

import React from 'react';
import { Card, CardProps } from 'antd';
import './DesignCard.css';

interface DesignCardProps extends Omit<CardProps, 'bordered' | 'hoverable'> {
  bordered?: boolean;
  hoverable?: boolean;
  glass?: boolean;
}

export const DesignCard: React.FC<DesignCardProps> = ({
  children,
  className = '',
  glass = false,
  hoverable = false,
  ...props
}) => {
  return (
    <Card
      className={`design-card ${glass ? 'glass-card' : ''} ${className}`}
      hoverable={hoverable}
      {...props}
    >
      {children}
    </Card>
  );
};

export default DesignCard;
