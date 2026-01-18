 import { useEffect, useRef, useState } from 'react';
 import type { FC } from 'react';
import { Typography, Button, Row, Col, Card, Statistic, Progress } from 'antd';
import { PlusOutlined, ArrowDownOutlined, NumberOutlined, WalletOutlined, PercentageOutlined } from '@ant-design/icons';
import { useDispatch, useSelector } from 'react-redux';
import { RootState } from '@store/index';
import { fetchOverview } from '@store/slices/statisticsSlice';
import { fetchBudgets } from '@store/slices/budgetSlice';
import { collaborativeService } from '../../services/collaborativeService';
import TransactionManager from '@components/business/TransactionManager';
import './ExpensePage.css';

const { Title, Text } = Typography;

/**
 * 支出管理页面
 */
 const ExpensePage: FC = () => {
  const transactionManagerRef = useRef<any>(null);
  const dispatch = useDispatch();
  const { overview } = useSelector((state: RootState) => state.statistics);
  const { budgets } = useSelector((state: RootState) => state.budgets);
  const [addLoading, setAddLoading] = useState(false);

  useEffect(() => {
    console.log('[ExpensePage] 加载数据');
    dispatch(fetchOverview({ timeRange: 'month' }) as any);
    dispatch(fetchBudgets() as any);

    // 监听实时更新通知
    const handleUpdate = (data: any) => {
      console.log('[ExpensePage] 监听到实时更新:', data);
      // 只要有账本、交易、预算更新，或者重连同步，就刷新
      dispatch(fetchOverview({ timeRange: 'month' }) as any);
      dispatch(fetchBudgets() as any);
    };

    collaborativeService.on('ledgerUpdate', handleUpdate);
    collaborativeService.on('globalUpdate', handleUpdate);
    collaborativeService.on('budgetUpdate', handleUpdate);
    collaborativeService.on('transactionUpdate', handleUpdate);

    return () => {
      collaborativeService.off('ledgerUpdate', handleUpdate);
      collaborativeService.off('globalUpdate', handleUpdate);
      collaborativeService.off('budgetUpdate', handleUpdate);
      collaborativeService.off('transactionUpdate', handleUpdate);
    };
  }, [dispatch]);

  const handleAdd = async () => {
    console.log('[ExpensePage] 触发添加支出');
    if (transactionManagerRef.current) {
      setAddLoading(true);
      try {
        await transactionManagerRef.current.handleAdd();
      } finally {
        setAddLoading(false);
      }
    }
  };

  const handleSuccess = () => {
    console.log('[ExpensePage] 交易操作成功，刷新数据');
    dispatch(fetchOverview({ timeRange: 'month' }) as any);
    dispatch(fetchBudgets() as any);
  };

  // 计算预算执行率
  const totalBudgetAmount = budgets.reduce((sum, b) => sum + Number(b.amount), 0);
  const budgetExecutionRate = totalBudgetAmount > 0 
    ? Math.min(100, (Number(overview?.totalExpense || 0) / totalBudgetAmount) * 100) 
    : 0;

  return (
    <div className="expense-page">
      <div className="page-header-section">
        <div className="header-left">
          <Title level={2} className="page-title">支出管理</Title>
          <Text type="secondary">记录和管理您的日常支出，分析消费习惯</Text>
        </div>
        <div className="header-actions">
          <Button 
            type="primary" 
            icon={<PlusOutlined />} 
            onClick={handleAdd}
            size="large"
            className="header-btn expense"
            loading={addLoading}
          >
            记一笔支出
          </Button>
        </div>
      </div>

      <Row gutter={[24, 24]} className="stats-row">
        <Col xs={24} sm={12} lg={6}>
          <Card className="stats-card expense" variant="borderless">
            <div className="stats-card-icon">
              <ArrowDownOutlined />
            </div>
            <Statistic 
              title="本月总支出" 
              value={overview?.totalExpense || 0} 
              precision={2} 
              prefix="¥" 
            />
            <div className="stats-card-footer">
              <Text type="secondary">较上月: {overview?.expenseComparison !== undefined ? `${overview.expenseComparison >= 0 ? '+' : ''}${overview.expenseComparison}%` : '--'}</Text>
            </div>
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card className="stats-card count" variant="borderless">
            <div className="stats-card-icon">
              <NumberOutlined />
            </div>
            <Statistic 
              title="本月支出笔数" 
              value={overview?.expenseCount || 0} 
              suffix="笔" 
            />
            <div className="stats-card-footer">
              <Text type="secondary">平均每日: {(Number(overview?.expenseCount || 0) / (new Date().getDate())).toFixed(1)} 笔</Text>
            </div>
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card className="stats-card category" variant="borderless">
            <div className="stats-card-icon">
              <WalletOutlined />
            </div>
            <Statistic 
              title="最大开支项" 
              value={overview?.topExpenseCategory || '无'} 
              formatter={(val) => <span style={{ fontSize: '18px', fontWeight: 700 }}>{val}</span>}
            />
            <div className="stats-card-footer">
              <Text type="secondary">分类占比: {overview?.topExpenseCategoryPercentage ? `${overview.topExpenseCategoryPercentage}%` : '--'}</Text>
            </div>
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card className="stats-card average" variant="borderless">
            <div className="stats-card-icon">
              <PercentageOutlined />
            </div>
            <Statistic 
              title="预算执行率" 
              value={budgetExecutionRate} 
              precision={1}
              suffix="%" 
              styles={{ content: { color: budgetExecutionRate > 90 ? '#ef4444' : '#f59e0b' } }}
            />
            <div className="stats-card-footer">
              <Progress 
                percent={Number(budgetExecutionRate.toFixed(1))} 
                size="small" 
                showInfo={false} 
                strokeColor={budgetExecutionRate > 90 ? '#ef4444' : '#f59e0b'} 
              />
            </div>
          </Card>
        </Col>
      </Row>

      <TransactionManager 
        ref={transactionManagerRef}
        type="expense" 
        title="支出明细" 
        themeColor="#ef4444"
        showHeader={false}
        onSuccess={handleSuccess}
      />
    </div>
  );
};

export default ExpensePage;
