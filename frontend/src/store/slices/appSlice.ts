import { createSlice } from '@reduxjs/toolkit';

interface AppState {
  loading: boolean;
  loadingCount: number; // 用于处理多个并发请求
  darkMode: boolean;
}

const initialState: AppState = {
  loading: false,
  loadingCount: 0,
  darkMode: false, // 始终保持浅色模式
};

const appSlice = createSlice({
  name: 'app',
  initialState,
  reducers: {
    /**
     * 切换暗色模式 (已禁用)
     */
    toggleDarkMode: (state) => {
      state.darkMode = false;
      localStorage.removeItem('darkMode');
    },
    /**
     * 设置暗色模式 (已禁用)
     */
    setDarkMode: (state) => {
      state.darkMode = false;
      localStorage.removeItem('darkMode');
    },
    /**
     * 开始加载
     */
    startLoading: (state) => {
      state.loadingCount++;
      state.loading = true;
    },
    /**
     * 结束加载
     */
    stopLoading: (state) => {
      state.loadingCount = Math.max(0, state.loadingCount - 1);
      state.loading = state.loadingCount > 0;
    },
    /**
     * 强制重置加载状态
     */
    resetLoading: (state) => {
      state.loadingCount = 0;
      state.loading = false;
    },
  },
});

export const { startLoading, stopLoading, resetLoading, toggleDarkMode, setDarkMode } = appSlice.actions;
export default appSlice.reducer;
