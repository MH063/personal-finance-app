import api from './api';

const settingsService = {
  /**
   * 获取用户设置
   */
  getSettings: async () => {
    const response = await api.get<any>('/settings');
    const result = response.data;
    // 根据 Rule 5: 优先获取嵌套的 data 字段
    return (result && typeof result === 'object' && 'success' in result && 'data' in result) 
      ? result.data 
      : result;
  },

  /**
   * 更新用户设置
   */
  updateSettings: async (data: any) => {
    const response = await api.put<any>('/settings', data);
    const result = response.data;
    // 根据 Rule 5: 优先获取嵌套的 data 字段
    return (result && typeof result === 'object' && 'success' in result && 'data' in result) 
      ? result.data 
      : result;
  },

  /**
   * 更新个人资料
   */
  updateProfile: async (data: any) => {
    const response = await api.put<any>('/auth/profile', data);
    const result = response.data;
    // 根据 Rule 5: 优先获取嵌套的 data 字段
    return (result && typeof result === 'object' && 'success' in result && 'data' in result) 
      ? result.data 
      : result;
  },

  /**
   * 修改密码
   */
  changePassword: async (data: any) => {
    const response = await api.put<any>('/auth/password', data);
    const result = response.data;
    // 根据 Rule 5: 优先获取嵌套的 data 字段
    return (result && typeof result === 'object' && 'success' in result && 'data' in result) 
      ? result.data 
      : result;
  },
};

export default settingsService;
