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

const normalizeName = (name: string) =>
  (name || '').trim().replace(/\s+/g, ' ').toLowerCase();

const dedupeByNameAndType = (list: Category[], type?: 'income' | 'expense') => {
  const result: Category[] = [];
  const seen = new Set<string>();
  for (const c of list) {
    if (type && c.type !== type) continue;
    const key = `${c.type}_${normalizeName(c.name)}`;
    if (!seen.has(key)) {
      seen.add(key);
      result.push(c);
    }
  }
  return result;
};

export const categoryService = {
  /**
   * 获取所有分类
   */
  getCategories: async (params?: 'income' | 'expense' | { type?: 'income' | 'expense' }) => {
    const type = typeof params === 'object' ? params.type : params;

    const localCategories = await db.categories.toArray();

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

    // 未认证直接返回本地缓存，避免触发 401
    const token = localStorage.getItem('accessToken');
    if (!token) {
      return dedupeByNameAndType(localCategories, type);
    }

    if (offlineSyncService.isOnline()) {
      try {
        const response = await api.get<any>('/categories', { params: { type } });
        let data = extractData(response.data);

        if ((!data || data.length === 0)) {
          try {
            if (type) {
              await api.post('/categories/defaults', { type });
            } else {
              await api.post('/categories/defaults', { type: 'income' });
              await api.post('/categories/defaults', { type: 'expense' });
            }
            const retryResponse = await api.get<any>('/categories', { params: { type } });
            data = extractData(retryResponse.data);
          } catch (initErr) {
            console.error('[CategoryService] 初始化默认分类失败:', initErr);
          }
        }

        if (Array.isArray(data)) {
          await db.categories.clear();
          await db.categories.bulkPut(data);
          return type ? data.filter((c: Category) => c.type === type) : data;
        }
      } catch (err) {
        console.error('[CategoryService] 在线获取分类失败，回退到本地数据:', err);
      }
    }

    return dedupeByNameAndType(localCategories, type);
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
    const name = (data.name || '').trim();
    const type = data.type as 'income' | 'expense';

    const localAll = await db.categories.toArray();
    const existsLocal = localAll.some(
      (c) => c.type === type && normalizeName(c.name) === normalizeName(name),
    );
    if (existsLocal) {
      throw new Error('该分类已存在，请使用现有分类或输入不同的名称');
    }

    if (offlineSyncService.isOnline()) {
      try {
        const response = await api.post<any>('/categories', { ...data });
        const result = response?.data;
        const created =
          result && typeof result === 'object' && 'success' in result && 'data' in result
            ? result.data
            : result;
        if (created && created.id) {
          await db.categories.put(created);
          return created as Category;
        }
      } catch (err: any) {
        throw new Error(err?.response?.data?.message || '创建分类失败');
      }
    }

    const id = uuidv4();
    const newCategory = {
      ...data,
      id,
      isSystem: false,
    } as Category;

    await db.categories.add(newCategory);
    await db.syncQueue.add({
      action: 'CREATE',
      entity: 'CATEGORY',
      entityId: id,
      data: newCategory,
      timestamp: Date.now(),
    });

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
  deleteCategory: async (id: string, options?: { force?: boolean; migrateTo?: string }) => {
    // 如果在线，优先调用 API 以便获取关联数据检查结果
    if (offlineSyncService.isOnline()) {
      await api.delete(`/categories/${id}`, { params: options });
      await db.categories.delete(id);
      return { id };
    }

    // 离线模式下执行乐观删除
    // 注意：离线模式下无法进行关联数据检查，可能会导致同步时失败
    await db.categories.delete(id);

    // 2. 加入同步队列
    await db.syncQueue.add({
      action: 'DELETE',
      entity: 'CATEGORY',
      entityId: id,
      data: options, // 保存选项以便同步时使用
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

  batchDeleteCategories: async (ids: string[]) => {
    // 1. 本地删除
    await db.categories.bulkDelete(ids);

    // 2. 添加到同步队列
    await Promise.all(ids.map(id =>
      db.syncQueue.add({
        action: 'DELETE',
        entity: 'CATEGORY',
        entityId: id,
        data: null,
        timestamp: Date.now(),
      })
    ));

    // 3. 在线则直接请求
    if (offlineSyncService.isOnline()) {
      try {
        await api.post('/categories/batch-delete', { ids });
        // 同步成功后清理队列
        await db.syncQueue.where('entityId').anyOf(ids).delete();
      } catch (err) {
        console.warn('在线批量删除分类失败，将转入后台同步');
        offlineSyncService.syncPendingChanges().catch(() => {});
      }
    }
  },

  /**
   * 清理重复分类
   */
  cleanupDuplicates: async () => {
    if (!offlineSyncService.isOnline()) {
      throw new Error('请在联网状态下执行清理操作');
    }
    /**
     * 执行后端清理，并同步本地 Dexie 数据
     * 返回值结构：{ deletedCount: number, details: Array<{ removed: string[], kept: { id, name }, type }> }
     */
    const response = await api.post('/categories/cleanup');
    const result = response.data;

    try {
      // 1) 如果后端返回了删除的ID，先在本地删除这些ID，确保UI立即同步
      const removedIds =
        Array.isArray(result?.details)
          ? result.details.flatMap((d: any) => Array.isArray(d?.removed) ? d.removed : [])
          : [];
      if (removedIds.length > 0) {
        await db.categories.bulkDelete(removedIds);
      }

      // 2) 强制从服务器拉取最新的分类列表，并用其覆盖本地数据，避免旧数据残留
      const refreshRes = await api.get<any>('/categories');
      const fresh = refreshRes?.data;
      const freshArray = Array.isArray(fresh)
        ? fresh
        : (typeof fresh === 'object' && fresh)
          ? (() => {
              for (const k in fresh) {
                if (Array.isArray((fresh as any)[k])) return (fresh as any)[k];
              }
              return [];
            })()
          : [];
      if (freshArray.length >= 0) {
        await db.categories.clear();
        await db.categories.bulkPut(freshArray);
      }
    } catch (e) {
      console.warn('[CategoryService] 本地同步清理结果失败:', e);
    }

    return result;
  },

  /**
   * 获取重复分类分组（服务端检测结果）
   * 返回数组元素包含：{ key, name, type, count, categories: Category[] }
   */
  getDuplicates: async (): Promise<any[]> => {
    const res = await api.get<any>('/categories/duplicates');
    const data = res?.data;
    const arr = Array.isArray(data) ? data : [];
    return arr;
  },

  /**
   * 合并重复分类（服务端执行），并同步本地数据
   */
  mergeDuplicates: async (preferSystem: boolean = true) => {
    if (!offlineSyncService.isOnline()) {
      throw new Error('请在联网状态下执行合并操作');
    }
    const response = await api.post('/categories/merge', { preferSystem });
    const result = response.data;

    try {
      // 删除本地被移除的分类并覆盖为服务器最新列表
      const removedIds =
        Array.isArray(result?.details)
          ? result.details.flatMap((d: any) => Array.isArray(d?.removed) ? d.removed : [])
          : [];
      if (removedIds.length > 0) {
        await db.categories.bulkDelete(removedIds);
      }
      const refreshRes = await api.get<any>('/categories');
      const fresh = refreshRes?.data;
      const freshArray = Array.isArray(fresh)
        ? fresh
        : (typeof fresh === 'object' && fresh)
          ? (() => {
              for (const k in fresh) {
                if (Array.isArray((fresh as any)[k])) return (fresh as any)[k];
              }
              return [];
            })()
          : [];
      await db.categories.clear();
      if (freshArray.length > 0) {
        await db.categories.bulkPut(freshArray);
      }
    } catch (e) {
      console.warn('[CategoryService] 本地同步合并结果失败:', e);
    }

    return result;
  }
};

export default categoryService;
