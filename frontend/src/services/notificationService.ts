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

const normalizeNotificationListResponse = (input: any): NotificationListResponse => {
  if (!input) {
    return { items: [], total: 0, unreadCount: 0 };
  }

  let data: any = input;
  if (data && typeof data === 'object' && 'success' in data && 'data' in data) {
    data = (data as any).data;
  }

  const items =
    Array.isArray(data?.items)
      ? data.items
      : Array.isArray(data?.notifications)
        ? data.notifications
        : Array.isArray(data)
          ? data
          : [];

  const total =
    typeof data?.total === 'number'
      ? data.total
      : typeof data?.count === 'number'
        ? data.count
        : items.length;

  const unreadCount =
    typeof data?.unreadCount === 'number'
      ? data.unreadCount
      : typeof data?.unread === 'number'
        ? data.unread
        : items.reduce((acc: number, n: any) => acc + (n && n.isRead === false ? 1 : 0), 0);

  return { items, total, unreadCount };
};

const notificationService = {
  /**
   * 获取通知列表
   */
  getNotifications: async (query?: NotificationQuery): Promise<NotificationListResponse> => {
    const response = await api.get('/notifications', { params: query });
    const result = response.data;
    return normalizeNotificationListResponse(result);
  },

  /**
   * 标记通知为已读
   */
  markAsRead: async (id: string): Promise<Notification> => {
    const response = await api.patch(`/notifications/${id}/read`);
    const result = response.data;
    return (result && typeof result === 'object' && 'success' in result && 'data' in result) 
      ? result.data 
      : result;
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
