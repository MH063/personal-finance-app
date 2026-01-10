import api from './api';
import { Budget, CreateBudgetDto, UpdateBudgetDto } from '../types';

/**
 * 预算管理服务
 */
const budgetService = {
  /**
   * 获取所有预算
   */
  async getAllBudgets() {
    const response = await api.get('/budgets');
    return response.data;
  },

  /**
   * 获取预算详情
   */
  async getBudgetById(id: string) {
    const response = await api.get(`/budgets/${id}`);
    return response.data;
  },

  /**
   * 创建预算
   */
  async createBudget(data: CreateBudgetDto) {
    const response = await api.post('/budgets', data);
    return response.data;
  },

  /**
   * 更新预算
   */
  async updateBudget(id: string, data: UpdateBudgetDto) {
    const response = await api.patch(`/budgets/${id}`, data);
    return response.data;
  },

  /**
   * 删除预算
   */
  async deleteBudget(id: string) {
    const response = await api.delete(`/budgets/${id}`);
    return response.data;
  },
};

export default budgetService;
