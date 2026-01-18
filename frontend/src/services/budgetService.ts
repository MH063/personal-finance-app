import api from './api';
import { CreateBudgetDto, UpdateBudgetDto } from '../types';
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

    // 2. 如果在线且本地没有数据，或者在线且需要更新已用金额，则等待网络请求
    if (offlineSyncService.isOnline()) {
      try {
        console.log('[BudgetService] 正在从服务器获取最新预算数据...');
        const response = await api.get('/budgets');
        // 由于 api 拦截器已处理第一层 data 解构，此处 response.data 就是后端返回的 data 对象
        const result = response.data;
        let data: any[] = [];
        
        if (Array.isArray(result)) {
          data = result;
        } else if (result && typeof result === 'object') {
          // 兼容分页结构 { data: [], total: 10 } 或直接包含数组的对象
          data = Array.isArray(result.data) ? result.data : Object.values(result).find(val => Array.isArray(val)) as any[] || [];
        }
        
        if (data && data.length > 0) {
          // 清除本地旧数据并更新
          await db.budgets.clear();
          await db.budgets.bulkPut(data);
          return data;
        }
      } catch (err) {
        console.warn('[BudgetService] 从服务器获取预算失败，使用本地数据', err);
      }
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
        // 由于 api 拦截器已处理第一层 data 解构，此处 response.data 就是后端返回的 data 对象
        const data = response.data;
        
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
      await offlineSyncService.syncPendingChanges().catch(() => {});
    }

    return newBudget;
  },

  /**
   * 更新预算
   */
  async updateBudget(id: string, data: UpdateBudgetDto) {
    // 获取完整的当前预算记录
    const current = await db.budgets.get(id);
    
    // 获取分类信息（更新不支持变更分类，保持当前分类）
    const category = current?.category;

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
      data: { ...data, version: current?.version }, // 包含版本号以支持乐观锁
      timestamp: Date.now(),
    });

    // 3. 触发同步
    if (offlineSyncService.isOnline()) {
      await offlineSyncService.syncPendingChanges().catch(() => {});
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
      await offlineSyncService.syncPendingChanges().catch(() => {});
    }

    return { id };
  },
};

export default budgetService;
