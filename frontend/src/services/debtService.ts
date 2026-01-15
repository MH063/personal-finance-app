import api from './api';
import { db } from '../db/db';
import { offlineSyncService } from './offlineSyncService';
import { v4 as uuidv4 } from 'uuid';

export type RepaymentType =
  | 'equal_loan_payments'
  | 'equal_principal_payments'
  | 'interest_first'
  | 'one_time_payment'
  | 'custom';

export interface Debt {
  id: string;
  debtorName: string;
  debtType: 'borrow' | 'lend';
  originalAmount: number;
  remainingAmount: number;
  paidPercentage?: number;
  interestRate?: number;
  accumulatedInterest?: number;
  loanDate?: string;
  dueDate?: string;
  status: 'pending' | 'partial' | 'paid' | 'overdue';
  description?: string;
  createdAt: string;
  isOverdue?: boolean;
  version?: number;
  paymentMethod?: 'cash' | 'alipay' | 'wechat' | 'bank_card' | 'other';
  repaymentType?: RepaymentType;
  repaymentDay?: number;
  repaymentDayAdjustment?: 'none' | 'workday';
  isReminderEnabled?: boolean;
  reminderDate?: string;
  payments?: DebtPayment[];
}

export interface DebtPayment {
  id: string;
  debtId: string;
  amount: number;
  paymentDate: string;
  paymentMethod?: string;
  note?: string;
  status: 'pending' | 'confirmed';
}

