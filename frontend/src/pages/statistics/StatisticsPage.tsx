import React, { useEffect, useState } from 'react';
import { Card, Row, Col, Select, DatePicker, Button, Statistic, Progress, List, Tag, Typography, Space, App as AntdApp } from 'antd';
import { ArrowUpOutlined, ArrowDownOutlined, DownloadOutlined, DollarOutlined, ClockCircleOutlined, AccountBookOutlined } from '@ant-design/icons';
import ReactECharts from 'echarts-for-react';
import { useDispatch, useSelector } from 'react-redux';
import { useNavigate } from 'react-router-dom';
import dayjs from 'dayjs';
import { RootState, AppDispatch } from '../../store';
import { fetchOverview, fetchTrend, fetchFinancialHealth } from '../../store/slices/statisticsSlice';
import './StatisticsPage.css';

const { Title, Text } = Typography;
const { RangePicker } = DatePicker;
const { Option } = Select;

const StatisticsPage: React.FC = () => {
  const [timeRange, setTimeRange] = useState('month');
  const [customRange, setCustomRange] = useState<[dayjs.Dayjs, dayjs.Dayjs] | null>(null);

  const dispatch = useDispatch<AppDispatch>();
  const navigate = useNavigate();
  const { overview, health } = useSelector((state: RootState) => state.statistics);
  const { message } = AntdApp.useApp();

  useEffect(() => {
    const loadData = () => {
      const query: any = { timeRange };
      if (timeRange === 'custom') {
        if (!customRange) return;
        query.startDate = customRange[0].format('YYYY-MM-DD');
        query.endDate = customRange[1].format('YYYY-MM-DD');
      }
      dispatch(fetchOverview(query) as any);
      dispatch(fetchTrend(query) as any);
      dispatch(fetchFinancialHealth(timeRange === 'month' ? 'month' : timeRange === 'year' ? 'year' : 'quarter') as any);
    };

    loadData();
  }, [dispatch, timeRange, customRange]);

  const handleQuickAdd = (type: 'income' | 'expense') => {
    navigate(`/${type}`);
  };

  const lineChartOption = {
    tooltip: { 
      trigger: 'axis',
      backgroundColor: 'rgba(255, 255, 255, 0.9)',
      borderWidth: 0,
      shadowBlur: 10,
      shadowColor: 'rgba(0,0,0,0.1)',
      textStyle: { color: '#1e293b' }
    },
    legend: { 
      data: ['收入', '支出'], 
      bottom: 0,
      itemGap: 20,
      icon: 'circle'
    },
    grid: { left: '3%', right: '4%', bottom: '15%', top: '10%', containLabel: true },
    xAxis: {
      type: 'category', 
      data: overview?.monthlyTrends?.map((t: any) => t.month) || [],
      axisLine: { lineStyle: { color: '#e2e8f0' } },
      axisLabel: { color: '#64748b' }
    },
    yAxis: { 
      type: 'value',
      splitLine: { lineStyle: { type: 'dashed', color: '#f1f5f9' } },
      axisLabel: { color: '#64748b' }
    },
    series: [
      { 
        name: '收入', 
        type: 'bar', 
        barWidth: '20%',
        data: overview?.monthlyTrends?.map((t: any) => t.income) || [], 
        itemStyle: { 
          color: '#10b981',
          borderRadius: [4, 4, 0, 0]
        } 
      },
      { 
        name: '支出', 
        type: 'bar', 
        barWidth: '20%',
        data: overview?.monthlyTrends?.map((t: any) => t.expense) || [], 
        itemStyle: { 
          color: '#ef4444',
          borderRadius: [4, 4, 0, 0]
        } 
      },
    ],
  };

  const pieChartOption = {
    tooltip: { trigger: 'item' },
    legend: { orient: 'vertical', right: 10, top: 'center', icon: 'circle' },
    series: [{
      type: 'pie',
      radius: ['50%', '80%'],
      avoidLabelOverlap: false,
      itemStyle: {
        borderRadius: 10,
        borderColor: '#fff',
        borderWidth: 2
      },
      label: { show: false },
      emphasis: {
        label: {
          show: true,
          fontSize: '16',
          fontWeight: 'bold'
        }
      },
      data: overview?.categoryBreakdown?.map((cat: any) => ({
        value: cat.amount,
        name: cat.categoryName,
        itemStyle: { color: cat.categoryColor },
      })) || [],
    }],
  };

  const trendChartOption = {
    tooltip: { trigger: 'axis' },
    legend: { data: ['结余'], bottom: 0, icon: 'circle' },
    grid: { left: '3%', right: '4%', bottom: '15%', top: '10%', containLabel: true },
    xAxis: { 
      type: 'category', 
      data: overview?.monthlyTrends?.map((t: any) => t.month) || [],
      axisLine: { lineStyle: { color: '#e2e8f0' } }
    },
    yAxis: { 
      type: 'value',
      splitLine: { lineStyle: { type: 'dashed', color: '#f1f5f9' } }
    },
    series: [{ 
      name: '结余', 
      type: 'line', 
      smooth: true, 
      symbol: 'circle',
      symbolSize: 8,
      data: overview?.monthlyTrends?.map((t: any) => t.netIncome) || [], 
      itemStyle: { color: '#6366f1' }, 
      lineStyle: { width: 4 },
      areaStyle: { 
        color: {
          type: 'linear',
          x: 0, y: 0, x2: 0, y2: 1,
          colorStops: [
            { offset: 0, color: 'rgba(99, 102, 241, 0.3)' },
            { offset: 1, color: 'rgba(99, 102, 241, 0)' }
          ]
        } 
      } 
    }],
  };

  const handleExport = (format: string) => {
    message.info(`正在导出${format}格式报表...`);
  };

  return (
    <div className="statistics-page">
      <div className="page-header-section">
        <div className="header-left">
          <Title level={2} className="page-title">财务统计分析</Title>
          <Text type="secondary">多维度分析您的收支趋势与资产分布状况</Text>
        </div>
        <div className="header-actions">
          <Button 
            icon={<ArrowUpOutlined />} 
            onClick={() => handleQuickAdd('income')}
            className="header-btn income"
          >
            去记收入
          </Button>
          <Button 
            danger
            icon={<ArrowDownOutlined />} 
            onClick={() => handleQuickAdd('expense')}
            className="header-btn expense"
          >
            去记支出
          </Button>
        </div>
      </div>

      <Row gutter={[24, 24]} className="stat-overview-row">
        <Col xs={24} sm={8}>
          <Card className="overview-card income" bordered={false}>
            <div className="card-icon-wrapper">
              <ArrowUpOutlined />
            </div>
            <Statistic title="本期总收入" value={overview?.totalIncome || 0} precision={2} prefix="¥" />
          </Card>
        </Col>
        <Col xs={24} sm={8}>
          <Card className="overview-card expense" bordered={false}>
            <div className="card-icon-wrapper">
              <ArrowDownOutlined />
            </div>
            <Statistic title="本期总支出" value={overview?.totalExpense || 0} precision={2} prefix="¥" />
          </Card>
        </Col>
        <Col xs={24} sm={8}>
          <Card className="overview-card balance" bordered={false}>
            <div className="card-icon-wrapper">
              <AccountBookOutlined />
            </div>
            <Statistic title="本期结余" value={(overview?.totalIncome || 0) - (overview?.totalExpense || 0)} precision={2} prefix="¥" />
          </Card>
        </Col>
      </Row>

      <Card className="filter-card glass-card" bordered={false}>
        <div className="filter-content">
          <span className="filter-label">查询周期：</span>
          <Space size="middle">
            <Select 
              value={timeRange} 
              onChange={setTimeRange} 
              className="range-select"
              size="large"
              style={{ width: 160 }}
            >
              <Option value="week">本周</Option>
              <Option value="month">本月</Option>
              <Option value="quarter">本季度</Option>
              <Option value="year">本年</Option>
              <Option value="custom">自定义范围</Option>
            </Select>
            {timeRange === 'custom' && (
              <RangePicker 
                value={customRange}
                onChange={(dates) => setCustomRange(dates as [dayjs.Dayjs, dayjs.Dayjs] | null)} 
                size="large"
                className="custom-range-picker"
              />
            )}
            <Button icon={<DownloadOutlined />} size="large" onClick={() => handleExport('Excel')} className="export-btn">导出Excel</Button>
          </Space>
        </div>
      </Card>

      <Row gutter={[24, 24]} className="chart-grid">
        <Col xs={24} lg={16}>
          <Card title="收支对比分析" className="glass-card chart-card" bordered={false}>
            <ReactECharts option={lineChartOption} style={{ height: '380px' }} />
          </Card>
        </Col>
        <Col xs={24} lg={8}>
          <Card title="支出结构" className="glass-card chart-card" bordered={false}>
            <ReactECharts option={pieChartOption} style={{ height: '380px' }} />
          </Card>
        </Col>
        <Col span={24}>
          <Card title="财务趋势演变" className="glass-card chart-card" bordered={false}>
            <ReactECharts option={trendChartOption} style={{ height: '380px' }} />
          </Card>
        </Col>
      </Row>

      <Row gutter={[24, 24]} className="bottom-section">
        <Col xs={24} lg={14}>
          <Card title="财务健康评估" className="glass-card health-card" bordered={false}>
            <div className="health-container">
              <div className="health-main">
                <Progress 
                  type="dashboard" 
                  percent={health?.healthScore || 0} 
                  width={200}
                  strokeWidth={12}
                  strokeColor={{
                    '0%': '#ef4444',
                    '100%': '#10b981',
                  }}
                  format={(percent) => (
                    <div className="score-display">
                      <span className="score-num">{percent}</span>
                      <span className="score-label">健康分</span>
                    </div>
                  )}
                />
              </div>
              <div className="health-details">
                <div className="metric-row">
                  <div className="metric-item">
                    <Text type="secondary">储蓄率</Text>
                    <div className="metric-value">{Math.abs(health?.savingsRate || 0)}%</div>
                    <Progress percent={Math.abs(health?.savingsRate || 0)} size="small" showInfo={false} strokeColor="#6366f1" />
                  </div>
                  <div className="metric-item">
                    <Text type="secondary">支出占比</Text>
                    <div className="metric-value">{health?.expenseRatio || 0}%</div>
                    <Progress percent={health?.expenseRatio || 0} size="small" showInfo={false} status={health?.expenseRatio > 80 ? 'exception' : 'normal'} />
                  </div>
                </div>
                <div className="health-recommendations">
                  <div className="recommendation-header">
                    <Title level={5}>改善建议</Title>
                  </div>
                  <List 
                    size="small" 
                    dataSource={health?.recommendations || []} 
                    renderItem={(item) => (
                      <List.Item className="recommendation-item">
                        <Tag color="blue" className="suggestion-tag">建议</Tag>
                        <Text className="suggestion-text">{item}</Text>
                      </List.Item>
                    )} 
                  />
                </div>
              </div>
            </div>
          </Card>
        </Col>
        <Col xs={24} lg={10}>
          <Card title="分类支出排行" className="glass-card category-card" bordered={false}>
            <List 
              dataSource={overview?.categoryBreakdown || []} 
              className="category-rank-list"
              renderItem={(item: any) => (
                <List.Item className="rank-item">
                  <div className="rank-left">
                    <div className="category-dot" style={{ backgroundColor: item.categoryColor }} />
                    <div className="category-info">
                      <div className="name">{item.categoryName}</div>
                      <div className="count">{item.transactionCount} 笔交易</div>
                    </div>
                  </div>
                  <div className="rank-right">
                    <div className="amount">¥{item.amount.toFixed(2)}</div>
                    <div className="percentage">{item.percentage}%</div>
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

export default StatisticsPage;
