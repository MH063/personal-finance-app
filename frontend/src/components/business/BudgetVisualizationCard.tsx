import React, { useState, useMemo } from 'react';
import { Card, Row, Col, Progress, Typography, Space, Tooltip, Select, Empty, Tag, List, Divider } from 'antd';
import { 
  InfoCircleOutlined, 
  HistoryOutlined, 
  ArrowRightOutlined,
  WarningOutlined,
  FilterOutlined
} from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import './BudgetVisualizationCard.css';

const { Text, Title } = Typography;
const { Option } = Select;

/**
 * 格式化百分比数值，精确到小数点后两位
 * @param value 百分比数值 (0-100)
 * @returns 格式化后的字符串
 */
const formatPercentage = (value: number): string => {
  return (Math.round(value * 100) / 100).toFixed(2);
};

interface BudgetDetail {
  id: string;
  categoryId: string;
  categoryName: string;
  categoryColor: string;
  amount: number;
  usedAmount: number;
  remainingAmount: number;
  usagePercentage: number;
  startDate: string;
  endDate: string;
}

interface BudgetInfo {
  totalBudget: number;
  usedBudget: number;
  remainingBudget: number;
  usagePercentage: number;
  budgetUsageComparison?: number;
  budgets: BudgetDetail[];
}

interface Category {
  id: string;
  name: string;
}

interface BudgetVisualizationCardProps {
  budgetInfo: BudgetInfo | null;
  categories?: Category[];
  onRangeChange?: (range: string) => void;
  lastUpdated?: string;
}

/**
 * 预算可视化看板组件
 * 提供多维度的预算使用情况分析
 */
