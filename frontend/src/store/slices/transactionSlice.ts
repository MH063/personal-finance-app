import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import { transactionService, Transaction, TransactionQuery } from '../../services/transactionService';
import { collaborativeService } from '../../services/collaborativeService';
import { offlineSyncService } from '../../services/offlineSyncService';

export interface TransactionState {
  transactions: Transaction[];
  total: number;
  page: number;
  limit: number;
  loading: boolean;
  error: string | null;
}

export const fetchTransactions = createAsyncThunk(
  'transactions/fetchAll',
  async (query: TransactionQuery = {}, { rejectWithValue }) => {
    try {
      const data = await transactionService.getTransactions(query);
      return data;
    } catch (error: any) {
      return rejectWithValue(error.response?.data?.message || '获取交易记录失败');
    }
  }
);

export const createTransaction = createAsyncThunk(
  'transactions/create',
  async (data: Partial<Transaction>, { rejectWithValue }) => {
    try {
      const result = await transactionService.createTransaction(data);
      // 发送通知
      collaborativeService.emit('ledgerUpdate', { type: 'transaction_created', id: result.id });
      return result;
    } catch (error: any) {
      return rejectWithValue(error.response?.data?.message || '创建交易记录失败');
    }
  }
);

export const updateTransaction = createAsyncThunk(
  'transactions/update',
  async ({ id, data }: { id: string; data: Partial<Transaction> }, { rejectWithValue }) => {
    try {
      const result = await transactionService.updateTransaction(id, data);
      // 发送通知
      collaborativeService.emit('ledgerUpdate', { type: 'transaction_updated', id: result.id });
      return result;
    } catch (error: any) {
      return rejectWithValue(error.response?.data?.message || '更新交易记录失败');
    }
  }
);

export const deleteTransaction = createAsyncThunk(
  'transactions/delete',
  async (id: string, { rejectWithValue }) => {
    try {
      await transactionService.deleteTransaction(id);
      // 在线删除成功才广播删除事件；离线删除不广播，避免误导
      if (offlineSyncService.isOnline()) {
        collaborativeService.emit('ledgerUpdate', { type: 'transaction_deleted', id });
      }
      return id;
    } catch (error: any) {
      return rejectWithValue(error.response?.data?.message || '删除交易记录失败');
    }
  }
);

export const batchDeleteTransactions = createAsyncThunk(
  'transactions/batchDelete',
  async (ids: string[], { rejectWithValue }) => {
    try {
      await transactionService.batchDeleteTransactions(ids);
      // 在线成功才广播批量删除事件
      if (offlineSyncService.isOnline()) {
        collaborativeService.emit('ledgerUpdate', { type: 'transaction_batch_deleted', ids });
      }
      return ids;
    } catch (error: any) {
      return rejectWithValue(error.response?.data?.message || '批量删除交易记录失败');
    }
  }
);


const initialState: TransactionState = {
  transactions: [],
  total: 0,
  page: 1,
  limit: 20,
  loading: false,
  error: null,
};

const transactionSlice = createSlice({
  name: 'transactions',
  initialState,
  reducers: {
    clearError: (state) => {
      state.error = null;
    },
    setPage: (state, action) => {
      state.page = action.payload;
    },
    setLimit: (state, action) => {
      state.limit = action.payload;
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchTransactions.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(fetchTransactions.fulfilled, (state, action: any) => {
        state.loading = false;
        // 确保 action.payload 存在且具有预期结构
        const payload = action.payload || {};
        state.transactions = payload.data || [];
        state.total = payload.total || 0;
        state.page = payload.page || 1;
        state.limit = payload.limit || 20;
      })
      .addCase(fetchTransactions.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload as string;
      })
      .addCase(createTransaction.fulfilled, (state, action: any) => {
        state.transactions.unshift(action.payload);
        state.total += 1;
      })
      .addCase(updateTransaction.fulfilled, (state, action: any) => {
        const index = state.transactions.findIndex((t) => t.id === action.payload.id);
        if (index !== -1) {
          state.transactions[index] = action.payload;
        }
      })
      .addCase(deleteTransaction.fulfilled, (state, action) => {
        state.transactions = state.transactions.filter((t) => t.id !== action.payload);
        state.total -= 1;
      })
      .addCase(batchDeleteTransactions.fulfilled, (state, action) => {
        const deletedIds = action.payload;
        state.transactions = state.transactions.filter((t) => !deletedIds.includes(t.id));
        state.total -= deletedIds.length;
      });
  },
});

export const { clearError, setPage, setLimit } = transactionSlice.actions;
export default transactionSlice.reducer;