const debtService = {
  sanitizeDebtUpdatePayload: (data: Partial<Debt>, version?: number) => {
    const {
      debtorName,
      originalAmount,
      remainingAmount,
      loanDate,
      dueDate,
      status,
      description,
      paymentMethod,
      repaymentType,
      interestRate,
      repaymentDay,
      repaymentDayAdjustment,
      isReminderEnabled,
      reminderDate,
    } = data || {};

    const payload: any = {
      debtorName,
      originalAmount,
      remainingAmount,
      loanDate,
      dueDate,
      status,
      description,
      paymentMethod,
      repaymentType,
      interestRate,
      repaymentDay,
      repaymentDayAdjustment,
      isReminderEnabled,
      reminderDate,
      version,
    };

    Object.keys(payload).forEach((key) => {
      if (payload[key] === undefined) delete payload[key];
    });

    return payload;
  },
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

    // 内部帮助函数：从响应中提取债务列表
    const extractDebts = (result: any) => {
      if (!result) return [];
      
      // 检查 api.ts 解构后的数据
      // 如果 result 本身是数组，直接返回
      if (Array.isArray(result)) return result;
      
      // 如果 result 是对象，尝试获取嵌套的 debts 或 data 字段
      if (typeof result === 'object') {
        // Rule 5: 处理 { success: true, data: { debts: [] } } 或类似的结构
        const debts = result.debts || result.data;
        if (Array.isArray(debts)) return debts;
        
        // 兜底：查找第一个数组属性
        for (const key in result) {
          if (Array.isArray(result[key])) return result[key];
        }
      }
      return [];
    };

    const dedupeById = (items: any[]) => {
      const map = new Map<string, any>();
      for (const item of items || []) {
        const id = item?.id;
        if (!id) continue;
        map.set(id, item);
      }
      return Array.from(map.values());
    };

    // 2. 如果在线，执行刷新逻辑
    if (offlineSyncService.isOnline()) {
      // 如果本地没有数据，则同步等待网络请求，确保首屏有数据
      if (localDebts.length === 0) {
        try {
          console.log('[DebtService] 本地无数据，正在从服务器获取债务列表...');
          const response = await api.get<any>('/debts', { params });
          const debts = dedupeById(extractDebts(response.data));
          
          if (debts && debts.length > 0) {
            console.log(`[DebtService] 成功从服务器获取 ${debts.length} 条债务数据`);
            await db.debts.bulkPut(debts);
            return debts;
          }
        } catch (err) {
          console.warn('[DebtService] 同步获取债务失败', err);
        }
      } else {
        // 如果本地有数据，则异步静默刷新
        api.get<any>('/debts', { params }).then(async response => {
          const debts = dedupeById(extractDebts(response.data));
          if (debts && debts.length > 0) {
            console.log(`[DebtService] 后台刷新成功，获取 ${debts.length} 条数据`);
            await db.debts.bulkPut(debts);
          }
        }).catch(err => console.warn('[DebtService] 后台刷新债务失败', err));
      }
    }

    return localDebts;
  },

  /**
   * 获取单个债务
   */
  getDebt: async (id: string) => {
    const localDebt = await db.debts.get(id);

    // 内部帮助函数：从响应中提取债务详情
    const extractDebt = (result: any) => {
      if (!result) return null;
      // Rule 5: 如果 result 有嵌套的 debt 或 data 字段且不是数组
      if (typeof result === 'object' && !Array.isArray(result)) {
        if (result.debt && typeof result.debt === 'object') return result.debt;
        // 如果 result 本身就是我们要的对象
        return result;
      }
      return null;
    };

    if (offlineSyncService.isOnline()) {
      api.get<any>(`/debts/${id}`).then(response => {
        const debt = extractDebt(response.data);
        if (debt) {
          db.debts.put(debt);
        }
      }).catch(err => console.warn(`[DebtService] 后台刷新债务详情失败: ${id}`, err));
    }

    return localDebt;
  },

  /**
   * 同步历史债务到交易流水
   */
  syncDebtsToTransactions: async () => {
    if (offlineSyncService.isOnline()) {
      const response = await api.post<any>('/debts/sync-transactions');
      return response.data;
    }
    throw new Error('离线状态无法同步历史数据');
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
      await offlineSyncService.syncPendingChanges().catch(() => {});
    }

    return newDebt;
  },

  /**
   * 更新债务
   */
  updateDebt: async (id: string, data: Partial<Debt>) => {
    // 获取当前记录
    const current = await db.debts.get(id);
    console.log('[DebtService] 更新债务(本地先写):', { id, data, version: current?.version });

    if (offlineSyncService.isOnline()) {
      const payload = debtService.sanitizeDebtUpdatePayload(data, current?.version);
      try {
        console.log('[DebtService] 在线更新债务(请求后端):', { id, payload });
        const response = await api.put<any>(`/debts/${id}`, payload, {
          headers: {
            'X-Silent-Error': 'true',
            'X-Sync-Action': 'UPDATE',
            'X-Entity-ID': id,
          },
        });
        const updatedFromServer = response.data;

        if (updatedFromServer && typeof updatedFromServer === 'object' && !Array.isArray(updatedFromServer)) {
          await db.debts.put(updatedFromServer);
        }

        await db.syncQueue.where('[entity+entityId+action]').equals(['DEBT', id, 'UPDATE']).delete();
        console.log('[DebtService] 在线更新成功(已回写本地):', { id, updatedFromServer });
        return updatedFromServer as Debt;
      } catch (error: any) {
        const message = error?.response?.data?.message || error?.message || '更新债务失败';
        console.error('[DebtService] 在线更新失败:', {
          id,
          message,
          status: error?.response?.status,
          details: error?.response?.data,
        });
        throw new Error(message);
      }
    }

    // 1. 更新本地
    await db.debts.update(id, data);

    // 2. 加入同步队列
    await db.syncQueue.add({
      action: 'UPDATE',
      entity: 'DEBT',
      entityId: id,
      data: { ...data, version: current?.version }, // 包含版本号以支持乐观锁
      timestamp: Date.now(),
    });
    console.log('[DebtService] 已加入同步队列(UPDATE DEBT):', { id, data });

    // 3. 触发同步
    if (offlineSyncService.isOnline()) {
      await offlineSyncService.syncPendingChanges().catch(() => {});
    }

    // 4. 获取并返回完整的更新后债务数据
    const updatedDebt = await db.debts.get(id);
    console.log('[DebtService] 更新债务完成(返回本地最新):', { id, updatedDebt });
    return updatedDebt as Debt;
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
      await offlineSyncService.syncPendingChanges().catch(() => {});
    }

    return { id };
  },

  /**
   * 债务还款/收款
   * 注意：此操作涉及较复杂的业务逻辑，暂不完全支持离线
   */
  repayDebt: async (id: string, amount: number, paymentDate: string, paymentMethod?: string) => {
    // 在发起还款请求前，先确保该债务已经同步到服务器
    if (offlineSyncService.isOnline()) {
      // 检查同步队列中是否有该债务的创建操作
      const pendingCreate = await db.syncQueue
        .where('[entity+entityId+action]')
        .equals(['DEBT', id, 'CREATE'])
        .first();
      
      if (pendingCreate) {
        console.log(`[DebtService] 发现债务 ${id} 尚未同步到服务器，正在强制执行同步...`);
        try {
          await offlineSyncService.syncPendingChanges();
          
          // 再次检查是否同步成功
          const stillPending = await db.syncQueue
            .where('[entity+entityId+action]')
            .equals(['DEBT', id, 'CREATE'])
            .first();
          
          if (stillPending) {
            throw new Error('债务创建同步失败，无法进行还款操作，请检查网络或稍后再试');
          }
          console.log(`[DebtService] 债务 ${id} 同步成功，准备进行还款`);
        } catch (syncErr: any) {
          console.error('[DebtService] 强制同步失败:', syncErr);
          throw new Error('还款前同步债务数据失败: ' + (syncErr.message || '未知错误'));
        }
      }
    }

    try {
      console.log(`[DebtService] 正在为债务 ${id} 发起还款: ${amount}, 方式: ${paymentMethod}`);
      const response = await api.post<any>(`/debts/${id}/payments`, { 
        amount, 
        paymentDate,
        paymentMethod: paymentMethod || 'other'
      });
      
      // 注意：后端 addPayment 返回的是 DebtPayment 对象，或者是封装后的响应
      // 我们需要重新获取最新的债务详情来更新本地缓存
      const debtRes = await api.get<any>(`/debts/${id}`);
      
      // 使用之前定义的 extractDebt 逻辑（虽然这里没直接调用，但逻辑一致）
      let updatedDebt = debtRes.data;
      if (updatedDebt && typeof updatedDebt === 'object' && !Array.isArray(updatedDebt)) {
        // 如果是 { success, data } 结构，api.ts 已经处理了一层
        // 但如果 data 里面还有一层 debt
        if (updatedDebt.debt && typeof updatedDebt.debt === 'object') {
          updatedDebt = updatedDebt.debt;
        }
        
        console.log(`[DebtService] 还款成功，已更新本地债务数据: ${id}`);
        await db.debts.put(updatedDebt);
        if (offlineSyncService.isOnline()) {
          await offlineSyncService.refreshLocalCache().catch(() => {});
        }
        return updatedDebt;
      }
      
      return response.data;
    } catch (error: any) {
      console.error('[DebtService] 还款操作失败:', error);
      // 如果后端返回 404 且信息包含“不存在”，说明之前的同步可能虽然从队列移除但并未在后端创建成功
      if (error.response?.status === 404) {
        const pendingCreate = await db.syncQueue
          .where('[entity+entityId+action]')
          .equals(['DEBT', id, 'CREATE'])
          .first();

        if (!pendingCreate && offlineSyncService.isOnline()) {
          console.warn(`[DebtService] 服务器未找到债务 ${id}，将清理本地并刷新缓存`);
          try {
            await db.debts.delete(id);
          } catch (deleteError) {
            console.warn(`[DebtService] 清理本地债务失败: ${id}`, deleteError);
          }
          await offlineSyncService.refreshLocalCache().catch(() => {});
          throw new Error('该债务在服务器不存在，已自动刷新列表，请重试');
        }

        throw new Error('服务器未找到该债务记录，可能是同步延迟，请稍后刷新重试');
      }
      throw error;
    }
  },

  /**
   * 获取债务统计
   */
  getDebtStatistics: async () => {
    const response = await api.get<any>('/debts/statistics');
    const result = response.data;
    // 根据 Rule 5: 优先获取嵌套的 data 字段
    return (result && typeof result === 'object' && 'success' in result && 'data' in result) 
      ? result.data 
      : result;
  },

  addPayment: async (debtId: string, data: any) => {
    if (offlineSyncService.isOnline()) {
      const response = await api.post<any>(`/debts/${debtId}/payments`, data);
      return response.data;
    }
    throw new Error('离线状态无法添加还款');
  },

  /**
   * 更新还款记录 (确认还款)
   */
  updatePayment: async (debtId: string, paymentId: string, data: any) => {
    if (offlineSyncService.isOnline()) {
      const response = await api.put<any>(`/debts/${debtId}/payments/${paymentId}`, data);
      return response.data;
    }
    throw new Error('离线状态无法更新还款');
  },
};

export default debtService;
