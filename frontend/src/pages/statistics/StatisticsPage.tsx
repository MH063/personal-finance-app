import React, { useEffect, useState } from 'react';
import { Card, Row, Col, Select, DatePicker, Button, Statistic, Typography, Space, App as AntdApp, Tag, Progress } from 'antd';
import { ArrowUpOutlined, ArrowDownOutlined, DownloadOutlined, AccountBookOutlined, ReloadOutlined } from '@ant-design/icons';
import SafeChart from '../../components/common/SafeChart';
import { useDispatch, useSelector } from 'react-redux';
import { useNavigate } from 'react-router-dom';
import dayjs from 'dayjs';
import { RootState, AppDispatch } from '../../store';
import { fetchOverview, fetchTrend, fetchFinancialHealth } from '../../store/slices/statisticsSlice';
import { fetchAiHealthAnalysis, fetchAiForecast } from '../../store/slices/aiSlice';
import { collaborativeService } from '../../services/collaborativeService';
import statisticsService from '../../services/statisticsService';
import { aiService } from '../../services/aiService';
import { useSafeBackground } from '../../hooks/useSafeBackground';
import './StatisticsPage.css';

const { Title, Text } = Typography;
const { RangePicker } = DatePicker;

const StatisticsPage: React.FC = () => {
  const [timeRange, setTimeRange] = useState('last6months');
  const [customRange, setCustomRange] = useState<[dayjs.Dayjs, dayjs.Dayjs] | null>(null);
  const [exportLoading, setExportLoading] = useState(false);
  const [aiData, setAiData] = useState<any>(null);
  const [forecastData, setForecastData] = useState<any[]>([]);

  const [quickAddLoading, setQuickAddLoading] = useState<string | null>(null);

  const dispatch = useDispatch<AppDispatch>();
  const navigate = useNavigate();
  const { overview, health } = useSelector((state: RootState) => state.statistics);
  const { isAuthenticated, user } = useSelector((state: RootState) => state.auth);
  const { message } = AntdApp.useApp();

  // 采样背景亮度以动态调整文字颜色
  const pageBg = useSafeBackground('https://picsum.photos/1920/1080');
  const [brightness, setBrightness] = useState(0); // 0-100

  useEffect(() => {
    if (!pageBg) return;

    const img = new Image();
    img.crossOrigin = "Anonymous";
    img.onload = () => {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      canvas.width = 100;
      canvas.height = 100;
      ctx.drawImage(img, 0, 0, 100, 100);
      const data = ctx.getImageData(0, 0, 100, 100).data;
      let r = 0, g = 0, b = 0;
      for (let i = 0; i < data.length; i += 4) {
        r += data[i];
        g += data[i+1];
        b += data[i+2];
      }
      const count = data.length / 4;
      const avgR = r / count;
      const avgG = g / count;
      const avgB = b / count;
      // 使用亮度公式
      const lum = ((0.299 * avgR + 0.587 * avgG + 0.114 * avgB) / 255) * 100;
      setBrightness(lum);
    };
    img.src = pageBg;
  }, [pageBg]);

  const isLightBackground = brightness > 60;
  const textColor = isLightBackground ? 'rgba(0, 0, 0, 0.85)' : 'rgba(255, 255, 255, 0.95)';
  const secondaryColor = isLightBackground ? 'rgba(0, 0, 0, 0.65)' : 'rgba(255, 255, 255, 0.7)';
  const textShadow = isLightBackground 
    ? '0 1px 1px rgba(255, 255, 255, 0.5)' 
    : '0 1px 2px rgba(0, 0, 0, 0.6), 0 0 1px rgba(0, 0, 0, 0.4)';

  const refreshData = React.useCallback(() => {
    if (!isAuthenticated || !user?.id) {
      console.log('[Statistics] 未认证，跳过刷新');
      return;
    }
    console.log('[Statistics] 正在刷新数据...');
    const query: any = { timeRange };
    if (timeRange === 'custom') {
      if (!customRange) return;
      query.startDate = customRange[0].format('YYYY-MM-DD');
      query.endDate = customRange[1].format('YYYY-MM-DD');
    }
    dispatch(fetchOverview(query) as any);
    dispatch(fetchTrend(query) as any);
    dispatch(fetchFinancialHealth(timeRange === 'month' ? 'month' : timeRange === 'year' ? 'year' : 'quarter') as any);
    
    // 加载 AI 数据
    dispatch(fetchAiHealthAnalysis() as any);
    dispatch(fetchAiForecast() as any);
    
    // 同时同步本地状态
    aiService.getForecast().then(res => {
      // 确保 res 是数组，Rule 5 处理由 service 完成，此处做最终保险
      const data = Array.isArray(res) ? res : [];
      setForecastData(data);
    }).catch(err => {
      console.warn('[Statistics] 加载预测数据失败:', err);
      setForecastData([]);
    });
    
    aiService.getHealthAnalysis().then(res => {
      if (res) setAiData(res);
    });
  }, [customRange, dispatch, timeRange, isAuthenticated, user?.id]);

  useEffect(() => {
    if (!isAuthenticated || !user?.id) return;
    refreshData();
 
    const token = localStorage.getItem('accessToken');
    if (token) {
      collaborativeService.init(token);
    }
 
    const handleUpdate = (data: any) => {
      console.log('[Statistics] 监听到实时更新:', data);
      refreshData();
    };
 
    collaborativeService.on('ledgerUpdate', handleUpdate);
    collaborativeService.on('globalUpdate', handleUpdate);
 
    return () => {
      collaborativeService.off('ledgerUpdate', handleUpdate);
      collaborativeService.off('globalUpdate', handleUpdate);
    };
  }, [refreshData, isAuthenticated, user?.id]);

  const handleQuickAdd = (type: 'income' | 'expense') => {
    if (quickAddLoading) return;
    setQuickAddLoading(type);
    try {
      navigate(`/${type}`);
    } finally {
      // 实际上跳转是瞬间的，但为了视觉反馈一致性，我们在这里不做 setQuickAddLoading(null)
      // 或者在跳转前给一点点延迟
    }
  };

  const lineChartOption = {
    tooltip: { 
      trigger: 'axis' as const,
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
      type: 'category' as const, 
      data: Array.isArray(overview?.monthlyTrends) ? overview.monthlyTrends.map((t: any) => t.month) : [],
      axisLine: { lineStyle: { color: '#e2e8f0' } },
      axisLabel: { color: '#64748b' }
    },
    yAxis: { 
      type: 'value' as const,
      splitLine: { lineStyle: { type: 'dashed' as const, color: '#f1f5f9' } },
      axisLabel: { color: '#64748b' }
    },
    series: [
      { 
        name: '收入', 
        type: 'bar' as const, 
        barWidth: '20%',
        data: Array.isArray(overview?.monthlyTrends) ? overview.monthlyTrends.map((t: any) => t.income) : [], 
        itemStyle: { 
          color: '#10b981',
          borderRadius: [4, 4, 0, 0]
        } 
      },
      { 
        name: '支出', 
        type: 'bar' as const, 
        barWidth: '20%',
        data: Array.isArray(overview?.monthlyTrends) ? overview.monthlyTrends.map((t: any) => t.expense) : [], 
        itemStyle: { 
          color: '#ef4444',
          borderRadius: [4, 4, 0, 0]
        } 
      },
    ],
  };

  const pieChartOption = {
    tooltip: { trigger: 'item' as const },
    legend: { orient: 'vertical' as const, right: 10, top: 'center', icon: 'circle' },
    series: [{
      type: 'pie' as const,
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
          fontSize: 16,
          fontWeight: 700
        }
      },
      data: Array.isArray(overview?.categoryBreakdown) ? overview.categoryBreakdown.map((cat: any) => ({
        value: cat.amount,
        name: cat.categoryName,
        itemStyle: { color: cat.categoryColor },
      })) : [],
    }],
  };

  const trendChartOption = {
    tooltip: { trigger: 'axis' as const },
    legend: { data: ['结余'], bottom: 0, icon: 'circle' },
    grid: { left: '3%', right: '4%', bottom: '15%', top: '10%', containLabel: true },
    xAxis: { 
      type: 'category' as const, 
      data: Array.isArray(overview?.monthlyTrends) ? overview.monthlyTrends.map((t: any) => t.month) : [],
      axisLine: { lineStyle: { color: '#e2e8f0' } }
    },
    yAxis: { 
      type: 'value' as const,
      splitLine: { lineStyle: { type: 'dashed' as const, color: '#f1f5f9' } }
    },
    series: [{ 
      name: '结余', 
      type: 'line' as const, 
      smooth: true, 
      symbol: 'circle' as const,
      symbolSize: 8,
      data: Array.isArray(overview?.monthlyTrends) ? overview.monthlyTrends.map((t: any) => t.netIncome) : [], 
      itemStyle: { color: '#6366f1' }, 
      lineStyle: { width: 4 },
      areaStyle: { 
        color: {
          type: 'linear' as const,
          x: 0, y: 0, x2: 0, y2: 1,
          colorStops: [
            { offset: 0, color: 'rgba(99, 102, 241, 0.3)' },
            { offset: 1, color: 'rgba(99, 102, 241, 0)' }
          ]
        } 
      } 
    }],
  };

  const forecastChartOption = {
    tooltip: { trigger: 'axis' as const },
    xAxis: { 
      type: 'category' as const, 
      data: Array.isArray(forecastData) ? forecastData.map(d => d.month) : [],
      axisLine: { lineStyle: { color: '#e2e8f0' } }
    },
    yAxis: { type: 'value' as const, splitLine: { lineStyle: { type: 'dashed' as const } } },
    series: [{
      data: Array.isArray(forecastData) ? forecastData.map(d => d.amount) : [],
      type: 'line' as const,
      smooth: true,
      lineStyle: { type: 'dashed' as const, color: '#6366f1' },
      areaStyle: { color: 'rgba(99, 102, 241, 0.1)' }
    }]
  };

  const handleExport = async (format: 'pdf' | 'excel' | 'csv') => {
    if (exportLoading) return;
    setExportLoading(true);
    try {
      const query: any = { timeRange };
      if (timeRange === 'custom' && customRange) {
        query.startDate = customRange[0].format('YYYY-MM-DD');
        query.endDate = customRange[1].format('YYYY-MM-DD');
      }
      const response = await statisticsService.exportReport(format, query);
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `财务报表_${dayjs().format('YYYYMMDD')}.${format === 'excel' ? 'xlsx' : format}`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      message.success('导出成功');
    } catch (error: any) {
      console.error('[StatisticsPage] 导出失败:', error);
      message.error(typeof error === 'string' ? error : (error?.message || '导出失败'));
    } finally {
      setExportLoading(false);
    }
  };

  /**
   * 重置筛选条件
   */
  const handleResetFilters = () => {
    console.log('[StatisticsPage] 重置筛选条件');
    setTimeRange('last6months');
    setCustomRange(null);
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
            loading={quickAddLoading === 'income'}
            disabled={!!quickAddLoading && quickAddLoading !== 'income'}
          >
            去记收入
          </Button>
          <Button 
            danger
            icon={<ArrowDownOutlined />} 
            onClick={() => handleQuickAdd('expense')}
            className="header-btn expense"
            loading={quickAddLoading === 'expense'}
            disabled={!!quickAddLoading && quickAddLoading !== 'expense'}
          >
            去记支出
          </Button>
        </div>
      </div>

      <Row gutter={[24, 24]} className="stat-overview-row">
        <Col xs={24} sm={8}>
          <Card className="overview-card income glass-card" variant="borderless">
            <div className="card-icon-wrapper">
              <ArrowUpOutlined />
            </div>
            <Statistic title="本期总收入" value={overview?.totalIncome || 0} precision={2} prefix="¥" />
          </Card>
        </Col>
        <Col xs={24} sm={8}>
          <Card className="overview-card expense glass-card" variant="borderless">
            <div className="card-icon-wrapper">
              <ArrowDownOutlined />
            </div>
            <Statistic title="本期总支出" value={overview?.totalExpense || 0} precision={2} prefix="¥" />
          </Card>
        </Col>
        <Col xs={24} sm={8}>
          <Card className="overview-card balance glass-card" variant="borderless">
            <div className="card-icon-wrapper">
              <AccountBookOutlined />
            </div>
            <Statistic title="本期结余" value={(overview?.totalIncome || 0) - (overview?.totalExpense || 0)} precision={2} prefix="¥" />
          </Card>
        </Col>
      </Row>

      <Card className="filter-card glass-card" variant="borderless">
        <div className="filter-content">
          <span className="filter-label">查询周期：</span>
          <Space size="middle">
            <Select 
              value={timeRange} 
              onChange={setTimeRange} 
              className="range-select"
              size="large"
              style={{ width: 160 }}
              options={[
                { value: 'week', label: '本周' },
                { value: 'month', label: '本月' },
                { value: 'last6months', label: '最近6个月' },
                { value: 'last12months', label: '最近12个月' },
                { value: 'quarter', label: '本季度' },
                { value: 'year', label: '本年' },
                { value: 'custom', label: '自定义范围' },
              ]}
            />
            {timeRange === 'custom' && (
              <RangePicker 
                value={customRange}
                onChange={(dates) => setCustomRange(dates as [dayjs.Dayjs, dayjs.Dayjs] | null)} 
                size="large"
                className="custom-range-picker"
              />
            )}
            <Button 
              onClick={handleResetFilters}
              size="large"
              icon={<ReloadOutlined />}
              title="重置筛选"
              className="filter-reset-btn"
            />
            <Button 
              icon={<DownloadOutlined />} 
              size="large" 
              onClick={() => handleExport('excel')} 
              loading={exportLoading}
              className="export-btn"
            >
              导出Excel
            </Button>
          </Space>
        </div>
      </Card>

      <Row gutter={[24, 24]} className="chart-grid">
        <Col xs={24} lg={16}>
          <Card title="收支对比分析" className="glass-card chart-card" variant="borderless">
            <SafeChart 
              option={lineChartOption} 
              style={{ height: '380px' }} 
            />
          </Card>
        </Col>
        <Col xs={24} lg={8}>
          <Card title="支出结构" className="glass-card chart-card" variant="borderless">
            <SafeChart 
              option={pieChartOption} 
              style={{ height: '380px' }} 
            />
          </Card>
        </Col>
        
        {/* AI 智能预测卡片 */}
        <Col span={24}>
          <Card 
            title={<span><AccountBookOutlined style={{ marginRight: 8, color: '#6366f1' }} />AI 支出趋势预测</span>} 
            className="glass-card chart-card ai-forecast-card" 
            variant="borderless"
            extra={<Tag color="purple">智能预测</Tag>}
          >
            <div style={{ display: 'flex', alignItems: 'center', height: '300px' }}>
              <div style={{ flex: 1 }}>
                <SafeChart 
                  option={forecastChartOption} 
                  style={{ height: '300px' }} 
                />
              </div>
              <div style={{ width: '300px', padding: '0 24px' }}>
                <Title level={5} className="high-readability-title" style={{ color: textColor, textShadow }}>预测说明</Title>
                <Text className="high-readability-secondary" style={{ color: secondaryColor, textShadow }}>基于您过去几个月的消费习惯，AI 预测了未来 3 个月的支出走势。虚线部分代表预测值，仅供参考。</Text>
                {forecastData.length === 0 && (
                  <div style={{ marginTop: 16 }}>
                    <Tag color="warning">数据不足，至少需要 2 个月的数据进行预测</Tag>
                  </div>
                )}
              </div>
            </div>
          </Card>
        </Col>

        <Col span={24}>
          <Card title="财务趋势演变" className="glass-card chart-card" variant="borderless">
            <SafeChart 
              option={trendChartOption} 
              style={{ height: '380px' }} 
            />
          </Card>
        </Col>
      </Row>

      <Row gutter={[24, 24]} className="bottom-section">
        <Col xs={24} lg={14}>
          <Card 
            title={<span><AccountBookOutlined style={{ marginRight: 8, color: '#10b981' }} />财务健康评估 & AI 洞察</span>} 
            className="glass-card health-card" 
            variant="borderless"
          >
            <div className="health-container">
              <div className="health-main">
                <Progress 
                  type="dashboard" 
                  percent={aiData?.score || health?.healthScore || 0} 
                  size={200}
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
                    <div className="metric-value">{aiData?.savingsRate || Math.abs(health?.savingsRate || 0)}%</div>
                    <Progress percent={parseFloat(aiData?.savingsRate) || Math.abs(health?.savingsRate || 0)} size="small" showInfo={false} strokeColor="#6366f1" />
                  </div>
                  <div className="metric-item">
                    <Text type="secondary">债务收入比</Text>
                    <div className="metric-value">{aiData?.debtToIncomeRatio || 0}%</div>
                    <Progress percent={parseFloat(aiData?.debtToIncomeRatio) || 0} size="small" showInfo={false} status={(parseFloat(aiData?.debtToIncomeRatio) || 0) > 40 ? 'exception' : 'normal'} />
                  </div>
                </div>
                <div className="health-recommendations">
                  <div className="recommendation-header">
                    <Title level={5} className="high-readability-title" style={{ color: textColor, textShadow }}>AI 改善建议</Title>
                  </div>
                  <div className="recommendation-list">
                    {(Array.isArray(aiData?.insights) && aiData.insights.length > 0
                      ? aiData.insights
                      : (Array.isArray(health?.recommendations) ? health.recommendations : [])
                    ).map((item: string, idx: number) => (
                      <div key={idx} className="recommendation-item" style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 0', borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
                        <Tag color="purple" className="suggestion-tag">AI 建议</Tag>
                        <Text className="suggestion-text high-readability-text" style={{ color: textColor, textShadow }}>{item}</Text>
                      </div>
                    ))}
                    {((Array.isArray(aiData?.insights) && aiData.insights.length > 0) || (Array.isArray(health?.recommendations) && health.recommendations.length > 0)) ? null : (
                      <div style={{ padding: '8px 0' }}>
                        <Text type="secondary">暂无建议</Text>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </Card>
        </Col>
        <Col xs={24} lg={10}>
          <Card title="分类支出排行" className="glass-card category-card" variant="borderless">
            <div className="category-rank-list">
              {(Array.isArray(overview?.categoryBreakdown) ? overview.categoryBreakdown : []).map((item: any, idx: number) => (
                <div key={idx} className="rank-item" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
                  <div className="rank-left" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <div className="category-dot" style={{ backgroundColor: item.categoryColor }} />
                    <div className="category-info">
                      <div className="name">{item.categoryName}</div>
                      <div className="count">{item.transactionCount} 笔交易</div>
                    </div>
                  </div>
                  <div className="rank-right" style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                    <div className="amount">¥{(item.amount || 0).toFixed(2)}</div>
                    <div className="percentage">{item.percentage || 0}%</div>
                  </div>
                </div>
              ))}
              {(Array.isArray(overview?.categoryBreakdown) ? overview.categoryBreakdown : []).length === 0 && (
                <div style={{ padding: '8px 0' }}>
                  <Text type="secondary">暂无数据</Text>
                </div>
              )}
            </div>
          </Card>
        </Col>
      </Row>
    </div>
  );
};

export default StatisticsPage;
