import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import aiService, { HealthAnalysis, ForecastData } from '../../services/aiService';

interface AiState {
  healthAnalysis: HealthAnalysis | null;
  forecast: ForecastData[] | null;
  loading: boolean;
  error: string | null;
}

const initialState: AiState = {
  healthAnalysis: null,
  forecast: null,
  loading: false,
  error: null,
};

export const fetchAiHealthAnalysis = createAsyncThunk(
  'ai/fetchHealthAnalysis',
  async (_, { rejectWithValue }) => {
    try {
      const data = await aiService.getHealthAnalysis();
      return data;
    } catch (error: any) {
      return rejectWithValue(error.message || '获取 AI 健康分析失败');
    }
  }
);

export const fetchAiForecast = createAsyncThunk(
  'ai/fetchForecast',
  async (_, { rejectWithValue }) => {
    try {
      const data = await aiService.getForecast();
      return data;
    } catch (error: any) {
      return rejectWithValue(error.message || '获取 AI 预测数据失败');
    }
  }
);

const aiSlice = createSlice({
  name: 'ai',
  initialState,
  reducers: {
    clearAiData: (state) => {
      state.healthAnalysis = null;
      state.forecast = null;
    },
  },
  extraReducers: (builder) => {
    builder
      // Health Analysis
      .addCase(fetchAiHealthAnalysis.pending, (state) => {
        state.loading = true;
      })
      .addCase(fetchAiHealthAnalysis.fulfilled, (state, action) => {
        state.loading = false;
        state.healthAnalysis = action.payload;
      })
      .addCase(fetchAiHealthAnalysis.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload as string;
      })
      // Forecast
      .addCase(fetchAiForecast.pending, (state) => {
        state.loading = true;
      })
      .addCase(fetchAiForecast.fulfilled, (state, action) => {
        state.loading = false;
        state.forecast = action.payload;
      })
      .addCase(fetchAiForecast.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload as string;
      });
  },
});

export const { clearAiData } = aiSlice.actions;
export default aiSlice.reducer;
