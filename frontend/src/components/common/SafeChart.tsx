import React, { useEffect, useRef } from 'react';
import * as echarts from 'echarts';

interface SafeChartProps {
  option: echarts.EChartsOption;
  style?: React.CSSProperties;
  className?: string;
  onEvents?: Record<string, (params: any) => void>;
}

/**
 * 安全的 ECharts 组件，解决 echarts-for-react 在 React 18 下的 unmount 报错问题
 * 直接使用 echarts 实例并配合 useRef 管理生命周期
 */
const SafeChart: React.FC<SafeChartProps> = ({ option, style, className, onEvents }) => {
  const chartRef = useRef<HTMLDivElement>(null);
  const chartInstance = useRef<echarts.ECharts | null>(null);

  useEffect(() => {
    if (!chartRef.current) return;

    // 初始化图表
    if (!chartInstance.current) {
      chartInstance.current = echarts.init(chartRef.current);
    }

    // 设置配置项
    chartInstance.current.setOption(option, true);

    // 绑定事件
    if (onEvents) {
      Object.entries(onEvents).forEach(([eventName, handler]) => {
        chartInstance.current?.on(eventName, handler);
      });
    }

    // 处理窗口缩放
    const handleResize = () => {
      chartInstance.current?.resize();
    };
    window.addEventListener('resize', handleResize);

    // 监听容器大小变化 (替代 echarts-for-react 内部不稳定的 size-sensor)
    const resizeObserver = new ResizeObserver(() => {
      chartInstance.current?.resize();
    });
    resizeObserver.observe(chartRef.current);

    return () => {
      window.removeEventListener('resize', handleResize);
      resizeObserver.disconnect();
      
      // 安全销毁实例
      if (chartInstance.current) {
        chartInstance.current.dispose();
        chartInstance.current = null;
      }
    };
  }, [option, onEvents]);

  return (
    <div 
      ref={chartRef} 
      style={{ width: '100%', height: '300px', ...style }} 
      className={className} 
    />
  );
};

export default SafeChart;
