import api from './api';

export enum NotificationType {
  DEBT_REMINDER = 'debt_reminder',
  BUDGET_ALERT = 'budget_alert',
  SYSTEM_ANNOUNCEMENT = 'system_announcement',
  SECURITY_ALERT = 'security_alert',
}

export enum NotificationPriority {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
}

export interface Notification {
  id: string;
  userId: string;
  title: string;
  content: string;
  type: NotificationType;
  priority: NotificationPriority;
  isRead: boolean;
  link?: string;
  createdAt: string;
}

export interface NotificationListResponse {
  items: Notification[];
  total: number;
  unreadCount: number;
}

export interface NotificationQuery {
  isRead?: boolean;
  limit?: number;
  offset?: number;
}

const notificationService = {
  /**
   * 获取通知列表
   */
  getNotifications: async (query?: NotificationQuery): Promise<NotificationListResponse> => {
    const response = await api.get('/notifications', { params: query });
    return response.data;
  },

  /**
   * 标记通知为已读
   */
  markAsRead: async (id: string): Promise<Notification> => {
    const response = await api.patch(`/notifications/${id}/read`);
    return response.data;
  },

  /**
   * 标记所有通知为已读
   */
  markAllAsRead: async (): Promise<{ success: boolean }> => {
    const response = await api.post('/notifications/mark-all-read');
    return response.data;
  },

  /**
   * 删除通知
   */
  deleteNotification: async (id: string): Promise<{ success: boolean }> => {
    const response = await api.delete(`/notifications/${id}`);
    return response.data;
  },

  /**
   * 清空已读通知
   */
  clearReadNotifications: async (): Promise<{ success: boolean }> => {
    const response = await api.post('/notifications/clear-read');
    return response.data;
  },
};

export default notificationService;
