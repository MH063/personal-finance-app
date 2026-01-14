import api from './api';
import { db } from '../db/db';
import { offlineSyncService } from './offlineSyncService';
import { v4 as uuidv4 } from 'uuid';

export interface Category {
  id: string;
  name: string;
  color: string;
}

export interface Ledger {
  id: string;
  name: string;
  color?: string;
}

export interface Transaction {
  id: string;
  amount: number;
  type: 'income' | 'expense';
  description: string;
  paymentMethod: string;
  merchant: string;
  transactionDate: string;
  categoryId: string;
  ledgerId?: string;
  category?: Category;
  ledger?: Ledger;
  createdAt: string;
  updatedAt: string;
  version?: number;
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
  ledgerId?: string;
  minAmount?: number;
  maxAmount?: number;
}

export const transactionService = {
  getTransactions: async (query: TransactionQuery = {}) => {
    // 始终尝试先从本地数据库读取
    let localData = await db.transactions.toArray();
    
    // 应用筛选逻辑 (如果离线或为了快速响应)
    if (query.type) localData = localData.filter(t => t.type === query.type);
    if (query.categoryId) localData = localData.filter(t => t.categoryId === query.categoryId);
    if (query.ledgerId) localData = localData.filter(t => t.ledgerId === query.ledgerId);
    if (query.startDate) localData = localData.filter(t => t.transactionDate >= query.startDate);
    if (query.endDate) localData = localData.filter(t => t.transactionDate <= query.endDate);
    
    // 排序：按日期降序
    localData.sort((a, b) => b.transactionDate.localeCompare(a.transactionDate));

    // 分页
    const page = query.page || 1;
    const limit = query.limit || 10;
    const offset = (page - 1) * limit;
    const paginatedData = localData.slice(offset, offset + limit);

    // 如果在线，静默刷新本地缓存
    if (offlineSyncService.isOnline()) {
      const params = new URLSearchParams();
      Object.entries(query).forEach(([key, value]) => {
        if (value !== undefined && value !== null && value !== '') {
          params.append(key, String(value));
        }
      });
      
      api.get<any>(`/transactions?${params}`).then(response => {
        const result = response.data;
        const data = (result && typeof result === 'object' && 'success' in result && 'data' in result) 
          ? result.data 
          : result;
        
        if (data) {
          // 处理双层嵌套 { data: [], total: 0 } 或直接是数组 []
          const txData = Array.isArray(data) ? data : (data.data || []);
          if (Array.isArray(txData)) {
            db.transactions.bulkPut(txData);
          }
        }
      }).catch(err => console.warn('后台刷新交易数据失败', err));
    }

    return {
      data: paginatedData,
      total: localData.length,
      page,
      limit
    };
  },

  createTransaction: async (data: Partial<Transaction>) => {
    const id = uuidv4();
    
    // 获取分类信息，用于立即更新 UI
    let category = undefined;
    if (data.categoryId) {
      category = await db.categories.get(data.categoryId);
    }

    const newTransaction = {
      ...data,
      id,
      category, // 回填分类信息
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    } as Transaction;

    // 1. 保存到本地数据库
    await db.transactions.add(newTransaction);

    // 2. 添加到同步队列
    await db.syncQueue.add({
      action: 'CREATE',
      entity: 'TRANSACTION',
      entityId: id,
      data: newTransaction,
      timestamp: Date.now(),
    });

    // 3. 如果在线，触发同步
    if (offlineSyncService.isOnline()) {
        await offlineSyncService.syncPendingChanges().catch(() => {});
      }

    return newTransaction;
  },

  updateTransaction: async (id: string, data: Partial<Transaction>) => {
    // 获取完整的当前交易记录，以确保返回的对象完整
    const current = await db.transactions.get(id);
    
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
    } as Transaction;

    // 1. 更新本地数据库
    await db.transactions.put(updatedData);

    // 2. 添加到同步队列
    await db.syncQueue.add({
      action: 'UPDATE',
      entity: 'TRANSACTION',
      entityId: id,
      data: { ...data, version: current?.version }, // 包含版本号以支持乐观锁
      timestamp: Date.now(),
    });

    // 3. 如果在线，触发同步
    if (offlineSyncService.isOnline()) {
      await offlineSyncService.syncPendingChanges().catch(() => {});
    }

    return updatedData;
  },

  deleteTransaction: async (id: string) => {
    // 1. 从本地数据库删除
    await db.transactions.delete(id);

    // 2. 添加到同步队列（先检查是否已存在删除任务，避免重复）
    const existingDelete = await db.syncQueue
      .where('[entity+entityId+action]')
      .equals(['TRANSACTION', id, 'DELETE'])
      .first();

    if (!existingDelete) {
      await db.syncQueue.add({
        action: 'DELETE',
        entity: 'TRANSACTION',
        entityId: id,
        data: null,
        timestamp: Date.now(),
      });
    }

    // 3. 如果在线，触发同步
    if (offlineSyncService.isOnline()) {
      await offlineSyncService.syncPendingChanges().catch(() => {});
    }

    return { id };
  },

  batchDeleteTransactions: async (ids: string[]) => {
    // 1. 从本地数据库删除
    await db.transactions.bulkDelete(ids);

    // 2. 添加到同步队列
    await Promise.all(ids.map(id => 
      db.syncQueue.add({
        action: 'DELETE',
        entity: 'TRANSACTION',
        entityId: id,
        data: null,
        timestamp: Date.now(),
      })
    ));

    // 3. 如果在线，直接调用后端批量删除接口（优化性能）
    if (offlineSyncService.isOnline()) {
      try {
        await api.post('/transactions/batch-delete', { ids });
        // 如果后端批量删除成功，从同步队列中移除这些 ID 的删除任务，避免重复请求
        await db.syncQueue.where('entityId').anyOf(ids).delete();
      } catch (err) {
        console.warn('后端批量删除同步失败，将依赖队列重试');
        await offlineSyncService.syncPendingChanges().catch(() => {});
      }
    }

    return { ids };
  }
};
