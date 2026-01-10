import api from './api';

export interface Debt {
  id: string;
  name: string;
  type: 'lent' | 'borrowed';
  amount: number;
  originalAmount?: number;
  remainingAmount: number;
  paidPercentage?: number;
  interestRate?: number;
  creditorDebtor: string;
  debtorName?: string;
  dueDate?: string;
  status: 'active' | 'cleared' | 'overdue' | 'paid';
  description?: string;
  startDate: string;
}

const debtService = {
  /**
   * 获取所有债务
   */
  getDebts: async (params?: any) => {
    const response = await api.get<any>('/debts', { params });
    return response.data;
  },

  /**
   * 获取单个债务
   */
  getDebt: async (id: string) => {
    const response = await api.get<any>(`/debts/${id}`);
    return response.data;
  },

  /**
   * 创建债务
   */
  createDebt: async (data: Partial<Debt>) => {
    const response = await api.post<any>('/debts', data);
    return response.data;
  },

  /**
   * 更新债务
   */
  updateDebt: async (id: string, data: Partial<Debt>) => {
    const response = await api.put<any>(`/debts/${id}`, data);
    return response.data;
  },

  /**
   * 删除债务
   */
  deleteDebt: async (id: string) => {
    const response = await api.delete<any>(`/debts/${id}`);
    return response.data;
  },

  /**
   * 债务还款/收款
   */
  repayDebt: async (id: string, amount: number, transactionDate: string) => {
    const response = await api.post<any>(`/debts/${id}/repay`, { amount, transactionDate });
    return response.data;
  },

  /**
   * 获取债务统计
   */
  getDebtStatistics: async () => {
    const response = await api.get<any>('/debts/statistics');
    return response.data;
  },
};

export default debtService;
