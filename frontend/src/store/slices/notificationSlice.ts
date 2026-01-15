import { createSlice, createAsyncThunk, PayloadAction } from '@reduxjs/toolkit';
import notificationService, { Notification, NotificationQuery } from '../../services/notificationService';

interface NotificationState {
  notifications: Notification[];
  total: number;
  unreadCount: number;
  loading: boolean;
  error: string | null;
}

const initialState: NotificationState = {
  notifications: [],
  total: 0,
  unreadCount: 0,
  loading: false,
  error: null,
};

export const fetchNotifications = createAsyncThunk(
  'notifications/fetchAll',
  async (query: NotificationQuery | undefined, { rejectWithValue }) => {
    try {
      const response = await notificationService.getNotifications(query);
      return response;
    } catch (error: any) {
      return rejectWithValue(error.response?.data?.message || '获取通知失败');
    }
  }
);

export const markNotificationAsRead = createAsyncThunk(
  'notifications/markAsRead',
  async (id: string, { rejectWithValue }) => {
    try {
      await notificationService.markAsRead(id);
      return id;
    } catch (error: any) {
      return rejectWithValue(error.response?.data?.message || '更新通知失败');
    }
  }
);

export const markAllNotificationsAsRead = createAsyncThunk(
  'notifications/markAllAsRead',
  async (_, { rejectWithValue }) => {
    try {
      await notificationService.markAllAsRead();
      return true;
    } catch (error: any) {
      return rejectWithValue(error.response?.data?.message || '更新通知失败');
    }
  }
);

export const deleteNotification = createAsyncThunk(
  'notifications/delete',
  async (id: string, { rejectWithValue }) => {
    try {
      await notificationService.deleteNotification(id);
      return id;
    } catch (error: any) {
      return rejectWithValue(error.response?.data?.message || '删除通知失败');
    }
  }
);

const notificationSlice = createSlice({
  name: 'notifications',
  initialState,
  reducers: {
    clearError: (state) => {
      state.error = null;
    },
  },
  extraReducers: (builder) => {
    builder
      // Fetch notifications
      .addCase(fetchNotifications.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(fetchNotifications.fulfilled, (state, action: PayloadAction<any>) => {
        console.log('fetchNotifications.fulfilled payload:', action.payload);
        state.loading = false;
        const payload = action.payload || {};
        state.notifications = payload.items || [];
        state.total = payload.total || 0;
        state.unreadCount = payload.unreadCount || 0;
      })
      .addCase(fetchNotifications.rejected, (state, action) => {
        state.loading = false;
        console.error('fetchNotifications.rejected:', action.payload || action.error);
        state.error = action.payload as string;
      })
      // Mark as read
      .addCase(markNotificationAsRead.fulfilled, (state, action: PayloadAction<string>) => {
        const notification = state.notifications.find(n => n.id === action.payload);
        if (notification && !notification.isRead) {
          notification.isRead = true;
          state.unreadCount = Math.max(0, state.unreadCount - 1);
        }
      })
      // Mark all as read
      .addCase(markAllNotificationsAsRead.fulfilled, (state) => {
        state.notifications.forEach(n => {
          n.isRead = true;
        });
        state.unreadCount = 0;
      })
      // Delete notification
      .addCase(deleteNotification.fulfilled, (state, action: PayloadAction<string>) => {
        const notification = state.notifications.find(n => n.id === action.payload);
        if (notification && !notification.isRead) {
          state.unreadCount = Math.max(0, state.unreadCount - 1);
        }
        state.notifications = state.notifications.filter(n => n.id !== action.payload);
        state.total = Math.max(0, state.total - 1);
      });
  },
});

export const { clearError } = notificationSlice.actions;
export default notificationSlice.reducer;
