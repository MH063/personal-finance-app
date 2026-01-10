import api from './api';

const statisticsService = {
  /**
   * 获取收支概览统计
   */
  getOverview: async (params?: any) => {
    const response = await api.get<any>('/statistics/overview', { params });
    return response.data;
  },

  /**
   * 获取趋势数据 (映射到后端的 overview 接口，因为它包含了月度趋势)
   */
  getTrend: async (params?: any) => {
    const response = await api.get<any>('/statistics/overview', { params });
    return response.data;
  },

  /**
   * 获取分类统计 (映射到后端的 overview 接口，因为它包含了分类占比)
   */
  getCategoryStats: async (params?: any) => {
    const response = await api.get<any>('/statistics/overview', { params });
    return response.data;
  },

  /**
   * 获取资产净值统计
   */
  getNetWorth: async () => {
    const response = await api.get<any>('/statistics/overview');
    return response.data;
  },

  /**
   * 获取预算执行情况 (映射到后端的 health 接口)
   */
  getBudgetStats: async (params?: any) => {
    const response = await api.get<any>('/statistics/health', { 
      params: { period: params?.timeRange || 'month' } 
    });
    return response.data;
  },

  /**
   * 获取债务统计
   */
  getDebtStats: async () => {
    const response = await api.get<any>('/statistics/debts');
    return response.data;
  },

  /**
   * 导出报表
   */
  exportReport: async (format: 'pdf' | 'excel' | 'csv', params?: any) => {
    const response = await api.get(`/statistics/export`, { 
      params: { ...params, format }, 
      responseType: 'blob' 
    });
    return response; // 导出通常需要整个响应来获取文件名等，或者是 blob 数据
  },
};

export default statisticsService;
