import api from './api';
import { db } from '../db/db';
import { offlineSyncService } from './offlineSyncService';
import { v4 as uuidv4 } from 'uuid';

export interface Category {
  id: string;
  name: string;
  type: 'income' | 'expense';
  icon?: string;
  color?: string;
  parentId?: string;
  isSystem?: boolean;
}

export const categoryService = {
  /**
   * 获取所有分类
   */
  getCategories: async (type?: 'income' | 'expense') => {
    // 1. 先从本地数据库获取
    let localCategories = await db.categories.toArray();
    if (type) {
      localCategories = localCategories.filter(c => c.type === type);
    }

    // 2. 如果在线，静默刷新
    if (offlineSyncService.isOnline()) {
      api.get<any>('/categories', { params: { type } }).then(response => {
        const result = response.data;
        const data = (result && typeof result === 'object' && 'success' in result && 'data' in result) 
          ? result.data 
          : result;
        
        if (data && Array.isArray(data)) {
          db.categories.bulkPut(data);
        }
      }).catch(err => console.warn('后台刷新分类失败', err));
    }

    return localCategories;
  },

  /**
   * 获取单个分类
   */
  getCategory: async (id: string) => {
    const localCategory = await db.categories.get(id);

    if (offlineSyncService.isOnline()) {
      api.get<any>(`/categories/${id}`).then(response => {
        const result = response.data;
        const data = (result && typeof result === 'object' && 'success' in result && 'data' in result) 
          ? result.data 
          : result;
        
        if (data) {
          db.categories.put(data);
        }
      }).catch(err => console.warn(`后台刷新分类详情失败: ${id}`, err));
    }

    return localCategory;
  },

  /**
   * 创建分类
   */
  createCategory: async (data: Partial<Category>) => {
    const id = uuidv4();
    const newCategory = {
      ...data,
      id,
      isSystem: false,
    } as Category;

    // 1. 保存到本地
    await db.categories.add(newCategory);

    // 2. 加入同步队列
    await db.syncQueue.add({
      action: 'CREATE',
      entity: 'CATEGORY',
      entityId: id,
      data: newCategory,
      timestamp: Date.now(),
    });

    // 3. 触发同步
    if (offlineSyncService.isOnline()) {
      offlineSyncService.syncPendingChanges().catch(() => {});
    }

    return newCategory;
  },

  /**
   * 更新分类
   */
  updateCategory: async (id: string, data: Partial<Category>) => {
    // 1. 更新本地
    await db.categories.update(id, data);

    // 2. 加入同步队列
    await db.syncQueue.add({
      action: 'UPDATE',
      entity: 'CATEGORY',
      entityId: id,
      data,
      timestamp: Date.now(),
    });

    // 3. 触发同步
    if (offlineSyncService.isOnline()) {
      offlineSyncService.syncPendingChanges().catch(() => {});
    }

    return { id, ...data };
  },

  /**
   * 删除分类
   */
  deleteCategory: async (id: string) => {
    // 1. 从本地删除
    await db.categories.delete(id);

    // 2. 加入同步队列
    await db.syncQueue.add({
      action: 'DELETE',
      entity: 'CATEGORY',
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

  /**
   * 初始化默认分类
   */
  initDefaultCategories: async () => {
    const response = await api.post<any>('/categories/defaults');
    return response.data;
  },
};

export default categoryService;
