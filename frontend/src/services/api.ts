import axios from 'axios';
import { startLoading, stopLoading } from '../store/slices/appSlice';

let store: any;

export const injectStore = (_store: any) => {
  store = _store;
};

const getApiUrl = () => {
  // 如果环境变量中有定义，优先使用环境变量
  if (import.meta.env.VITE_API_URL) {
    return import.meta.env.VITE_API_URL;
  }
  
  // 否则根据当前页面的 hostname 动态生成 API 地址
  const hostname = window.location.hostname;
  // 保持端口 4000 和路径前缀 /api/v1
  return `http://${hostname}:4000/api/v1`;
};

const API_URL = getApiUrl();
let isRefreshingToken = false;
let refreshTokenPromise: Promise<string | null> | null = null;
let isHandlingAuthFailure = false;
let authSilenceUntil = 0;

const pendingControllers = new Map<AbortController, { preventCancel: boolean }>();

export const silenceAuthErrors = (ms: number = 1500) => {
  authSilenceUntil = Math.max(authSilenceUntil, Date.now() + ms);
};

export const cancelPendingRequests = (reason: string = 'Request cancelled') => {
  let aborted = 0;
  let skipped = 0;
  pendingControllers.forEach((meta, controller) => {
    if (meta?.preventCancel) {
      skipped++;
      return;
    }
    controller.abort(reason);
    aborted++;
  });
  if (aborted > 0 || skipped > 0) {
    console.log(`[API] cancelPendingRequests: aborted=${aborted}, skipped=${skipped}, reason="${reason}"`);
  }
  pendingControllers.clear();
};

