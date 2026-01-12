import api from './api';
import { Budget, CreateBudgetDto, UpdateBudgetDto } from '../types';
import { db } from '../db/db';
import { offlineSyncService } from './offlineSyncService';
import { v4 as uuidv4 } from 'uuid';

/**
 * 预算管理服务
 */
const budgetService = {
  /**
   * 获取所有预算
   */
  async getAllBudgets() {
    // 1. 先从本地获取
    const localBudgets = await db.budgets.toArray();

    // 2. 如果在线，静默刷新
    if (offlineSyncService.isOnline()) {
      api.get('/budgets').then(response => {
        const result = response.data;
        const data = (result && typeof result === 'object' && 'success' in result && 'data' in result) 
          ? result.data 
          : result;
        
        if (data) {
          const budgets = Array.isArray(data) ? data : (data.budgets || []);
          db.budgets.bulkPut(budgets);
        }
      }).catch(err => console.warn('后台刷新预算失败', err));
    }

    return localBudgets;
  },

  /**
   * 获取预算详情
   */
  async getBudgetById(id: string) {
    const localBudget = await db.budgets.get(id);

    if (offlineSyncService.isOnline()) {
      api.get(`/budgets/${id}`).then(response => {
        const result = response.data;
        const data = (result && typeof result === 'object' && 'success' in result && 'data' in result) 
          ? result.data 
          : result;
        
        if (data) {
          db.budgets.put(data);
        }
      }).catch(err => console.warn(`后台刷新预算详情失败: ${id}`, err));
    }

    return localBudget;
  },

  /**
   * 创建预算
   */
  async createBudget(data: CreateBudgetDto) {
    const id = uuidv4();
    
    // 获取分类信息，用于立即更新 UI
    let category = undefined;
    if (data.categoryId) {
      category = await db.categories.get(data.categoryId);
    }

    const newBudget = {
      ...data,
      id,
      category, // 回填分类信息
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      usedAmount: 0,
      remainingAmount: data.amount,
      usagePercentage: 0,
      status: 'active'
    } as any;

    // 1. 保存到本地
    await db.budgets.add(newBudget);

    // 2. 加入同步队列
    await db.syncQueue.add({
      action: 'CREATE',
      entity: 'BUDGET',
      entityId: id,
      data: newBudget,
      timestamp: Date.now(),
    });

    // 3. 触发同步
    if (offlineSyncService.isOnline()) {
      offlineSyncService.syncPendingChanges().catch(() => {});
    }

    return newBudget;
  },

  /**
   * 更新预算
   */
  async updateBudget(id: string, data: UpdateBudgetDto) {
    // 获取完整的当前预算记录
    const current = await db.budgets.get(id);
    
    // 获取分类信息
    let category = current?.category;
    if (data.categoryId) {
      category = await db.categories.get(data.categoryId);
    }

    const updatedData = {
      ...current,
      ...data,
      category, // 更新分类信息
      updatedAt: new Date().toISOString(),
    } as any;

    // 1. 更新本地
    await db.budgets.put(updatedData);

    // 2. 加入同步队列
    await db.syncQueue.add({
      action: 'UPDATE',
      entity: 'BUDGET',
      entityId: id,
      data,
      timestamp: Date.now(),
    });

    // 3. 触发同步
    if (offlineSyncService.isOnline()) {
      offlineSyncService.syncPendingChanges().catch(() => {});
    }

    return updatedData;
  },

  /**
   * 删除预算
   */
  async deleteBudget(id: string) {
    // 1. 从本地删除
    await db.budgets.delete(id);

    // 2. 加入同步队列
    await db.syncQueue.add({
      action: 'DELETE',
      entity: 'BUDGET',
      entityId: id,
      data: null,
      timestamp: Date.now(),
    });

    // 3. 触发同步
    if (offlineSyncService.isOnline()) {
      offlineSyncService.syncPendingChanges().catch(() => {});
    }

    return { id };
  },
};

export default budgetService;
