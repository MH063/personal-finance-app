/**
 * Design Stat Card Component
 * 
 * 基于设计系统的统计卡片组件
 */

import React from 'react';
import { Statistic } from 'antd';
import { ArrowUpOutlined, ArrowDownOutlined } from '@ant-design/icons';
import './DesignStatCard.css';

interface DesignStatCardProps {
  title: string;
  value: number | string;
  prefix?: string;
  suffix?: string;
  precision?: number;
  trend?: {
    value: number;
    label: string;
  };
  icon?: React.ReactNode;
  variant?: 'income' | 'expense' | 'balance' | 'debt' | 'default';
  loading?: boolean;
}

export const DesignStatCard: React.FC<DesignStatCardProps> = ({
  title,
  value,
  prefix,
  suffix,
  precision = 2,
  trend,
  icon,
  variant = 'default',
  loading = false,
}) => {
  return (
    <div className={`design-stat-card stat-card ${variant}`}>
      {icon && <div className="stat-card-icon">{icon}</div>}
      
      <Statistic
        title={title}
        value={value}
        prefix={prefix}
        suffix={suffix}
        precision={precision}
        loading={loading}
        styles={{
          content: {
            fontWeight: 'var(--font-weight-extrabold)',
            fontSize: 'var(--font-size-2xl)',
          },
        }}
      />
      
      {trend && (
        <div className="stat-card-footer">
          {trend.value >= 0 ? (
            <ArrowUpOutlined style={{ color: 'var(--color-success)' }} />
          ) : (
            <ArrowDownOutlined style={{ color: 'var(--color-error)' }} />
          )}
          <span style={{ 
            color: trend.value >= 0 ? 'var(--color-success)' : 'var(--color-error)' 
          }}>
            {Math.abs(trend.value)}%
          </span>
          <span style={{ color: 'var(--color-text-tertiary)' }}>{trend.label}</span>
        </div>
      )}
    </div>
  );
};

export default DesignStatCard;
