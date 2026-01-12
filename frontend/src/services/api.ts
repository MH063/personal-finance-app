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

// 请求拦截器：添加 Token
api.interceptors.request.use(
  (config) => {
    // 开启全局加载状态（如果不在白名单中）
    if (store && shouldShowLoading(config.url)) {
      store.dispatch(startLoading());
    }

    const token = localStorage.getItem('accessToken');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
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
      return {
        ...response,
        data: response.data.data !== undefined ? response.data.data : response.data
      };
    }
    
    if (!isSilent) {
      console.log(`[API Response] ${response.config.method?.toUpperCase()} ${response.config.url}:`, response.data);
    }
    return response;
  },
  async (error) => {
    // 关闭全局加载状态
    if (store && shouldShowLoading(error.config?.url)) {
      store.dispatch(stopLoading());
    }

    // 处理 401 Token 过期（排除登录接口本身）
    if (error.response?.status === 401 && !error.config.url?.includes('/auth/login')) {
      const isSilent = error.config?.headers?.['X-Silent-Error'] === 'true';
      
      // 如果不是静默请求，则执行跳转
      if (!isSilent) {
        console.warn('[API] 认证失效，跳转登录页');
        localStorage.removeItem('accessToken');
        localStorage.removeItem('refreshToken');
        localStorage.removeItem('user');
        if (window.location.pathname !== '/login') {
          window.location.href = '/login';
        }
      } else {
        console.warn('[API] 后台请求认证失效，静默跳过跳转');
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
    if (!isSilent) {
      console.error(`[API Error] ${error.config?.method?.toUpperCase()} ${error.config?.url}:`, errorMessage);
    }
    
    // 将格式化后的错误信息附加到 error 对象上，以便下游使用
    if (error && typeof error === 'object') {
      error.formattedMessage = errorMessage;
    }
    
    return Promise.reject(error);
  }
);

export default api;
