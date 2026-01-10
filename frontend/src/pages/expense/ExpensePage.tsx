import React, { useEffect } from 'react';
import { Typography, Button, Row, Col, Card, Statistic } from 'antd';
import { PlusOutlined, ArrowDownOutlined, NumberOutlined, WalletOutlined, PercentageOutlined } from '@ant-design/icons';
import { useDispatch, useSelector } from 'react-redux';
import { RootState } from '../../store';
import { fetchOverview } from '../../store/slices/statisticsSlice';
import TransactionManager from '@components/business/TransactionManager';
import './ExpensePage.css';

const { Title, Text } = Typography;

/**
 * 支出管理页面
 */
const ExpensePage: React.FC = () => {
  const transactionManagerRef = React.useRef<any>(null);
  const dispatch = useDispatch();
  const { overview } = useSelector((state: RootState) => state.statistics);
  const [addLoading, setAddLoading] = React.useState(false);

  useEffect(() => {
    console.log('[ExpensePage] 加载概览数据');
    dispatch(fetchOverview({ timeRange: 'month' }) as any);
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
              <Text type="secondary">较上月: --</Text>
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
              <Text type="secondary">平均每日: {(Number(overview?.expenseCount || 0) / 30).toFixed(1)} 笔</Text>
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
              value={overview?.topExpenseCategory || '餐饮'} 
              formatter={(val) => <span style={{ fontSize: '18px', fontWeight: 700 }}>{val}</span>}
            />
            <div className="stats-card-footer">
              <Text type="secondary">占比最大来源</Text>
            </div>
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card className="stats-card rate" variant="borderless">
            <div className="stats-card-icon">
              <PercentageOutlined />
            </div>
            <Statistic 
              title="预算消耗" 
              value={overview?.totalIncome ? ((overview.totalExpense / (overview.totalIncome * 0.8)) * 100).toFixed(1) : 0} 
              suffix="%" 
            />
            <div className="stats-card-footer">
              <Text type="secondary">基于收入的 80% 预算</Text>
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
      />
    </div>
  );
};

export default ExpensePage;
