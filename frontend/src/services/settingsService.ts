import api from './api';

const settingsService = {
  /**
   * 获取用户设置
   */
  getSettings: async () => {
    const response = await api.get<any>('/settings');
    return response.data;
  },

  /**
   * 更新用户设置
   */
  updateSettings: async (data: any) => {
    const response = await api.put<any>('/settings', data);
    return response.data;
  },

  /**
   * 更新个人资料
   */
  updateProfile: async (data: any) => {
    const response = await api.put<any>('/auth/profile', data);
    return response.data;
  },

  /**
   * 修改密码
   */
  changePassword: async (data: any) => {
    const response = await api.put<any>('/auth/change-password', data);
    return response.data;
  },

  /**
   * 获取通知配置
   */
  getNotificationSettings: async () => {
    const response = await api.get<any>('/settings/notifications');
    return response.data;
  },

  /**
   * 更新通知配置
   */
  updateNotificationSettings: async (data: any) => {
    const response = await api.put<any>('/settings/notifications', data);
    return response.data;
  },
};

export default settingsService;
