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
  type: 'income' | 'expense' | 'transfer';
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
  tags?: string[];
  reconciled?: boolean;
  isAdjustment?: boolean;
  isTransfer?: boolean;
  toLedgerId?: string;
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
  silent?: boolean;
  tag?: string;
  reconciled?: boolean;
  isAdjustment?: boolean;
  isTransfer?: boolean;
}

export const transactionService = {
  getTransactions: async (query: TransactionQuery = {}) => {
    const token = localStorage.getItem('accessToken');
    // 分页
    const page = query.page || 1;
    const limit = query.limit || 10;
    const offset = (page - 1) * limit;
    // 仅允许服务端接收的查询键，移除 AntD ProTable 默认的 current/pageSize
    const allowedKeys: (keyof TransactionQuery)[] = [
      'page',
      'limit',
      'startDate',
      'endDate',
      'type',
      'categoryId',
      'ledgerId',
      'minAmount',
      'maxAmount',
      'tag',
      'reconciled',
      'isAdjustment',
      'isTransfer',
    ];
    const sanitizedParams: Record<string, any> = {};
    for (const key of allowedKeys) {
      const val = (query as any)[key];
      if (val !== undefined && val !== null && val !== '') {
        sanitizedParams[key] = val;
      }
    }
    // 强制写入分页（避免 params 中意外包含 current/pageSize）
    sanitizedParams.page = page;
    sanitizedParams.limit = limit;

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

    // 未认证直接返回本地缓存，避免触发 401
    if (!token) {
      const paginatedDataUnauth = localData.slice(offset, offset + limit);
      return {
        data: paginatedDataUnauth,
        total: localData.length,
        page,
        limit,
      };
    }

    // 如果在线，静默刷新本地缓存
    if (offlineSyncService.isOnline()) {
      const fetchRemoteAndUpsert = async () => {
        const response = await api.get<any>('/transactions', { 
          params: sanitizedParams, 
          headers: query.silent ? { 'X-Silent-Loading': 'true' } : undefined 
        });
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
    
    const newTx: Transaction = {
      id,
      amount: Number(data.amount),
      type: data.type || 'expense',
      description: data.description || '',
      paymentMethod: data.paymentMethod || 'other',
      merchant: data.merchant || '',
      transactionDate: data.transactionDate || new Date().toISOString(),
      categoryId: data.categoryId || '',
      ledgerId: data.ledgerId,
      category,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      version: 1
    };

    // 乐观更新
    await db.transactions.add(newTx);

    // 后台同步
    api.post('/transactions', data).then(async (res) => {
      // 更新为服务器返回的真实数据
      await db.transactions.put(res.data);
    }).catch(err => {
      console.error('[TransactionService] 创建交易失败，加入离线队列', err);
      offlineSyncService.addToQueue({
        type: 'CREATE_TRANSACTION',
        payload: data,
        id: id
      });
    });

    return newTx;
  },

  batchCreateTransactions: async (
    transactions: Partial<Transaction>[],
    options: { silent?: boolean } = { silent: true }
  ) => {
    // 乐观更新（可选，因为批量数据量大，可能导致卡顿，这里选择直接走 API，成功后再更新本地）
    // 或者先走 API，返回成功后再批量写入本地 DB
    try {
      const response = await api.post(
        '/transactions/batch-create',
        { transactions },
        options.silent ? { headers: { 'X-Silent-Loading': 'true' } } : undefined
      );
      // 触发一次全量或增量拉取，或者手动将返回的 transaction 存入本地
      // 简单起见，强制刷新列表
      return response.data;
    } catch (error) {
      console.error('Batch create failed', error);
      throw error;
    }
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
    const isOnline = offlineSyncService.isOnline();
    if (isOnline) {
      // 在线优先服务端删除，成功后再处理本地
      await api.delete(`/transactions/${id}`);
      // 服务端删除成功后，清理本地与队列
      await db.transactions.delete(id);
      await db.syncQueue
        .where('[entity+entityId+action]')
        .equals(['TRANSACTION', id, 'DELETE'])
        .delete();
      return { id };
    } else {
      // 离线：本地删除并入队，等待同步
      await db.transactions.delete(id);
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
      return { id };
    }
  },

  batchDeleteTransactions: async (ids: string[]) => {
    const isOnline = offlineSyncService.isOnline();
    if (isOnline) {
      // 在线：先请求服务端批量删除，成功后再清理本地和队列
      await api.post('/transactions/batch-delete', { ids });
      await db.transactions.bulkDelete(ids);
      await db.syncQueue.where('entityId').anyOf(ids).delete();
      return { ids };
    } else {
      // 离线：本地删除并将每个删除入队
      await db.transactions.bulkDelete(ids);
      await Promise.all(
        ids.map(id =>
          db.syncQueue.add({
            action: 'DELETE',
            entity: 'TRANSACTION',
            entityId: id,
            data: null,
            timestamp: Date.now(),
          })
        )
      );
      return { ids };
    }
  }
};
