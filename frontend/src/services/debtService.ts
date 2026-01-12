import api from './api';
import { db } from '../db/db';
import { offlineSyncService } from './offlineSyncService';
import { collaborativeService } from './collaborativeService';
import { v4 as uuidv4 } from 'uuid';

export interface Debt {
  id: string;
  debtorName: string;
  debtType: 'borrow' | 'lend';
  originalAmount: number;
  remainingAmount: number;
  paidPercentage?: number;
  interestRate?: number;
  dueDate?: string;
  status: 'pending' | 'partial' | 'paid' | 'overdue';
  description?: string;
  createdAt: string;
  isOverdue?: boolean;
}

const debtService = {
  /**
   * 获取所有债务
   */
  getDebts: async (params?: any) => {
    // 1. 先从本地数据库获取
    let localDebts = await db.debts.toArray();
    
    // 简单的本地过滤
    if (params?.status) {
      localDebts = localDebts.filter(d => d.status === params.status);
    }

    // 2. 如果在线，执行刷新逻辑
    if (offlineSyncService.isOnline()) {
      // 如果本地没有数据，则同步等待网络请求，确保首屏有数据
      if (localDebts.length === 0) {
        try {
          const response = await api.get<any>('/debts', { params });
          const debts = response.data;
          if (Array.isArray(debts)) {
            await db.debts.bulkPut(debts);
            // 触发一次本地通知，确保其他组件也更新
            collaborativeService.emit('ledgerUpdate', { type: 'DEBT_SYNCED', count: debts.length });
            return debts;
          }
        } catch (err) {
          console.warn('同步获取债务失败', err);
        }
      } else {
        // 如果本地有数据，则异步静默刷新
        api.get<any>('/debts', { params }).then(async response => {
          const debts = response.data;
          if (Array.isArray(debts)) {
            await db.debts.bulkPut(debts);
            // 异步刷新完成后，触发通知让 UI 更新
            collaborativeService.emit('ledgerUpdate', { type: 'DEBT_SYNCED', count: debts.length });
          }
        }).catch(err => console.warn('后台刷新债务失败', err));
      }
    }

    return localDebts;
  },

  /**
   * 获取单个债务
   */
  getDebt: async (id: string) => {
    const localDebt = await db.debts.get(id);

    if (offlineSyncService.isOnline()) {
      api.get<any>(`/debts/${id}`).then(response => {
        const debt = response.data;
        if (debt && typeof debt === 'object') {
          db.debts.put(debt);
        }
      }).catch(err => console.warn(`后台刷新债务详情失败: ${id}`, err));
    }

    return localDebt;
  },

  /**
   * 创建债务
   */
  createDebt: async (data: Partial<Debt>) => {
    const id = uuidv4();
    const newDebt = {
      ...data,
      id,
      createdAt: new Date().toISOString(),
      status: 'pending',
      remainingAmount: data.originalAmount || 0,
    } as Debt;

    // 1. 保存到本地
    await db.debts.add(newDebt);

    // 2. 加入同步队列
    await db.syncQueue.add({
      action: 'CREATE',
      entity: 'DEBT',
      entityId: id,
      data: newDebt,
      timestamp: Date.now(),
    });

    // 3. 触发同步
    if (offlineSyncService.isOnline()) {
      offlineSyncService.syncPendingChanges().catch(() => {});
    }

    return newDebt;
  },

  /**
   * 更新债务
   */
  updateDebt: async (id: string, data: Partial<Debt>) => {
    // 1. 更新本地
    await db.debts.update(id, data);

    // 2. 加入同步队列
    await db.syncQueue.add({
      action: 'UPDATE',
      entity: 'DEBT',
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
   * 删除债务
   */
  deleteDebt: async (id: string) => {
    // 1. 从本地删除
    await db.debts.delete(id);

    // 2. 加入同步队列
    await db.syncQueue.add({
      action: 'DELETE',
      entity: 'DEBT',
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
   * 债务还款/收款
   * 注意：此操作涉及较复杂的业务逻辑，暂不完全支持离线
   */
  repayDebt: async (id: string, amount: number, paymentDate: string) => {
    // 在发起还款请求前，先确保该债务已经同步到服务器
    if (offlineSyncService.isOnline()) {
      // 检查同步队列中是否有该债务的创建操作
      const pendingCreate = await db.syncQueue
        .where({ entity: 'DEBT', entityId: id, action: 'CREATE' })
        .first();
      
      if (pendingCreate) {
        console.log(`[DebtService] 发现债务 ${id} 尚未同步到服务器，正在触发强制同步...`);
        await offlineSyncService.syncPendingChanges();
      }
    }

    try {
      const response = await api.post<any>(`/debts/${id}/payments`, { amount, paymentDate });
      
      // 注意：后端 addPayment 返回的是 DebtPayment 对象，或者是封装后的响应
      // 我们需要重新获取最新的债务详情来更新本地缓存
      const debtRes = await api.get<any>(`/debts/${id}`);
      const updatedDebt = debtRes.data;
      
      if (updatedDebt && typeof updatedDebt === 'object') {
        await db.debts.put(updatedDebt);
        return updatedDebt; // 返回更新后的债务对象，而不是还款记录
      }
      
      return response.data;
    } catch (error: any) {
      console.error('[DebtService] 还款操作失败:', error);
      throw error;
    }
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
