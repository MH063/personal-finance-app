import React, { useEffect, useState } from 'react';
import { Row, Col, Card, Statistic, Typography, Progress, Button, Tag } from 'antd';
import {
  ArrowUpOutlined,
  ArrowDownOutlined,
  ClockCircleOutlined,
  WarningOutlined,
} from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { useDispatch, useSelector } from 'react-redux';
import SafeChart from '../../components/common/SafeChart';
import { RootState } from '../../store';
import { fetchOverview, fetchTrend, fetchCategoryStats, fetchFinancialHealth, fetchDebtOverview } from '../../store/slices/statisticsSlice';
import { fetchTransactions } from '../../store/slices/transactionSlice';
import { fetchDebtStatistics } from '../../store/slices/debtSlice';
import { fetchCategories } from '../../store/slices/categorySlice';
import { collaborativeService } from '../../services/collaborativeService';
import BudgetVisualizationCard from '../../components/business/BudgetVisualizationCard';
import './DashboardPage.css';

const { Title, Text } = Typography;

const DashboardPage: React.FC = () => {
  const navigate = useNavigate();
  const dispatch = useDispatch();
  const [navLoading, setNavLoading] = useState<string | null>(null);
  const [budgetRange, setBudgetRange] = useState('month');
  const { overview, chartData } = useSelector((state: RootState) => state.statistics);
  const { statistics: debtStats } = useSelector((state: RootState) => state.debts);
  const { categories } = useSelector((state: RootState) => state.categories);
  const { isAuthenticated, user } = useSelector((state: RootState) => state.auth);

  const refreshData = React.useCallback((range: string = 'month') => {
    const token = localStorage.getItem('accessToken');
    if (!token) {
      console.log('[Dashboard] 未认证，跳过刷新');
      return;
    }
    console.log(`[Dashboard] 正在刷新数据 (范围: ${range})...`);
    dispatch(fetchOverview({ timeRange: range }) as any);
    dispatch(fetchTrend({ timeRange: 'last6months' }) as any);
    dispatch(fetchCategoryStats({ timeRange: range }) as any);
    dispatch(fetchFinancialHealth(range) as any);
    dispatch(fetchDebtOverview() as any);
    dispatch(fetchTransactions({ limit: 5 }) as any);
    dispatch(fetchDebtStatistics() as any);
    dispatch(fetchCategories() as any);
  }, [dispatch]);

  useEffect(() => {
    if (!isAuthenticated || !user?.id) return;
    refreshData(budgetRange);
 
    const handleUpdate = (data: any) => {
      console.log('[Dashboard] 监听到实时更新:', data);
      refreshData(budgetRange);
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
  }, [budgetRange, refreshData, isAuthenticated, user?.id]);

  const handleNav = (path: string) => {
    if (navLoading) return;
    setNavLoading(path);
    navigate(path);
  };

  const textColor = 'rgba(255, 255, 255, 0.85)';
  const splitLineColor = 'rgba(255, 255, 255, 0.15)';

  const lineChartOption = {
    backgroundColor: 'transparent',
    tooltip: { 
      trigger: 'axis' as const,
      backgroundColor: 'rgba(0, 0, 0, 0.7)',
      borderColor: 'rgba(255, 255, 255, 0.2)',
      textStyle: { color: '#fff' }
    },
    legend: { 
      data: ['收入', '支出'], 
      bottom: 0, 
      textStyle: { color: textColor }
    },
    grid: { left: '3%', right: '4%', bottom: '15%', top: '10%', containLabel: true },
    xAxis: {
      type: 'category' as const,
      boundaryGap: false,
      axisLine: { lineStyle: { color: splitLineColor } },
      axisLabel: { color: textColor },
      data: Array.isArray(chartData.lineChart.income) ? chartData.lineChart.income.map((item) => item.date) : [],
    },
    yAxis: { 
      type: 'value' as const,
      axisLabel: { color: textColor },
      splitLine: { lineStyle: { type: 'dashed' as const, color: splitLineColor } }
    },
    series: [
      {
        name: '收入',
        type: 'line' as const,
        smooth: true,
        symbol: 'circle' as const,
        symbolSize: 8,
        data: Array.isArray(chartData.lineChart.income) ? chartData.lineChart.income.map((item) => item.value) : [],
        itemStyle: { color: '#10b981' },
        areaStyle: {
          color: {
            type: 'linear' as const,
            x: 0, y: 0, x2: 0, y2: 1,
            colorStops: [{ offset: 0, color: 'rgba(16, 185, 129, 0.3)' }, { offset: 1, color: 'rgba(16, 185, 129, 0)' }]
          }
        },
      },
      {
        name: '支出',
        type: 'line' as const,
        smooth: true,
        symbol: 'circle' as const,
        symbolSize: 8,
        data: Array.isArray(chartData.lineChart.expense) ? chartData.lineChart.expense.map((item) => item.value) : [],
        itemStyle: { color: '#ef4444' },
        areaStyle: {
          color: {
            type: 'linear' as const,
            x: 0, y: 0, x2: 0, y2: 1,
            colorStops: [{ offset: 0, color: 'rgba(239, 68, 68, 0.3)' }, { offset: 1, color: 'rgba(239, 68, 68, 0)' }]
          }
        },
      },
    ],
  };

  return (
    <div className="dashboard-page">
      <div className="page-header-section">
        <div className="header-left">
          <Title level={2} className="page-title">财务仪表盘</Title>
          <Text type="secondary">欢迎回来！这是您的财务状况概览</Text>
        </div>
        <div className="header-actions">
          <Button 
            type="primary" 
            icon={<ArrowUpOutlined />} 
            onClick={() => handleNav('/income')}
            size="large"
            className="header-btn income"
            loading={navLoading === '/income'}
            disabled={!!navLoading && navLoading !== '/income'}
          >
            记收入
          </Button>
          <Button 
            type="primary" 
            danger
            icon={<ArrowDownOutlined />} 
            onClick={() => handleNav('/expense')}
            size="large"
            className="header-btn expense"
            loading={navLoading === '/expense'}
            disabled={!!navLoading && navLoading !== '/expense'}
          >
            记支出
          </Button>
        </div>
      </div>

      <Row gutter={[24, 24]} className="stat-overview-row">
        {/* 顶部统计卡片 */}
        <Col xs={24} sm={12} lg={6}>
          <Card className="overview-card income" variant="borderless">
            <div className="card-icon-wrapper">
              <ArrowUpOutlined />
            </div>
            <Statistic 
              title="本月收入" 
              value={overview?.totalIncome || 0} 
              precision={2} 
              prefix="¥" 
            />
            <div className="card-footer">
              <Tag color={(overview?.incomeComparison || 0) >= 0 ? "success" : "error"}>
                较上月 {(overview?.incomeComparison || 0) >= 0 ? '+' : ''}{(Math.round((overview?.incomeComparison || 0) * 100) / 100).toFixed(2)}%
              </Tag>
            </div>
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card className="overview-card expense" variant="borderless">
            <div className="card-icon-wrapper">
              <ArrowDownOutlined />
            </div>
            <Statistic 
              title="本月支出" 
              value={overview?.totalExpense || 0} 
              precision={2} 
              prefix="¥" 
            />
            <div className="card-footer">
              <Tag color={(overview?.expenseComparison || 0) <= 0 ? "success" : "error"}>
                较上月 {(overview?.expenseComparison || 0) >= 0 ? '+' : ''}{(Math.round((overview?.expenseComparison || 0) * 100) / 100).toFixed(2)}%
              </Tag>
            </div>
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card className="overview-card balance" variant="borderless">
            <div className="card-icon-wrapper">
              <ClockCircleOutlined />
            </div>
            <Statistic 
              title="本月结余" 
              value={(overview?.totalIncome || 0) - (overview?.totalExpense || 0)} 
              precision={2} 
              prefix="¥" 
            />
            <div className="card-footer">
              <Progress 
                percent={Math.round((((overview?.totalIncome || 0) - (overview?.totalExpense || 0)) / (overview?.totalIncome || 1)) * 100)} 
                size="small" 
                status="active" 
                showInfo={false}
                strokeColor="#3b82f6"
              />
            </div>
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card className="overview-card debt" variant="borderless">
            <div className="card-icon-wrapper">
              <WarningOutlined />
            </div>
            <Statistic 
              title="待收/待还" 
              value={debtStats.totalPendingAmount || 0} 
              precision={2} 
              prefix="¥" 
            />
            <div className="card-footer">
              <Text type="secondary">最近更新: {new Date().toLocaleDateString()}</Text>
            </div>
          </Card>
        </Col>
      </Row>
      
      <Row gutter={[24, 24]}>
        <Col span={24}>
          <BudgetVisualizationCard 
            budgetInfo={overview?.budgetInfo} 
            categories={categories}
            lastUpdated={new Date().toLocaleTimeString()}
            onRangeChange={(range) => setBudgetRange(range)}
          />
        </Col>
      </Row>

      <Row gutter={[24, 24]} className="chart-grid">
        {/* 图表区域 */}
        <Col xs={24} lg={24}>
          <Card title="收支趋势" className="chart-card" variant="borderless">
            <SafeChart option={lineChartOption} style={{ height: '350px' }} />
          </Card>
        </Col>
      </Row>
    </div>
  );
};

export default DashboardPage;
