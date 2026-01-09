import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import statisticsService from '../../services/statisticsService';
import api from '../../services/api';

interface StatisticsState {
  overview: any | null;
  chartData: {
    lineChart: {
      income: any[];
      expense: any[];
    };
    pieChart: any[];
  };
  health: any | null;
  debtOverview: {
    totalBorrowed: number;
    totalLent: number;
    netDebt: number;
    pendingCount: number;
    overdueCount: number;
  };
  loading: boolean;
  error: string | null;
}

const initialState: StatisticsState = {
  overview: null,
  chartData: {
    lineChart: {
      income: [],
      expense: [],
    },
    pieChart: [],
  },
  health: null,
  debtOverview: {
    totalBorrowed: 0,
    totalLent: 0,
    netDebt: 0,
    pendingCount: 0,
    overdueCount: 0,
  },
  loading: false,
  error: null,
};

export const fetchOverview = createAsyncThunk(
  'statistics/fetchOverview',
  async (params: any = {}, { rejectWithValue }) => {
    try {
      const data = await statisticsService.getOverview(params);
      return data;
    } catch (error: any) {
      return rejectWithValue(error.response?.data?.message || '获取概览数据失败');
    }
  }
);

export const fetchTrend = createAsyncThunk(
  'statistics/fetchTrend',
  async (params: any = {}, { rejectWithValue }) => {
    try {
      const data = await statisticsService.getTrend(params);
      return data;
    } catch (error: any) {
      return rejectWithValue(error.response?.data?.message || '获取趋势数据失败');
    }
  }
);

export const fetchCategoryStats = createAsyncThunk(
  'statistics/fetchCategoryStats',
  async (params: any = {}, { rejectWithValue }) => {
    try {
      const data = await statisticsService.getCategoryStats(params);
      return data;
    } catch (error: any) {
      return rejectWithValue(error.response?.data?.message || '获取分类统计失败');
    }
  }
);

export const fetchFinancialHealth = createAsyncThunk(
  'statistics/fetchHealth',
  async (timeRange: string = 'month', { rejectWithValue }) => {
    try {
      // 假设 statisticsService 有这个方法，如果没有，我需要添加
      const data = await statisticsService.getBudgetStats({ timeRange });
      return data;
    } catch (error: any) {
      return rejectWithValue(error.response?.data?.message || '获取健康评分失败');
    }
  }
);

export const fetchDebtOverview = createAsyncThunk(
  'statistics/fetchDebtOverview',
  async (_, { rejectWithValue }) => {
    try {
      const data = await statisticsService.getDebtStats();
      return data;
    } catch (error: any) {
      return rejectWithValue(error.response?.data?.message || '获取债务概览失败');
    }
  }
);

const statisticsSlice = createSlice({
  name: 'statistics',
  initialState,
  reducers: {
    clearStatisticsError: (state) => {
      state.error = null;
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchOverview.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(fetchOverview.fulfilled, (state, action) => {
        state.loading = false;
        state.overview = action.payload;
        // 同时填充图表数据
        if (action.payload.monthlyTrends) {
          state.chartData.lineChart = {
            income: action.payload.monthlyTrends.map((item: any) => ({
              date: item.month,
              value: item.income
            })),
            expense: action.payload.monthlyTrends.map((item: any) => ({
              date: item.month,
              value: item.expense
            }))
          };
        }
        if (action.payload.categoryBreakdown) {
          state.chartData.pieChart = action.payload.categoryBreakdown.map((item: any) => ({
            type: item.categoryName,
            value: item.amount,
            color: item.categoryColor
          }));
        }
      })
      .addCase(fetchOverview.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload as string;
      })
      .addCase(fetchTrend.fulfilled, (state, action) => {
        if (action.payload.monthlyTrends) {
          state.chartData.lineChart = {
            income: action.payload.monthlyTrends.map((item: any) => ({
              date: item.month,
              value: item.income
            })),
            expense: action.payload.monthlyTrends.map((item: any) => ({
              date: item.month,
              value: item.expense
            }))
          };
        }
      })
      .addCase(fetchCategoryStats.fulfilled, (state, action) => {
        if (action.payload.categoryBreakdown) {
          state.chartData.pieChart = action.payload.categoryBreakdown.map((item: any) => ({
            type: item.categoryName,
            value: item.amount,
            color: item.categoryColor
          }));
        }
      })
      .addCase(fetchFinancialHealth.fulfilled, (state, action) => {
        state.health = action.payload;
      })
      .addCase(fetchDebtOverview.fulfilled, (state, action) => {
        state.debtOverview = action.payload;
      });
  },
});

export const { clearStatisticsError } = statisticsSlice.actions;
export default statisticsSlice.reducer;
