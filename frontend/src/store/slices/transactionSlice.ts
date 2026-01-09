import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import { transactionService, Transaction, TransactionQuery } from '../../services/transactionService';

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
      return id;
    } catch (error: any) {
      return rejectWithValue(error.response?.data?.message || '删除交易记录失败');
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
        state.transactions = action.payload.data;
        state.total = action.payload.total;
        state.page = action.payload.page;
        state.limit = action.payload.limit;
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
      });
  },
});

export const { clearError, setPage, setLimit } = transactionSlice.actions;
export default transactionSlice.reducer;
