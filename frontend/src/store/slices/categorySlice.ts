import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import categoryService, { Category } from '../../services/categoryService';
import { collaborativeService } from '../../services/collaborativeService';

interface CategoryState {
  categories: Category[];
  categoryTree: Category[];
  loading: boolean;
  error: string | null;
}

export const fetchCategories = createAsyncThunk<Category[], 'income' | 'expense' | { type?: 'income' | 'expense' } | undefined>(
  'categories/fetchAll',
  async (params: 'income' | 'expense' | { type?: 'income' | 'expense' } | undefined = undefined, { rejectWithValue }) => {
    try {
      const data = await categoryService.getCategories(params as any);
      return data;
    } catch (error: any) {
      return rejectWithValue(error.response?.data?.message || '获取分类失败');
    }
  }
);

export const createCategory = createAsyncThunk<Category, Partial<Category>>(
  'categories/create',
  async (data, { rejectWithValue }) => {
    try {
      const dataResult = await categoryService.createCategory(data);
      // 发送通知
      collaborativeService.emit('ledgerUpdate', { type: 'category_created', id: dataResult.id });
      return dataResult;
    } catch (error: any) {
      return rejectWithValue(error.response?.data?.message || '创建分类失败');
    }
  }
);

export const updateCategory = createAsyncThunk<Category, { id: string; data: Partial<Category> }>(
  'categories/update',
  async ({ id, data }, { rejectWithValue }) => {
    try {
      const dataResult = await categoryService.updateCategory(id, data);
      // 发送通知
      collaborativeService.emit('ledgerUpdate', { type: 'category_updated', id: dataResult.id });
      return dataResult;
    } catch (error: any) {
      return rejectWithValue(error.response?.data?.message || '更新分类失败');
    }
  }
);

export const deleteCategory = createAsyncThunk<string, string | { id: string; options?: { force?: boolean; migrateTo?: string } }>(
  'categories/delete',
  async (arg, { rejectWithValue }) => {
    const id = typeof arg === 'string' ? arg : arg.id;
    const options = typeof arg === 'string' ? undefined : arg.options;
    try {
      await categoryService.deleteCategory(id, options);
      // 发送通知
      collaborativeService.emit('ledgerUpdate', { type: 'category_deleted', id });
      return id;
    } catch (error: any) {
      return rejectWithValue(error.response?.data?.message || '删除分类失败');
    }
  }
);

const initialState: CategoryState = {
  categories: [],
  categoryTree: [],
  loading: false,
  error: null,
};

const categorySlice = createSlice({
  name: 'categories',
  initialState,
  reducers: {
    clearError: (state) => {
      state.error = null;
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchCategories.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(fetchCategories.fulfilled, (state, action) => {
        state.loading = false;
        const existingMap = new Map(state.categories.map((c) => [c.id, c]));
        action.payload.forEach((c) => {
          existingMap.set(c.id, c);
        });
        state.categories = Array.from(existingMap.values());
      })
      .addCase(fetchCategories.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload as string;
      })
      .addCase(createCategory.fulfilled, (state, action) => {
        state.categories.push(action.payload);
      })
      .addCase(updateCategory.fulfilled, (state, action) => {
        const index = state.categories.findIndex((c) => c.id === action.payload.id);
        if (index !== -1) {
          state.categories[index] = action.payload;
        }
      })
      .addCase(deleteCategory.fulfilled, (state, action) => {
        state.categories = state.categories.filter((c) => c.id !== action.payload);
      });
  },
});

export const { clearError } = categorySlice.actions;
export default categorySlice.reducer;
export type { Category };
