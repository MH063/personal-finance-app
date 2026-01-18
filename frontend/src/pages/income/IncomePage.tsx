import { useEffect, useRef, useState } from 'react';
import type { FC } from 'react';
import { Typography, Button, Row, Col, Card, Statistic, Progress } from 'antd';
import { PlusOutlined, ArrowUpOutlined, CalendarOutlined, NumberOutlined, PercentageOutlined } from '@ant-design/icons';
import { useDispatch, useSelector } from 'react-redux';
import { RootState } from '@store/index';
import { fetchOverview } from '@store/slices/statisticsSlice';
import { collaborativeService } from '../../services/collaborativeService';
import TransactionManager from '@components/business/TransactionManager';
import './IncomePage.css';

const { Title, Text } = Typography;

/**
 * 收入管理页面
 */
const IncomePage: FC = () => {
  const transactionManagerRef = useRef<any>(null);
  const dispatch = useDispatch();
  const { overview } = useSelector((state: RootState) => state.statistics);
  const [addLoading, setAddLoading] = useState(false);

  useEffect(() => {
    console.log('[IncomePage] 加载概览数据');
    dispatch(fetchOverview({ timeRange: 'month' }) as any);

    // 监听实时更新通知
    const handleUpdate = (data: any) => {
      console.log('[IncomePage] 监听到实时更新:', data);
      // 只要有账本、交易更新，或者重连同步，就刷新
      dispatch(fetchOverview({ timeRange: 'month' }) as any);
    };

    collaborativeService.on('ledgerUpdate', handleUpdate);
  collaborativeService.on('globalUpdate', handleUpdate);

  return () => {
    collaborativeService.off('ledgerUpdate', handleUpdate);
    collaborativeService.off('globalUpdate', handleUpdate);
  };
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

  const handleSuccess = () => {
    console.log('[IncomePage] 交易操作成功，刷新概览数据');
    dispatch(fetchOverview({ timeRange: 'month' }) as any);
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
              <Text type="secondary">较上月: {overview?.incomeComparison !== undefined ? `${overview.incomeComparison >= 0 ? '+' : ''}${overview.incomeComparison}%` : '--'}</Text>
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
              <Text type="secondary">平均每日: {(Number(overview?.incomeCount || 0) / (new Date().getDate())).toFixed(1)} 笔</Text>
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
              value={overview?.topIncomeCategory || '无'} 
              formatter={(val) => <span style={{ fontSize: '18px', fontWeight: 700 }}>{val}</span>}
            />
            <div className="stats-card-footer">
              <Text type="secondary">分类占比: {overview?.topIncomeCategoryPercentage ? `${overview.topIncomeCategoryPercentage}%` : '--'}</Text>
            </div>
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card className="stats-card average" variant="borderless">
            <div className="stats-card-icon">
              <PercentageOutlined />
            </div>
            <Statistic 
              title="储蓄率" 
              value={overview?.totalIncome ? (((overview.totalIncome - overview.totalExpense) / overview.totalIncome) * 100).toFixed(1) : 0} 
              suffix="%" 
              valueStyle={{ color: '#10b981' }}
            />
            <div className="stats-card-footer">
              <Progress 
                percent={Number(overview?.totalIncome ? (((overview.totalIncome - overview.totalExpense) / overview.totalIncome) * 100).toFixed(1) : 0)} 
                size="small" 
                showInfo={false} 
                strokeColor="#10b981" 
              />
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
        onSuccess={handleSuccess}
      />
    </div>
  );
};

export default IncomePage;
