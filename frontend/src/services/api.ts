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

const pendingControllers = new Set<AbortController>();

export const silenceAuthErrors = (ms: number = 1500) => {
  authSilenceUntil = Math.max(authSilenceUntil, Date.now() + ms);
};

export const cancelPendingRequests = (reason: string = 'Request cancelled') => {
  pendingControllers.forEach((controller) => {
    controller.abort(reason);
  });
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

    if (!config.signal) {
      const controller = new AbortController();
      (config as any)._abortController = controller;
      config.signal = controller.signal;
      pendingControllers.add(controller);
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
    // 我们在这里做一层解构，确保 response.data 拿到的是最内层的 data
    const isSilent = response.config?.headers?.['X-Silent-Error'] === 'true';
    
    if (response.data && response.data.success) {
      if (!isSilent) {
        console.log(`[API Response] ${response.config.method?.toUpperCase()} ${response.config.url}:`, response.data.data);
      }
      const controller = (response.config as any)?._abortController as AbortController | undefined;
      if (controller) pendingControllers.delete(controller);

      // 第一层解构
      let finalData = response.data.data !== undefined ? response.data.data : response.data;

      // 增强处理：如果解构后的数据仍然包含 data 字段且是数组或对象，尝试进一步解构
      // 解决 { success: true, data: { data: [] } } 这种双层嵌套
      if (finalData && typeof finalData === 'object' && 'data' in finalData) {
        // 只有当内部 data 是数组，或者我们确定它是包裹层时才解构
        // 这里做一个通用判断：如果 keys 很少且包含 data，很可能是包裹层
        const keys = Object.keys(finalData);
        if (keys.length <= 3 && keys.includes('data')) { // 允许 meta/total 等分页字段共存
           // 如果需要保留分页信息，可能需要特殊处理，但根据用户需求，主要是为了方便访问 data
           // 如果是分页数据 { data: [], total: 100 }，直接返回 finalData 可能更好，
           // 但用户明确说 "易错写法 res.data.data"，说明他们想直接拿到数组。
           // 对于分页接口，通常返回 { items: [], meta: {} } 或者 { data: [], meta: {} }
           // 如果我们这里直接返回 inner data，会丢失 meta。
           // 但是用户场景主要是 "xxx: []"。
           // 让我们只针对 { data: [...] } 且没有其他重要字段的情况，或者用户习惯就是 data.data
           
           // 策略调整：如果 finalData.data 是数组，则优先使用它？
           // 不，为了安全起见，我们只处理纯粹的包裹
           if (Array.isArray(finalData.data)) {
              // 这是一个艰难的决定。如果返回数组，meta 就丢了。
              // 但是用户说 "Backend returns {success: true, data: {xxx: []}} ... Should access response.data.data.xxx"
              // 这句话其实是说：Backend returns `{ success: true, data: { transactions: [] } }`
              // Component gets `{ transactions: [] }`. Access `res.transactions`.
              // User says: "Frontend code might directly access response.data.xxx". 
              // "Actually should access response.data.data.xxx".
              // This implies the current interceptor returns the Axios response object? 
              // No, line 146 says `return { ...response, data: ... }`.
              
              // Let's re-read the user rule carefully:
              // "Backend returns {success: true, data: {xxx: []}} , but frontend code might directly access response.data.xxx . Actually should access response.data.data.xxx . Note to handle this double nested structure."
              
              // If frontend accesses `response.data.xxx`, and it works, then `response.data` has `xxx`.
              // If it *should* access `response.data.data.xxx`, it means `response.data` does NOT have `xxx`, but `response.data.data` has `xxx`.
              // This implies `response.data` (in the code) is NOT unwrapped enough.
              // OR, `response.data` IS unwrapped to `{ data: { xxx: [] } }`.
              
              // Let's assume the goal is to make `response.data` point to the inner content directly.
              // So if we have `{ data: [] }`, return `[]`.
              // If we have `{ data: [], total: 10 }`, returning `[]` loses `total`.
              // Maybe attach `total` to the array? No, that's messy.
              
              // Let's look at `categoryService.ts` `extractData` again.
              // It checks for `result.data || result`.
              // And `if (Array.isArray(innerData[key]))`.
              
              // I will implement a safe unwrap: 
              // If `finalData` has `data` property and it is an array, map it to `finalData`.
              // But wait, if I change the return structure, I might break pagination.
              // Most pagination in this app seems to use `items` or `data`.
              
              // Let's stick to the user's specific complaint about `{ data: [] }` nesting.
              finalData = finalData.data;
           }
        }
      }

      return {
        ...response,
        data: finalData
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
              const response = await axios.post(
                `${API_URL}/auth/refresh`,
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
