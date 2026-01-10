import React, { useEffect } from 'react';
import { Typography, Button, Row, Col, Card, Statistic } from 'antd';
import { PlusOutlined, ArrowUpOutlined, CalendarOutlined, NumberOutlined, PercentageOutlined } from '@ant-design/icons';
import { useDispatch, useSelector } from 'react-redux';
import { RootState } from '../../store';
import { fetchOverview } from '../../store/slices/statisticsSlice';
import TransactionManager from '@components/business/TransactionManager';
import './IncomePage.css';

const { Title, Text } = Typography;

/**
 * 收入管理页面
 */
const IncomePage: React.FC = () => {
  const transactionManagerRef = React.useRef<any>(null);
  const dispatch = useDispatch();
  const { overview } = useSelector((state: RootState) => state.statistics);
  const [addLoading, setAddLoading] = React.useState(false);

  useEffect(() => {
    console.log('[IncomePage] 加载概览数据');
    dispatch(fetchOverview({ timeRange: 'month' }) as any);
  }, [dispatch]);

  const handleAdd = async () => {
    console.log('[IncomePage] 触发添加收入');
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
    <div className="income-page">
      <div className="page-header-section">
        <div className="header-left">
          <Title level={2} className="page-title">收入管理</Title>
          <Text type="secondary">追踪您的收入来源，管理资产增长</Text>
        </div>
        <div className="header-actions">
          <Button 
            type="primary" 
            icon={<PlusOutlined />} 
            onClick={handleAdd}
            size="large"
            className="header-btn income"
            loading={addLoading}
          >
            记一笔收入
          </Button>
        </div>
      </div>

      <Row gutter={[24, 24]} className="stats-row">
        <Col xs={24} sm={12} lg={6}>
          <Card className="stats-card income" variant="borderless">
            <div className="stats-card-icon">
              <ArrowUpOutlined />
            </div>
            <Statistic 
              title="本月总收入" 
              value={overview?.totalIncome || 0} 
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
              title="本月收入笔数" 
              value={overview?.incomeCount || 0} 
              suffix="笔" 
            />
            <div className="stats-card-footer">
              <Text type="secondary">平均每日: {(Number(overview?.incomeCount || 0) / 30).toFixed(1)} 笔</Text>
            </div>
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card className="stats-card category" variant="borderless">
            <div className="stats-card-icon">
              <CalendarOutlined />
            </div>
            <Statistic 
              title="主要收入源" 
              value={overview?.topIncomeCategory || '工资'} 
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
              title="本月结余率" 
              value={overview?.totalIncome ? (((overview.totalIncome - overview.totalExpense) / overview.totalIncome) * 100).toFixed(1) : 0} 
              suffix="%" 
            />
            <div className="stats-card-footer">
              <Text type="secondary">收支平衡状况</Text>
            </div>
          </Card>
        </Col>
      </Row>

      <TransactionManager 
        ref={transactionManagerRef}
        type="income" 
        title="收入明细" 
        themeColor="#10b981" 
        showHeader={false}
      />
    </div>
  );
};

export default IncomePage;
