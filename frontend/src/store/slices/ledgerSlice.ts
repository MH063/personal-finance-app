import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import { ledgerService, Ledger } from '../../services/ledgerService';
import { collaborativeService } from '../../services/collaborativeService';

export interface LedgerState {
  ledgers: Ledger[];
  currentLedger: Ledger | null;
  loading: boolean;
  error: string | null;
}

export const fetchLedgers = createAsyncThunk(
  'ledgers/fetchAll',
  async (_, { rejectWithValue }) => {
    try {
      const data = await ledgerService.getLedgers();
      return data;
    } catch (error: any) {
      return rejectWithValue(error.response?.data?.message || '获取账本列表失败');
    }
  }
);

export const fetchLedgerDetail = createAsyncThunk(
  'ledgers/fetchDetail',
  async (id: string, { rejectWithValue }) => {
    try {
      const data = await ledgerService.getLedger(id);
      return data;
    } catch (error: any) {
      return rejectWithValue(error.response?.data?.message || '获取账本详情失败');
    }
  }
);

export const createLedger = createAsyncThunk(
  'ledgers/create',
  async (data: Partial<Ledger>, { rejectWithValue }) => {
    try {
      const result = await ledgerService.createLedger(data);
      // 发送通知
      collaborativeService.emit('ledgerUpdate', { type: 'ledger_created', id: result.id });
      return result;
    } catch (error: any) {
      return rejectWithValue(error.response?.data?.message || '创建账本失败');
    }
  }
);

export const updateLedger = createAsyncThunk(
  'ledgers/update',
  async ({ id, data }: { id: string; data: Partial<Ledger> }, { rejectWithValue }) => {
    try {
      const result = await ledgerService.updateLedger(id, data);
      // 发送通知
      collaborativeService.emit('ledgerUpdate', { type: 'ledger_updated', id: result.id });
      return result;
    } catch (error: any) {
      return rejectWithValue(error.response?.data?.message || '更新账本失败');
    }
  }
);

export const deleteLedger = createAsyncThunk(
  'ledgers/delete',
  async (id: string, { rejectWithValue }) => {
    try {
      await ledgerService.deleteLedger(id);
      // 发送通知
      collaborativeService.emit('ledgerUpdate', { type: 'ledger_deleted', id });
      return id;
    } catch (error: any) {
      return rejectWithValue(error.response?.data?.message || '删除账本失败');
    }
  }
);

const initialState: LedgerState = {
  ledgers: [],
  currentLedger: null,
  loading: false,
  error: null,
};

const ledgerSlice = createSlice({
  name: 'ledgers',
  initialState,
  reducers: {
    clearError: (state) => {
      state.error = null;
    },
    setCurrentLedger: (state, action) => {
      state.currentLedger = action.payload;
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchLedgers.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(fetchLedgers.fulfilled, (state, action: any) => {
        state.loading = false;
        state.ledgers = action.payload;
      })
      .addCase(fetchLedgers.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload as string;
      })
      .addCase(fetchLedgerDetail.fulfilled, (state, action: any) => {
        state.currentLedger = action.payload;
      })
      .addCase(createLedger.fulfilled, (state, action: any) => {
        state.ledgers.push(action.payload);
      })
      .addCase(updateLedger.fulfilled, (state, action: any) => {
        const index = state.ledgers.findIndex((l) => l.id === action.payload.id);
        if (index !== -1) {
          state.ledgers[index] = action.payload;
        }
      })
      .addCase(deleteLedger.fulfilled, (state, action) => {
        state.ledgers = state.ledgers.filter(l => l.id !== action.payload);
        if (state.currentLedger?.id === action.payload) {
          state.currentLedger = null;
        }
      });
  },
});

export const { clearError, setCurrentLedger } = ledgerSlice.actions;
export default ledgerSlice.reducer;
