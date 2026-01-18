import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import debtService, { Debt } from '../../services/debtService';
import { collaborativeService } from '../../services/collaborativeService';

const dedupeDebts = (items: Debt[]) => {
  const map = new Map<string, Debt>();
  for (const item of items || []) {
    if (!item?.id) continue;
    map.set(item.id, item);
  }
  return Array.from(map.values());
};

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
    totalAccruedInterest: number;
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
      return rejectWithValue(error.message || '获取债务列表失败');
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
      return rejectWithValue(error.message || '获取债务统计失败');
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
      return rejectWithValue(error.message || '创建债务失败');
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
      return rejectWithValue(error.message || '更新债务失败');
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
      return rejectWithValue(error.message || '删除债务失败');
    }
  }
);

export const syncDebtsToTransactions = createAsyncThunk(
  'debts/syncToTransactions',
  async (_, { rejectWithValue }) => {
    try {
      const data = await debtService.syncDebtsToTransactions();
      return data;
    } catch (error: any) {
      return rejectWithValue(error.message || '同步债务失败');
    }
  }
);

export const repayDebt = createAsyncThunk(
  'debts/repay',
  /**
   * 还款确认/新增（返回最新债务用于立即刷新进度）
   */
  async (
    {
      id,
      amount,
      paymentDate,
      paymentMethod,
      paymentId,
      note,
    }: {
      id: string;
      amount: number;
      paymentDate: string;
      paymentMethod?: string;
      paymentId?: string;
      note?: string;
    },
    { rejectWithValue },
  ) => {
    try {
      let data;
      if (paymentId) {
        // Confirm existing pending payment
        await debtService.updatePayment(id, paymentId, { amount, paymentDate, paymentMethod, status: 'confirmed', note });
        // After update, we should fetch the updated debt to refresh UI
        data = await debtService.getDebt(id);
      } else {
        // Create new payment
        // 使用 repayDebt 保证网络写入后立即获取最新债务详情
        data = await debtService.repayDebt(id, amount, paymentDate, paymentMethod);
      }
      
      // 发送通知
      collaborativeService.emit('ledgerUpdate', { type: 'debt_repaid', id });
      return data;
    } catch (error: any) {
      return rejectWithValue(error.message || '记录还款失败');
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
    totalAccruedInterest: 0,
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
        state.debts = dedupeDebts(action.payload || []);
      })
      .addCase(fetchDebts.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload as string;
      })
      .addCase(fetchDebtStatistics.fulfilled, (state, action) => {
        state.statistics = action.payload;
      })
      .addCase(createDebt.fulfilled, (state, action) => {
        const index = state.debts.findIndex((d) => d.id === action.payload.id);
        if (index !== -1) {
          state.debts[index] = action.payload;
        } else {
          state.debts.unshift(action.payload);
        }
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
