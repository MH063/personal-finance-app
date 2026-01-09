import api from './api';

export interface Transaction {
  id: string;
  amount: number;
  type: 'income' | 'expense';
  description: string;
  paymentMethod: string;
  merchant: string;
  transactionDate: string;
  categoryId: string;
  category?: {
    id: string;
    name: string;
    color: string;
  };
  createdAt: string;
  updatedAt: string;
}

export interface PaginatedTransactions {
  data: Transaction[];
  total: number;
  page: number;
  limit: number;
}

export interface TransactionQuery {
  page?: number;
  limit?: number;
  startDate?: string;
  endDate?: string;
  type?: string;
  categoryId?: string;
  minAmount?: number;
  maxAmount?: number;
  keyword?: string;
}

export const transactionService = {
  getTransactions: async (query: TransactionQuery = {}) => {
    const params = new URLSearchParams();
    Object.entries(query).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== '') {
        params.append(key, String(value));
      }
    });
    const response = await api.get<any>(`/transactions?${params}`);
    return response.data;
  },

  createTransaction: async (data: Partial<Transaction>) => {
    const response = await api.post<any>('/transactions', data);
    return response.data;
  },

  updateTransaction: async (id: string, data: Partial<Transaction>) => {
    const response = await api.patch<any>(`/transactions/${id}`, data);
    return response.data;
  },

  deleteTransaction: async (id: string) => {
    const response = await api.delete<any>(`/transactions/${id}`);
    return response.data;
  }
};
