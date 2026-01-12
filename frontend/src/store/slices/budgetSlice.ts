import { createSlice, createAsyncThunk, PayloadAction } from '@reduxjs/toolkit';
import budgetService from '../../services/budgetService';
import { Budget, CreateBudgetDto, UpdateBudgetDto } from '../../types';
import { collaborativeService } from '../../services/collaborativeService';

interface BudgetState {
  budgets: Budget[];
  currentBudget: Budget | null;
  loading: boolean;
  error: string | null;
}

const initialState: BudgetState = {
  budgets: [],
  currentBudget: null,
  loading: false,
  error: null,
};

export const fetchBudgets = createAsyncThunk('budget/fetchAll', async (_, { rejectWithValue }) => {
  try {
    return await budgetService.getAllBudgets();
  } catch (error: any) {
    return rejectWithValue(error.response?.data?.message || '获取预算失败');
  }
});

export const fetchBudgetById = createAsyncThunk('budget/fetchById', async (id: string, { rejectWithValue }) => {
  try {
    return await budgetService.getBudgetById(id);
  } catch (error: any) {
    return rejectWithValue(error.response?.data?.message || '获取预算详情失败');
  }
});

export const createBudget = createAsyncThunk('budget/create', async (data: CreateBudgetDto, { rejectWithValue }) => {
  try {
    const result = await budgetService.createBudget(data);
    // 发送通知
    collaborativeService.emit('ledgerUpdate', { type: 'budget_created', id: result.id });
    return result;
  } catch (error: any) {
    return rejectWithValue(error.response?.data?.message || '创建预算失败');
  }
});

export const updateBudget = createAsyncThunk('budget/update', async ({ id, data }: { id: string; data: UpdateBudgetDto }, { rejectWithValue }) => {
  try {
    const result = await budgetService.updateBudget(id, data);
    // 发送通知
    collaborativeService.emit('ledgerUpdate', { type: 'budget_updated', id: result.id });
    return result;
  } catch (error: any) {
    return rejectWithValue(error.response?.data?.message || '更新预算失败');
  }
});

export const deleteBudget = createAsyncThunk('budget/delete', async (id: string, { rejectWithValue }) => {
  try {
    await budgetService.deleteBudget(id);
    // 发送通知
    collaborativeService.emit('ledgerUpdate', { type: 'budget_deleted', id });
    return id;
  } catch (error: any) {
    return rejectWithValue(error.response?.data?.message || '删除预算失败');
  }
});

const budgetSlice = createSlice({
  name: 'budget',
  initialState,
  reducers: {
    clearError: (state) => {
      state.error = null;
    },
    setCurrentBudget: (state, action: PayloadAction<Budget | null>) => {
      state.currentBudget = action.payload;
    },
  },
  extraReducers: (builder) => {
    builder
      // Fetch All
      .addCase(fetchBudgets.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(fetchBudgets.fulfilled, (state, action) => {
        state.loading = false;
        state.budgets = action.payload;
      })
      .addCase(fetchBudgets.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload as string;
      })
      // Create
      .addCase(createBudget.fulfilled, (state, action) => {
        state.budgets.unshift(action.payload);
      })
      // Update
      .addCase(updateBudget.fulfilled, (state, action) => {
        const index = state.budgets.findIndex((b) => b.id === action.payload.id);
        if (index !== -1) {
          state.budgets[index] = action.payload;
        }
        if (state.currentBudget?.id === action.payload.id) {
          state.currentBudget = action.payload;
        }
      })
      // Delete
      .addCase(deleteBudget.fulfilled, (state, action) => {
        state.budgets = state.budgets.filter((b) => b.id !== action.payload);
        if (state.currentBudget?.id === action.payload) {
          state.currentBudget = null;
        }
      });
  },
});

export const { clearError, setCurrentBudget } = budgetSlice.actions;
export default budgetSlice.reducer;
