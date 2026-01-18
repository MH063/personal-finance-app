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

export interface NlqResponse {
  success: boolean;
  answer?: string;
  message?: string;
  debug?: any;
  reason?: string;
}

export const aiService = {
  /**
   * 自然语言查账 (NLQ)
   */
  async query(
    userQuery: string,
    options?: { fast?: boolean; page?: number; limit?: number }
  ): Promise<NlqResponse> {
    try {
      const response = await api.post(
        '/ai/query',
        { query: userQuery, fast: options?.fast ?? false, page: options?.page, limit: options?.limit },
        { headers: { 'X-Silent-Loading': 'true', 'X-Prevent-Cancel': 'true' } }
      );
      const raw = response.data as any;
      let result: NlqResponse;
      if (raw && typeof raw === 'object' && 'success' in raw && 'data' in raw) {
        const inner = raw.data || {};
        result = {
          success: !!raw.success,
          answer: inner.answer,
          debug: inner.debug,
          message: raw.message,
          reason: raw.reason
        };
      } else {
        // 拦截器已将 data 解包为内层时（仅有 answer/debug），视为成功
        result = {
          success: true,
          answer: raw?.answer,
          debug: raw?.debug
        };
      }
      if (result && result.success === false) {
        console.warn('[aiService] NLQ 失败原因:', result.reason, result.debug || {});
      }
      return result;
    } catch (error) {
      console.error('[aiService] NLQ 请求失败:', error);
      return { success: false, message: 'AI 服务暂时不可用' };
    }
  },

  /**
   * 获取 AI 预测分类
   */
  async predictCategory(description: string): Promise<string | null> {
    try {
      const response = await api.get(`/ai/predict-category`, { params: { description } });
      const raw = response.data as any;
      const data = (raw && typeof raw === 'object' && 'success' in raw && 'data' in raw) ? raw.data : raw;
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
      const response = await api.get(`/ai/health-analysis`, { headers: { 'X-Silent-Loading': 'true', 'X-Prevent-Cancel': 'true' } });
      const raw = response.data as any;
      const data = (raw && typeof raw === 'object' && 'success' in raw && 'data' in raw) ? raw.data : raw;
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
      const response = await api.get('/ai/forecast', { headers: { 'X-Silent-Loading': 'true', 'X-Prevent-Cancel': 'true' } });
      const raw = response.data as any;
      const data = (raw && typeof raw === 'object' && 'success' in raw && 'data' in raw) ? raw.data : raw;
      return data;
    } catch (error) {
      console.error('[aiService] 获取预测失败:', error);
      return [];
    }
  },

  /**
   * 获取服务状态
   */
  async getStatus(): Promise<{ state: 'idle' | 'downloading' | 'ready' | 'error'; progress?: number; message?: string } | null> {
    try {
      const response = await api.get('/ai/status', { headers: { 'X-Silent-Loading': 'true' } });
      const raw = response.data as any;
      const data = (raw && typeof raw === 'object' && 'success' in raw && 'data' in raw) ? raw.data : raw;
      return data;
    } catch (error) {
      return null;
    }
  }
};

export default aiService;
