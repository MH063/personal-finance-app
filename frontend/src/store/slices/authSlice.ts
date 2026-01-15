import { createSlice, createAsyncThunk, PayloadAction } from '@reduxjs/toolkit';
import { authService, User, LoginCredentials, RegisterData } from '../../services/authService';
import { offlineSyncService } from '../../services/offlineSyncService';
import { db } from '../../db/db';

interface AuthState {
  user: User | null;
  isAuthenticated: boolean;
  loading: boolean;
  error: string | null;
  accessToken: string | null;
}

const LAST_USER_ID_KEY = 'lastUserId';

/**
 * 用户切换时清理本地离线缓存与同步队列，避免跨账号数据串用
 */
const resetLocalCacheIfUserChanged = async (nextUserId?: string | null) => {
  if (!nextUserId) return;

  const prevUserId = localStorage.getItem(LAST_USER_ID_KEY);
  if (!prevUserId) {
    try {
      const pendingCount = await db.syncQueue.count();
      if (pendingCount === 0) {
        const [debtsCount, ledgersCount, categoriesCount, transactionsCount, budgetsCount] = await Promise.all([
          db.debts.count(),
          db.ledgers.count(),
          db.categories.count(),
          db.transactions.count(),
          db.budgets.count(),
        ]);
        const hasLegacyCache = debtsCount + ledgersCount + categoriesCount + transactionsCount + budgetsCount > 0;
        if (hasLegacyCache) {
          console.log('[Auth] 检测到历史本地缓存且无待同步项，已清空以避免跨账号脏数据');
          await db.clearAll();
        }
      }
    } catch (error) {
      console.warn('[Auth] 初始化用户标识时检查本地缓存失败', error);
    }
    localStorage.setItem(LAST_USER_ID_KEY, nextUserId);
    return;
  }

  if (prevUserId && prevUserId !== nextUserId) {
    console.log(`[Auth] 检测到用户切换: ${prevUserId} -> ${nextUserId}，清空本地缓存与同步队列`);
    try {
      await db.clearAll();
    } catch (error) {
      console.warn('[Auth] 清空本地缓存失败，将继续登录流程', error);
    }
  }

  localStorage.setItem(LAST_USER_ID_KEY, nextUserId);
};

export const login = createAsyncThunk(
  'auth/login',
  async (credentials: LoginCredentials, { rejectWithValue }) => {
    try {
      const data = await authService.login(credentials);
      const { accessToken, refreshToken } = data.tokens;
      localStorage.setItem('accessToken', accessToken);
      localStorage.setItem('refreshToken', refreshToken);
      await resetLocalCacheIfUserChanged(data.user?.id);
      return data;
    } catch (error: any) {
      return rejectWithValue(error.response?.data?.message || '登录失败');
    }
  }
);

export const register = createAsyncThunk(
  'auth/register',
  async (data: RegisterData, { rejectWithValue }) => {
    try {
      const result = await authService.register(data);
      console.log('[Auth] Register response:', result);

      const accessToken = result.tokens?.accessToken || result.accessToken;
      const refreshToken = result.tokens?.refreshToken || result.refreshToken;

      if (!accessToken || !refreshToken) {
        console.error('[Auth] Missing tokens in register response:', result);
        throw new Error('注册失败：服务器返回的 Token 无效');
      }

      localStorage.setItem('accessToken', accessToken);
      localStorage.setItem('refreshToken', refreshToken);
      
      const user = result.user || result.data?.user || result;
      await resetLocalCacheIfUserChanged(user?.id);
      
      if (result.tokens) {
        return result;
      } else {
        return {
          user: user,
          tokens: { accessToken, refreshToken }
        };
      }
    } catch (error: any) {
      console.error('[Auth] Register error:', error);
      return rejectWithValue(error.response?.data?.message || error.message || '注册失败');
    }
  }
);

