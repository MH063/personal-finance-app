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
    // 分页
    const page = query.page || 1;
    const limit = query.limit || 10;
    const offset = (page - 1) * limit;

    const applyLocalFilters = (items: Transaction[]) => {
      let data = items;
      if (query.type) data = data.filter(t => t.type === query.type);
      if (query.categoryId) data = data.filter(t => t.categoryId === query.categoryId);
      if (query.ledgerId) data = data.filter(t => t.ledgerId === query.ledgerId);
      if (query.startDate) data = data.filter(t => t.transactionDate >= query.startDate);
      if (query.endDate) data = data.filter(t => t.transactionDate <= query.endDate);
      data.sort((a, b) => b.transactionDate.localeCompare(a.transactionDate));
      return data;
    };

    const extractTxArray = (payload: any) => {
      if (!payload) return [];
      if (Array.isArray(payload)) return payload;
      if (payload && typeof payload === 'object' && Array.isArray((payload as any).data)) return (payload as any).data;
      return [];
    };

    const localData = applyLocalFilters(await db.transactions.toArray());

    // 如果在线，静默刷新本地缓存
    if (offlineSyncService.isOnline()) {
      const fetchRemoteAndUpsert = async () => {
        const response = await api.get<any>('/transactions', { params: query });
        const payload = response.data;
        const txData = extractTxArray(payload);
        if (txData.length > 0) {
          await db.transactions.bulkPut(txData);
        }
        return { payload, txData };
      };

      const shouldBlockForFreshData = page === 1;
      if (shouldBlockForFreshData) {
        try {
          console.log('[TransactionService] 在线首屏获取交易数据，使用服务端结果刷新列表');
          const { payload, txData } = await fetchRemoteAndUpsert();
          const paginatedFromRemote = txData.slice(offset, offset + limit);
          const totalFromRemote = typeof payload?.total === 'number' ? payload.total : txData.length;
          return {
            data: paginatedFromRemote,
            total: totalFromRemote,
            page: typeof payload?.page === 'number' ? payload.page : page,
            limit: typeof payload?.limit === 'number' ? payload.limit : limit,
          };
        } catch (err) {
          console.warn('[TransactionService] 在线获取交易失败，回退本地缓存', err);
        }
      } else {
        fetchRemoteAndUpsert().catch(err => console.warn('[TransactionService] 后台刷新交易数据失败', err));
      }
    }

    const paginatedData = localData.slice(offset, offset + limit);
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
