import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import debtService, { Debt } from '../../services/debtService';
import { collaborativeService } from '../../services/collaborativeService';

interface DebtState {
  debts: Debt[];
  statistics: {
    totalDebts: number;
    totalBorrowed: number;
    totalLent: number;
    pendingDebts: number;
    overdueDebts: number;
    dueSoonDebts: number;
    totalPendingAmount: number;
    totalOverdueAmount: number;
  };
  loading: boolean;
  error: string | null;
}

export const fetchDebts = createAsyncThunk(
  'debts/fetchAll',
  async (params: any = {}, { rejectWithValue }) => {
    try {
      const data = await debtService.getDebts(params);
      return data;
    } catch (error: any) {
      return rejectWithValue(error.response?.data?.message || '获取债务列表失败');
    }
  }
);

export const fetchDebtStatistics = createAsyncThunk(
  'debts/fetchStatistics',
  async (_, { rejectWithValue }) => {
    try {
      const data = await debtService.getDebtStatistics();
      return data;
    } catch (error: any) {
      return rejectWithValue(error.response?.data?.message || '获取债务统计失败');
    }
  }
);

export const createDebt = createAsyncThunk(
  'debts/create',
  async (data: Partial<Debt>, { rejectWithValue }) => {
    try {
      const dataResult = await debtService.createDebt(data);
      // 发送通知
      collaborativeService.emit('ledgerUpdate', { type: 'debt_created', id: dataResult.id });
      return dataResult;
    } catch (error: any) {
      return rejectWithValue(error.response?.data?.message || '创建债务失败');
    }
  }
);

export const updateDebt = createAsyncThunk(
  'debts/update',
  async ({ id, data }: { id: string; data: Partial<Debt> }, { rejectWithValue }) => {
    try {
      const dataResult = await debtService.updateDebt(id, data);
      // 发送通知
      collaborativeService.emit('ledgerUpdate', { type: 'debt_updated', id: dataResult.id });
      return dataResult;
    } catch (error: any) {
      return rejectWithValue(error.response?.data?.message || '更新债务失败');
    }
  }
);

export const deleteDebt = createAsyncThunk(
  'debts/delete',
  async (id: string, { rejectWithValue }) => {
    try {
      await debtService.deleteDebt(id);
      // 发送通知
      collaborativeService.emit('ledgerUpdate', { type: 'debt_deleted', id });
      return id;
    } catch (error: any) {
      return rejectWithValue(error.response?.data?.message || '删除债务失败');
    }
  }
);

export const repayDebt = createAsyncThunk(
  'debts/repay',
  async ({ id, amount, paymentDate }: { id: string; amount: number; paymentDate: string }, { rejectWithValue }) => {
    try {
      const data = await debtService.repayDebt(id, amount, paymentDate);
      // 发送通知
      collaborativeService.emit('ledgerUpdate', { type: 'debt_repaid', id });
      return data;
    } catch (error: any) {
      return rejectWithValue(error.response?.data?.message || '记录还款失败');
    }
  }
);

const initialState: DebtState = {
  debts: [],
  statistics: {
    totalDebts: 0,
    totalBorrowed: 0,
    totalLent: 0,
    pendingDebts: 0,
    overdueDebts: 0,
    dueSoonDebts: 0,
    totalPendingAmount: 0,
    totalOverdueAmount: 0,
  },
  loading: false,
  error: null,
};

const debtSlice = createSlice({
  name: 'debts',
  initialState,
  reducers: {
    clearError: (state) => {
      state.error = null;
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchDebts.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(fetchDebts.fulfilled, (state, action) => {
        state.loading = false;
        state.debts = action.payload;
      })
      .addCase(fetchDebts.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload as string;
      })
      .addCase(fetchDebtStatistics.fulfilled, (state, action) => {
        state.statistics = action.payload;
      })
      .addCase(createDebt.fulfilled, (state, action) => {
        state.debts.unshift(action.payload);
      })
      .addCase(updateDebt.fulfilled, (state, action) => {
        const index = state.debts.findIndex((d) => d.id === action.payload.id);
        if (index !== -1) {
          state.debts[index] = action.payload;
        }
      })
      .addCase(deleteDebt.fulfilled, (state, action) => {
        state.debts = state.debts.filter((d) => d.id !== action.payload);
      })
      .addCase(repayDebt.fulfilled, (state, action) => {
        const index = state.debts.findIndex((d) => d.id === action.payload.id);
        if (index !== -1) {
          state.debts[index] = action.payload;
        }
      });
  },
});

export const { clearError } = debtSlice.actions;
export default debtSlice.reducer;
export type { Debt };
