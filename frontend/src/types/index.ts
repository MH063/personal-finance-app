export * from '../store/slices/authSlice';
export { clearError as clearTransactionError } from '../store/slices/transactionSlice';
export { clearError as clearCategoryError } from '../store/slices/categorySlice';
export { clearError as clearDebtError } from '../store/slices/debtSlice';
export * from '../store/slices/statisticsSlice';
export * from '../store/slices/settingsSlice';
export * from '../store/slices/appSlice';

export type { User, LoginCredentials, RegisterData, AuthResponse } from '../services/authService';
export type { Transaction, TransactionQuery, PaginatedTransactions } from '../services/transactionService';
export type { Category } from '../services/categoryService';

export enum BudgetStatus {
  ACTIVE = 'active',
  INACTIVE = 'inactive',
}

export enum BudgetPeriod {
  MONTH = 'month',
  QUARTER = 'quarter',
  YEAR = 'year',
}

export interface Budget {
  id: string;
  categoryId: string;
  category?: any;
  amount: number;
  startDate: string;
  endDate: string;
  status: BudgetStatus;
  usedAmount: number;
  remainingAmount: number;
  usagePercentage: number;
  createdAt: string;
  updatedAt: string;
  version?: number;
}

export interface CreateBudgetDto {
  categoryId: string;
  amount: number;
  startDate: string;
  endDate: string;
  period: BudgetPeriod;
}

export interface UpdateBudgetDto {
  amount?: number;
  startDate?: string;
  endDate?: string;
  status?: BudgetStatus;
  version?: number;
}
