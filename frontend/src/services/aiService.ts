import api from './api';

/**
 * AI 服务接口定义
 */
export interface HealthAnalysis {
  score: number;
  savingsRate: string;
  debtToIncomeRatio: string;
  insights: string[];
}

export interface ForecastData {
  month: string;
  amount: number;
}

export const aiService = {
  /**
   * 获取 AI 预测分类
   */
  async predictCategory(description: string): Promise<string | null> {
    try {
      const response = await api.get(`/ai/predict-category`, { params: { description } });
      const data = response.data;
      return data?.categoryId || null;
    } catch (error) {
      console.error('[aiService] 预测分类失败:', error);
      return null;
    }
  },

  /**
   * 获取财务健康分析
   */
  async getHealthAnalysis(): Promise<HealthAnalysis | null> {
    const token = localStorage.getItem('accessToken');
    if (!token) {
      console.log('[aiService] 未认证，跳过健康分析请求');
      return null;
    }
    try {
      const response = await api.get(`/ai/health-analysis`);
      const data = response.data;
      console.log('[aiService] 获取健康分析原始数据:', data);
      
      if (data && typeof data === 'object') {
        // 确保 insights 是数组
        if (!Array.isArray(data.insights)) {
          data.insights = [];
        }
        return data;
      }
      
      return null;
    } catch (error) {
      console.error('[aiService] 获取健康分析失败:', error);
      return null;
    }
  },

  /**
   * 获取收支预测
   */
  async getForecast(): Promise<ForecastData[] | null> {
    const token = localStorage.getItem('accessToken');
    if (!token) {
      console.log('[aiService] 未认证，跳过预测请求');
      return [];
    }
    try {
      const response = await api.get(`/ai/forecast`);
      const result = response.data;
      
      console.log('[aiService] 获取预测原始数据:', result);

      if (result && typeof result === 'object') {
        // 如果结构是 { forecast: [] } (已经在 api.ts 中解包了一层)
        if (Array.isArray(result.forecast)) {
          return result.forecast;
        }
        
        // 如果直接是数组
        if (Array.isArray(result)) {
          return result;
        }
      }
      
      return null;
    } catch (error) {
      console.error('[aiService] 获取预测数据失败:', error);
      return [];
    }
  }
};

export default aiService;