const api = axios.create({
  baseURL: API_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

// 不需要显示全局 Loading 的接口白名单
const loadingWhitelist = [
  '/statistics',
  '/backup',
  '/auth/profile', // 获取用户信息通常在后台静默进行
];

/**
 * 判断请求是否需要显示 Loading
 */
const shouldShowLoading = (url?: string) => {
  if (!url) return false; // 默认不显示，除非明确知道 URL
  // 统一处理 URL 格式
  const path = url.split('?')[0];
  return !loadingWhitelist.some(item => path.includes(item));
};

// 请求拦截器：添加 Token 和根据 Electron 提供的网卡 IP 动态设置 API 基础地址
api.interceptors.request.use(
  async (config) => {
    const silentLoading = !!(config.headers && (config.headers as any)['X-Silent-Loading'] === 'true');
    if (!silentLoading && store && shouldShowLoading(config.url)) {
      store.dispatch(startLoading());
    }

    try {
      const hasElectron = typeof window !== 'undefined' && (window as any).electronAPI && typeof (window as any).electronAPI.getApiBaseUrl === 'function';
      if (hasElectron) {
        const base = await (window as any).electronAPI.getApiBaseUrl();
        if (base && typeof base === 'string' && base.startsWith('http')) {
          config.baseURL = base;
        }
      } else if (import.meta && import.meta.env && import.meta.env.VITE_API_URL) {
        config.baseURL = import.meta.env.VITE_API_URL;
      } else if (typeof window !== 'undefined' && window.location && window.location.hostname) {
        const hostname = window.location.hostname;
        const ipLike = hostname && hostname !== 'localhost' && hostname !== '127.0.0.1' ? hostname : undefined;
        config.baseURL = `http://${ipLike || '127.0.0.1'}:4000/api/v1`;
      }
    } catch {
      // 忽略动态基础地址设置错误，使用默认值
    }

    const token = localStorage.getItem('accessToken');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }

    const shouldSilence = Date.now() < authSilenceUntil;
    if (shouldSilence) {
      config.headers = config.headers || {};
      config.headers['X-Silent-Error'] = 'true';
    }

    const preventCancel = !!(config.headers && (config.headers as any)['X-Prevent-Cancel'] === 'true');
    if (!config.signal) {
      const controller = new AbortController();
      (config as any)._abortController = controller;
      config.signal = controller.signal;
      pendingControllers.set(controller, { preventCancel });
      if (preventCancel) {
        console.log(`[API] Exempt from route cancel: ${config.method?.toUpperCase()} ${config.url}`);
      }
    }

    // 过滤掉值为 undefined, null 或空字符串的查询参数
    if (config.params) {
      const cleanParams = Object.keys(config.params).reduce((acc: any, key) => {
        let value = config.params[key];
        
        // 如果 value 是对象且只有一个 key 且 key 与外层 key 相同，则解包
        // 例如 { type: { type: 'expense' } } -> { type: 'expense' }
        if (value && typeof value === 'object' && !Array.isArray(value)) {
          const keys = Object.keys(value);
          if (keys.length === 1 && keys[0] === key) {
            value = value[key];
          }
        }

        if (value !== undefined && value !== null && value !== '') {
          acc[key] = value;
        }
        return acc;
      }, {});
      config.params = cleanParams;
    }

    return config;
  },
  (error) => {
    // 关闭全局加载状态
    if (store) {
      store.dispatch(stopLoading());
    }
    return Promise.reject(error);
  }
);

// 响应拦截器：处理 Loading、Token 过期及数据解构
api.interceptors.response.use(
  (response) => {
    // 关闭全局加载状态
    if (store && shouldShowLoading(response.config.url)) {
      store.dispatch(stopLoading());
    }

    // 根据用户规则 5: 后端返回的数据结构是 {success: true, data: {xxx: []}}
    // 我们在这里做一层解构，确保 response.data 拿到的是内层的 data 对象
    // 实际上对于分页接口，结构可能是 { success: true, data: { data: [], total: 10 } }
    // 第一层解构后，response.data 为 { data: [], total: 10 }
    // 这样在业务层可以通过 response.data.data 访问数组，通过 response.data.total 访问总量
    // 这完美符合用户规则 5: "实际上应该访问 response.data.data.xxx"
    const isSilent = response.config?.headers?.['X-Silent-Error'] === 'true';
    
    if (response.data && response.data.success) {
      if (!isSilent) {
        console.log(`[API Response Success] ${response.config.method?.toUpperCase()} ${response.config.url}:`, response.data.data);
      }
      const controller = (response.config as any)?._abortController as AbortController | undefined;
      if (controller) pendingControllers.delete(controller);

      // 仅解构第一层 data，保留内层所有结构（如 data 数组、total 等分页信息）
      return {
        ...response,
        data: response.data.data !== undefined ? response.data.data : response.data
      };
    }
    
    if (!isSilent) {
      console.log(`[API Response] ${response.config.method?.toUpperCase()} ${response.config.url}:`, response.data);
    }
    const controller = (response.config as any)?._abortController as AbortController | undefined;
    if (controller) pendingControllers.delete(controller);
    return response;
  },
  async (error) => {
    // 关闭全局加载状态
    if (store && shouldShowLoading(error.config?.url)) {
      store.dispatch(stopLoading());
    }

    const originalConfig = error.config || {};
    const requestUrl: string = originalConfig.url || '';
    const isAuthRequest = requestUrl.includes('/auth/login') || requestUrl.includes('/auth/refresh');
    const controller = (originalConfig as any)?._abortController as AbortController | undefined;
    if (controller) pendingControllers.delete(controller);
    const isCanceled = error?.code === 'ERR_CANCELED' || error?.name === 'CanceledError';
    if (isCanceled) {
      return Promise.reject(error);
    }
    const isAuthSuppressedByTime = Date.now() < authSilenceUntil;
    const isPublicPath = window.location.pathname === '/login' || window.location.pathname === '/register';
    const isLoggedOut = !localStorage.getItem('accessToken') && !localStorage.getItem('refreshToken');

    if (error.response?.status === 401 && !isAuthRequest) {
      const silent401 =
        originalConfig?.headers?.['X-Silent-Error'] === 'true' ||
        isAuthSuppressedByTime ||
        isPublicPath ||
        isLoggedOut;
      const storedRefreshToken = localStorage.getItem('refreshToken');

      if (!silent401) {
        console.log(`[API] 401 Detected for ${requestUrl}. Silent: ${silent401}, HasRefreshToken: ${!!storedRefreshToken}, Retry: ${originalConfig._retry}`);
      }

      if (!originalConfig._retry && storedRefreshToken && typeof storedRefreshToken === 'string') {
        originalConfig._retry = true;

        if (!refreshTokenPromise) {
          console.log('[API] Initiating Token Refresh...');
          refreshTokenPromise = (async () => {
            if (isRefreshingToken) {
                console.log('[API] Token Refresh already in progress, waiting...');
                return null;
            }
            isRefreshingToken = true;
            try {
              const base = (api.defaults.baseURL || API_URL).replace(/\/$/, '');
              const response = await axios.post(
                `${base}/auth/refresh`,
                { refreshToken: storedRefreshToken },
                { headers: { 'Content-Type': 'application/json' } }
              );

              console.log('[API] Token Refresh Response:', response.status);
              const payload = response?.data?.data ?? response?.data;
              
              // 兼容 payload.tokens.accessToken 或直接 payload.accessToken
              const newAccessToken = payload?.tokens?.accessToken || payload?.accessToken;
              const newRefreshToken = payload?.tokens?.refreshToken || payload?.refreshToken;

              if (newAccessToken) {
                console.log('[API] New Access Token received');
                localStorage.setItem('accessToken', newAccessToken);
              }
              if (newRefreshToken) {
                console.log('[API] New Refresh Token received');
                localStorage.setItem('refreshToken', newRefreshToken);
              }

              return newAccessToken || null;
            } catch (refreshError) {
              console.error('[API] Token Refresh Failed:', refreshError);
              return null;
            } finally {
              isRefreshingToken = false;
              refreshTokenPromise = null;
            }
          })();
        } else {
             console.log('[API] Reusing existing Refresh Promise');
        }

        const newToken = await refreshTokenPromise;
        if (newToken) {
          console.log(`[API] Retrying original request ${requestUrl} with new token`);
          originalConfig.headers = originalConfig.headers || {};
          originalConfig.headers.Authorization = `Bearer ${newToken}`;
          return api(originalConfig);
        } else {
            console.warn('[API] Refresh failed or returned no token, proceeding to logout');
        }
      } else {
          if (!silent401) {
            console.log('[API] No refresh token available or already retried.');
          }
      }

      if (!isHandlingAuthFailure && !silent401) {
        isHandlingAuthFailure = true;
        console.warn('[API] 认证失效，跳转登录页');
        cancelPendingRequests('Auth invalidated');
        localStorage.removeItem('accessToken');
        localStorage.removeItem('refreshToken');
        localStorage.removeItem('user');
        if (window.location.pathname !== '/login') {
          window.location.href = '/login';
        }
        setTimeout(() => {
          isHandlingAuthFailure = false;
        }, 1500);
      }
    }

    // 提取后端返回的错误信息
    let errorMessage = error.response?.data?.message || error.message || '网络请求失败';
    
    // 如果错误信息是数组（通常是 NestJS 验证错误），将其转换为字符串
    if (Array.isArray(errorMessage)) {
      errorMessage = errorMessage.join(', ');
    }
    
    // 检查是否需要静默处理错误（不打印到控制台）
    const isSilent = error.config?.headers?.['X-Silent-Error'] === 'true';
    const syncAction = error.config?.headers?.['X-Sync-Action'];
    const entityId = error.config?.headers?.['X-Entity-ID'];

    const shouldSkipConsoleError =
      error.response?.status === 401 && (isPublicPath || isLoggedOut || isAuthSuppressedByTime);

    if (!isSilent && !shouldSkipConsoleError) {
      console.error(`[API Error] ${error.config?.method?.toUpperCase()} ${error.config?.url}:`, errorMessage);
    } else if (syncAction) {
      // 如果是同步请求且开启了静默错误，我们在控制台打印更友好的调试信息，而不是红色的 Error
      console.warn(`[Sync Warning] ${syncAction} 失败 (ID: ${entityId}):`, errorMessage);
    }
    
    // 将格式化后的错误信息附加到 error 对象上，以便下游使用
    if (error && typeof error === 'object') {
      error.formattedMessage = errorMessage;
      // 同时覆盖原有的 message，确保 UI 层捕获到的是友好的中文提示
      error.message = errorMessage;
    }
    
    return Promise.reject(error);
  }
);

export default api;
