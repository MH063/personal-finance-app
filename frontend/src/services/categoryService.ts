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
  version?: number;
}

export const categoryService = {
  /**
   * 获取所有分类
   */
  getCategories: async (params?: 'income' | 'expense' | { type?: 'income' | 'expense' }) => {
    const type = typeof params === 'object' ? params.type : params;
    
    // 1. 先从本地数据库获取
    let localCategories = await db.categories.toArray();
    if (type) {
      localCategories = localCategories.filter(c => c.type === type);
    }

    // 内部帮助函数：从响应中提取数组数据
    const extractData = (result: any) => {
      // 1. 基础检查
      if (!result) return [];
      
      // 2. 检查是否是双层嵌套结构: { success: true, data: { categories: [] } }
      // 或者 api.ts 解构后的: { categories: [] }
      if (typeof result === 'object' && !Array.isArray(result)) {
        // 检查 result.data.categories 或 result.categories
        const innerData = result.data || result;
        if (innerData && typeof innerData === 'object') {
          // 查找第一个数组属性
          for (const key in innerData) {
            if (Array.isArray(innerData[key])) {
              return innerData[key];
            }
          }
        }
        // 如果 result 本身有 success 和 data 字段，但 data 还没被处理
        if ('success' in result && 'data' in result) {
          if (Array.isArray(result.data)) return result.data;
          // 继续深度查找
          return extractData(result.data);
        }
      }
      
      // 3. 如果已经是数组，直接返回
      if (Array.isArray(result)) return result;
      
      return [];
    };

    // 2. 如果本地没有数据且在线，则必须等待网络请求
    if (localCategories.length === 0 && offlineSyncService.isOnline()) {
      try {
        console.log(`[CategoryService] 本地无${type || ''}分类数据，正在从服务器获取...`);
        const response = await api.get<any>('/categories', { params: { type } });
        let data = extractData(response.data);
        
        // 如果服务器也没有数据，尝试初始化默认分类
        if ((!data || data.length === 0)) {
          console.log(`[CategoryService] 服务器无分类数据，正在初始化默认分类...`);
          try {
            // 如果指定了类型，只初始化该类型；否则两个都初始化
            if (type) {
              await api.post('/categories/defaults', { type });
            } else {
              await api.post('/categories/defaults', { type: 'income' });
              await api.post('/categories/defaults', { type: 'expense' });
            }
            // 初始化后重新获取
            const retryResponse = await api.get<any>('/categories', { params: { type } });
            data = extractData(retryResponse.data);
          } catch (initErr) {
            console.error('[CategoryService] 初始化默认分类失败:', initErr);
          }
        }

        if (data && data.length > 0) {
          console.log(`[CategoryService] 成功获取 ${data.length} 个分类数据`);
          await db.categories.bulkPut(data);
          return type ? data.filter((c: Category) => c.type === type) : data;
        }
      } catch (err) {
        console.error('[CategoryService] 获取分类失败:', err);
      }
    }

    // 3. 如果在线但本地已有数据，则静默刷新
    if (offlineSyncService.isOnline()) {
      api.get<any>('/categories', { params: { type } }).then(response => {
        const data = extractData(response.data);
        if (data && data.length > 0) {
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
      await offlineSyncService.syncPendingChanges().catch(() => {});
    }

    return newCategory;
  },

  /**
   * 更新分类
   */
  updateCategory: async (id: string, data: Partial<Category>) => {
    // 获取当前记录
    const current = await db.categories.get(id);

    // 1. 更新本地
    await db.categories.update(id, data);

    // 2. 加入同步队列
    await db.syncQueue.add({
      action: 'UPDATE',
      entity: 'CATEGORY',
      entityId: id,
      data: { ...data, version: current?.version }, // 包含版本号以支持乐观锁
      timestamp: Date.now(),
    });

    // 3. 触发同步
    if (offlineSyncService.isOnline()) {
      await offlineSyncService.syncPendingChanges().catch(() => {});
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
      await offlineSyncService.syncPendingChanges().catch(() => {});
    }

    return { id };
  },

  /**
   * 初始化默认分类
   */
  initDefaultCategories: async () => {
    const response = await api.post<any>('/categories/defaults');
    const result = response.data;
    // 根据 Rule 5: 优先获取嵌套的 data 字段
    return (result && typeof result === 'object' && 'success' in result && 'data' in result) 
      ? result.data 
      : result;
  },
};

export default categoryService;
