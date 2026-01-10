import React, { useEffect, useState } from 'react';
import { Row, Col, Card, Statistic, List, Typography, Progress, Empty, Button, Tag } from 'antd';
import {
  ArrowUpOutlined,
  ArrowDownOutlined,
  ClockCircleOutlined,
  WarningOutlined,
} from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { useDispatch, useSelector } from 'react-redux';
import ReactECharts from 'echarts-for-react';
import { RootState } from '../../store';
import { fetchOverview, fetchTrend, fetchCategoryStats, fetchFinancialHealth, fetchDebtOverview } from '../../store/slices/statisticsSlice';
import { fetchTransactions } from '../../store/slices/transactionSlice';
import { fetchDebtStatistics } from '../../store/slices/debtSlice';
import './DashboardPage.css';

const { Title, Text } = Typography;

const DashboardPage: React.FC = () => {
  const navigate = useNavigate();
  const dispatch = useDispatch();
  const [navLoading, setNavLoading] = useState<string | null>(null);
  const { overview, chartData, health } = useSelector((state: RootState) => state.statistics);
  const { transactions } = useSelector((state: RootState) => state.transactions);
  const { statistics: debtStats } = useSelector((state: RootState) => state.debts);

  useEffect(() => {
    dispatch(fetchOverview({ timeRange: 'month' }) as any);
    dispatch(fetchTrend({ timeRange: 'month' }) as any);
    dispatch(fetchCategoryStats({ timeRange: 'month' }) as any);
    dispatch(fetchFinancialHealth('month') as any);
    dispatch(fetchDebtOverview() as any);
    dispatch(fetchTransactions({ limit: 5 }) as any);
    dispatch(fetchDebtStatistics() as any);
  }, [dispatch]);

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
      trigger: 'axis',
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
      type: 'category',
      boundaryGap: false,
      axisLine: { lineStyle: { color: splitLineColor } },
      axisLabel: { color: textColor },
      data: chartData.lineChart.income.map((item) => item.date) || [],
    },
    yAxis: { 
      type: 'value',
      axisLabel: { color: textColor },
      splitLine: { lineStyle: { type: 'dashed', color: splitLineColor } }
    },
    series: [
      {
        name: '收入',
        type: 'line',
        smooth: 0.4,
        symbol: 'circle',
        symbolSize: 8,
        data: chartData.lineChart.income.map((item) => item.value) || [],
        itemStyle: { color: '#10b981' },
        areaStyle: {
          color: {
            type: 'linear',
            x: 0, y: 0, x2: 0, y2: 1,
            colorStops: [{ offset: 0, color: 'rgba(16, 185, 129, 0.3)' }, { offset: 1, color: 'rgba(16, 185, 129, 0)' }]
          }
        },
      },
      {
        name: '支出',
        type: 'line',
        smooth: 0.4,
        symbol: 'circle',
        symbolSize: 8,
        data: chartData.lineChart.expense.map((item) => item.value) || [],
        itemStyle: { color: '#ef4444' },
        areaStyle: {
          color: {
            type: 'linear',
            x: 0, y: 0, x2: 0, y2: 1,
            colorStops: [{ offset: 0, color: 'rgba(239, 68, 68, 0.3)' }, { offset: 1, color: 'rgba(239, 68, 68, 0)' }]
          }
        },
      },
    ],
  };

  const pieChartOption = {
    backgroundColor: 'transparent',
    tooltip: { 
      trigger: 'item', 
      formatter: '{b}: {c} ({d}%)',
      backgroundColor: 'rgba(0, 0, 0, 0.7)',
      borderColor: 'rgba(255, 255, 255, 0.2)',
      textStyle: { color: '#fff' }
    },
    legend: { 
      orient: 'vertical', 
      right: 10, 
      top: 'center',
      textStyle: { color: textColor }
    },
    series: [
      {
        type: 'pie',
        radius: ['50%', '80%'],
        avoidLabelOverlap: false,
        label: { show: false },
        data: chartData.pieChart.map((item) => ({
          value: item.value,
          name: item.name,
          itemStyle: { color: item.color || '#6366f1' },
        })),
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
              <Tag color="success">较上月 +12%</Tag>
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
              <Tag color="warning">预算剩余 ¥{((overview?.totalIncome || 0) * 0.8 - (overview?.totalExpense || 0)).toFixed(2)}</Tag>
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

      <Row gutter={[24, 24]} className="chart-grid">
        {/* 图表区域 */}
        <Col xs={24} lg={16}>
          <Card title="收支趋势" className="chart-card" variant="borderless">
            <ReactECharts option={lineChartOption} style={{ height: 350 }} />
          </Card>
        </Col>
        <Col xs={24} lg={8}>
          <Card title="财务健康度" className="health-card" variant="borderless">
            <div className="health-content">
              <Progress
                type="dashboard"
                percent={health?.healthScore || 0}
                strokeColor={{
                  '0%': '#ef4444',
                  '50%': '#f59e0b',
                  '100%': '#10b981',
                }}
                strokeWidth={10}
                size={180}
              />
              <div className="health-info">
                <Title level={4}>{health?.healthLevel || '未知'}</Title>
                <Text type="secondary">建议保持良好的记账习惯，合理规划每一笔开支。</Text>
              </div>
            </div>
          </Card>
        </Col>

        <Col xs={24} lg={12}>
          <Card 
            title="支出分类" 
            className="category-pie-card" 
            variant="borderless"
            extra={<Button type="link" onClick={() => navigate('/statistics')}>查看详情</Button>}
          >
            {chartData.pieChart.length > 0 ? (
              <ReactECharts option={pieChartOption} style={{ height: 300 }} />
            ) : (
              <Empty description="暂无分类数据" image={Empty.PRESENTED_IMAGE_SIMPLE} />
            )}
          </Card>
        </Col>

        <Col xs={24} lg={12}>
          <Card 
            title="最近交易" 
            className="recent-transactions-card" 
            variant="borderless"
            extra={<Button type="link" onClick={() => navigate('/expense')}>查看全部</Button>}
          >
            <List
              dataSource={transactions.slice(0, 5)}
              className="recent-transactions-list"
              renderItem={(item) => (
                <List.Item className="transaction-item">
                  <List.Item.Meta
                    avatar={
                      <div className={`transaction-icon-bg ${item.type}`}>
                        {item.type === 'income' ? <ArrowUpOutlined /> : <ArrowDownOutlined />}
                      </div>
                    }
                    title={<Text strong className="transaction-desc">{item.description || (item.category as any)?.name || '未分类'}</Text>}
                    description={new Date(item.transactionDate).toLocaleDateString()}
                  />
                  <div className="transaction-amount">
                    <Text strong className={`amount-text ${item.type}`}>
                      {item.type === 'income' ? '+' : '-'}¥{item.amount.toLocaleString()}
                    </Text>
                  </div>
                </List.Item>
              )}
            />
          </Card>
        </Col>
      </Row>
    </div>
  );
};

export default DashboardPage;