const BudgetVisualizationCard: React.FC<BudgetVisualizationCardProps> = ({ 
  budgetInfo, 
  categories = [],
  onRangeChange,
  lastUpdated 
}) => {
  const navigate = useNavigate();
  const [localCategoryId, setLocalCategoryId] = useState<string | undefined>(undefined);

  // 本地过滤和计算逻辑
  const displayData = useMemo(() => {
    if (!budgetInfo) return null;

    // 1. 过滤预算列表
    const filteredBudgets = localCategoryId 
      ? budgetInfo.budgets.filter(b => b.categoryId === localCategoryId)
      : budgetInfo.budgets;

    if (filteredBudgets.length === 0 && localCategoryId) {
      // 如果选择了分类但没有对应预算，返回空状态或全部数据？
      // 根据需求，应当显示过滤后的结果，即使为空
    }

    // 2. 重新计算汇总指标 (仅针对当前模块)
    const totalBudget = filteredBudgets.reduce((sum, b) => sum + b.amount, 0);
    const usedBudget = filteredBudgets.reduce((sum, b) => sum + b.usedAmount, 0);
    const remainingBudget = Math.max(0, totalBudget - usedBudget);
    const usagePercentage = totalBudget > 0 ? (usedBudget / totalBudget) * 100 : 0;

    return {
      ...budgetInfo,
      totalBudget,
      usedBudget,
      remainingBudget,
      usagePercentage,
      budgets: filteredBudgets
    };
  }, [budgetInfo, localCategoryId]);

  // 获取进度条颜色
  const getProgressColor = (percentage: number) => {
    // 剩余百分比 = 100 - 已用百分比
    const remainingPercentage = 100 - percentage;
    if (remainingPercentage > 30) return '#52c41a'; // 绿色
    if (remainingPercentage > 10) return '#faad14'; // 黄色
    return '#ff4d4f'; // 红色
  };

  // 格式化金额
  const formatAmount = (amount: number) => {
    return new Intl.NumberFormat('zh-CN', {
      style: 'currency',
      currency: 'CNY',
      minimumFractionDigits: 2
    }).format(amount);
  };

  if (!displayData || !displayData.budgets || (displayData.budgets.length === 0 && !localCategoryId)) {
    return (
      <Card title="预算执行监控" className="budget-viz-card" variant="borderless">
        <Empty 
          description="暂无活跃预算设置" 
          image={Empty.PRESENTED_IMAGE_SIMPLE}
        >
          <Text type="secondary">在预算管理中设置月度预算，即可实时监控支出进度</Text>
        </Empty>
      </Card>
    );
  }

  return (
    <Card 
      title={
        <Space>
          <span>预算执行监控</span>
          <Tooltip title="基于当前生效的预算设置实时计算。分类筛选仅作用于此模块。">
            <InfoCircleOutlined style={{ color: 'rgba(0,0,0,0.45)', fontSize: 14 }} />
          </Tooltip>
          {localCategoryId && (
            <Tag color="processing">
              已筛选
            </Tag>
          )}
        </Space>
      }
      className="budget-viz-card"
      variant="borderless"
      extra={
        <Space split={<Divider type="vertical" />}>
          <div className="module-filter-wrapper">
            <Select
              placeholder="分类筛选 (仅限此模块)"
              size="small"
              value={localCategoryId}
              style={{ width: 160 }}
              onChange={setLocalCategoryId}
              popupMatchSelectWidth={false}
            >
              <Option value="">全部分类</Option>
              {categories.filter(cat => cat && cat.id).map(cat => (
                <Option key={cat.id} value={cat.id}>{cat.name}</Option>
              ))}
            </Select>
          </div>
          <Select 
            defaultValue="month" 
            size="small" 
            suffixIcon={<FilterOutlined />}
            onChange={onRangeChange}
            style={{ width: 80 }}
          >
            <Option value="week">本周</Option>
            <Option value="month">本月</Option>
            <Option value="quarter">本季</Option>
            <Option value="year">本年</Option>
          </Select>
          <Text type="secondary" style={{ fontSize: '12px' }}>
            <HistoryOutlined /> {lastUpdated || '刚刚'}
          </Text>
        </Space>
      }
    >
      <Row gutter={[32, 24]} align="middle">
        {/* 核心环形进度条 */}
        <Col xs={24} md={8} className="main-progress-col">
          <div className="main-progress-wrapper">
            <Progress
              type="dashboard"
              percent={Number(formatPercentage(displayData.usagePercentage))}
              strokeColor={getProgressColor(displayData.usagePercentage)}
              strokeWidth={10}
              size={200}
              format={() => (
                <div className="progress-center-content">
                  <Text type="secondary" style={{ fontSize: 14 }}>{localCategoryId ? '该类已用' : '总计已用'}</Text>
                  <div className="percentage-text" style={{ color: getProgressColor(displayData.usagePercentage) }}>
                    {formatPercentage(displayData.usagePercentage)}%
                  </div>
                  <Title level={4} style={{ margin: 0 }}>{formatAmount(displayData.usedBudget)}</Title>
                </div>
              )}
            />
            <div className="budget-summary-text">
              <div className="summary-item">
                <Text type="secondary">{localCategoryId ? '该类预算' : '总预算'}</Text>
                <Text strong>{formatAmount(displayData.totalBudget)}</Text>
              </div>
              <div className="summary-item">
                <Text type="secondary">预算剩余</Text>
                <Text strong style={{ color: getProgressColor(displayData.usagePercentage) }}>
                  {formatAmount(displayData.remainingBudget)}
                </Text>
              </div>
            </div>
            {!localCategoryId && displayData.budgetUsageComparison !== undefined && displayData.budgetUsageComparison !== 0 && (
              <div className="comparison-text">
                <Text type="secondary" style={{ fontSize: 12 }}>
                  较上期使用率 {displayData.budgetUsageComparison > 0 ? (
                    <Text type="danger"><ArrowRightOutlined rotate={-45} /> +{formatPercentage(displayData.budgetUsageComparison)}%</Text>
                  ) : (
                    <Text type="success"><ArrowRightOutlined rotate={45} /> {formatPercentage(displayData.budgetUsageComparison)}%</Text>
                  )}
                </Text>
              </div>
            )}
            {displayData.usagePercentage > 90 && (
              <div className="pulse-warning">
                <WarningOutlined /> {localCategoryId ? '该分类' : ''}预算余额不足 10%
              </div>
            )}
          </div>
        </Col>

        {/* 分类预算展示 */}
        <Col xs={24} md={16} className="category-list-col">
          <div className="category-list-header">
            <Space>
              <Text strong>分类预算详情</Text>
              {localCategoryId && <Tag color="blue">当前展示单体分类</Tag>}
            </Space>
            <Text type="secondary" style={{ fontSize: 12 }}>点击分类钻取明细</Text>
          </div>
          {displayData.budgets.length > 0 ? (
            <List
              dataSource={displayData.budgets}
              renderItem={(item) => (
                <List.Item 
                  className="category-budget-item"
                  onClick={() => navigate(`/expense?categoryId=${item.categoryId}`)}
                >
                  <div className="category-budget-content">
                    <div className="category-info">
                      <div className="category-name-row">
                        <Tag color={item.categoryColor || 'blue'}>{item.categoryName}</Tag>
                        <Tooltip title={`周期: ${item.startDate} 至 ${item.endDate}`}>
                          <Text type="secondary" style={{ fontSize: 12 }}>
                            {formatAmount(item.remainingAmount)} 剩余
                          </Text>
                        </Tooltip>
                      </div>
                      <div className="category-amount-row">
                        <Text type="secondary">{formatAmount(item.usedAmount)} / {formatAmount(item.amount)}</Text>
                        <Text strong>{formatPercentage(item.usagePercentage)}%</Text>
                      </div>
                    </div>
                    <Progress 
                      percent={Number(formatPercentage(item.usagePercentage))} 
                      strokeColor={getProgressColor(item.usagePercentage)}
                      size="small"
                      showInfo={false}
                      className="category-progress-bar"
                    />
                  </div>
                  <ArrowRightOutlined className="item-arrow" />
                </List.Item>
              )}
              style={{ maxHeight: 350, overflowY: 'auto' }}
            />
          ) : (
            <Empty description="该分类下暂无生效预算" style={{ marginTop: 40 }} />
          )}
        </Col>
      </Row>
    </Card>
  );
};

export default BudgetVisualizationCard;