export const getProfile = createAsyncThunk(
  'auth/getProfile',
  async (_, { rejectWithValue }) => {
    try {
      const data = await authService.getProfile();
      await resetLocalCacheIfUserChanged(data?.id);
      return data;
    } catch (error: any) {
      return rejectWithValue(error.response?.data?.message || '获取用户信息失败');
    }
  }
);

export const updateProfile = createAsyncThunk(
  'auth/updateProfile',
  async (data: Partial<User>, { rejectWithValue }) => {
    try {
      const result = await authService.updateProfile(data);
      return result;
    } catch (error: any) {
      return rejectWithValue(error.response?.data?.message || '更新用户信息失败');
    }
  }
);
export const logout = createAsyncThunk('auth/logout', async (token?: string | null) => {
  try {
    await authService.logout(token || undefined);
  } catch (error) {
    const status = (error as any)?.response?.status;
    if (status !== 401 && status !== 404) {
      console.warn('Logout error (non-401/404):', error);
    }
  } finally {
    localStorage.removeItem('accessToken');
    localStorage.removeItem('refreshToken');
    localStorage.removeItem('user');
    localStorage.removeItem(LAST_USER_ID_KEY);
    try {
      await db.clearAll();
    } catch (error) {
      console.warn('[Auth] 退出登录清空本地缓存失败', error);
    }
  }
});

const initialState: AuthState = {
  user: null,
  isAuthenticated: false,
  loading: false,
  error: null,
  accessToken: localStorage.getItem('accessToken'),
};

const authSlice = createSlice({
  name: 'auth',
  initialState,
  reducers: {
    clearError: (state) => {
      state.error = null;
    },
    /**
     * 开始登出（同步更新本地状态，立刻阻止后续受认证影响的副作用）
     */
    beginLogout: (state) => {
      state.isAuthenticated = false;
      state.user = null;
      state.accessToken = null;
      // 立即清理本地存储，避免后续请求误发
      try {
        localStorage.removeItem('accessToken');
        localStorage.removeItem('refreshToken');
        localStorage.removeItem('user');
      } catch (e) {
        console.warn('[Auth] 清理本地令牌失败', e);
      }
    },
    setTokens: (state, action: PayloadAction<{ accessToken: string; refreshToken: string }>) => {
      state.accessToken = action.payload.accessToken;
      localStorage.setItem('accessToken', action.payload.accessToken);
      localStorage.setItem('refreshToken', action.payload.refreshToken);
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(login.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(login.fulfilled, (state, action) => {
        state.loading = false;
        state.isAuthenticated = true;
        state.user = action.payload.user;
        // 登录成功后初始化同步服务
        setTimeout(() => offlineSyncService.init(), 0);
      })
      .addCase(login.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload as string;
      })
      .addCase(register.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(register.fulfilled, (state, action) => {
        state.loading = false;
        state.isAuthenticated = true;
        state.user = action.payload.user;
        // 注册成功后初始化同步服务
        setTimeout(() => offlineSyncService.init(), 0);
      })
      .addCase(register.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload as string;
      })
      .addCase(getProfile.pending, (state) => {
        state.loading = true;
      })
      .addCase(getProfile.fulfilled, (state, action) => {
        state.loading = false;
        state.isAuthenticated = true;
        state.user = action.payload;
        // 获取用户信息成功后初始化同步服务
        setTimeout(() => offlineSyncService.init(), 0);
      })
      .addCase(getProfile.rejected, (state) => {
        state.loading = false;
        state.isAuthenticated = false;
        state.user = null;
        state.accessToken = null;
      })
      .addCase(updateProfile.pending, (state) => {
        state.loading = true;
      })
      .addCase(updateProfile.fulfilled, (state, action) => {
        state.loading = false;
        state.user = action.payload;
      })
      .addCase(updateProfile.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload as string;
      })
      .addCase(logout.fulfilled, (state) => {
        state.isAuthenticated = false;
        state.user = null;
        state.accessToken = null;
      });
  },
});

export const { clearError, setTokens, beginLogout } = authSlice.actions;
export default authSlice.reducer;
