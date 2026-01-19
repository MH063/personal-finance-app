import api from './api';
import { db } from '../db/db';
import { offlineSyncService } from './offlineSyncService';
import { v4 as uuidv4 } from 'uuid';

export interface SavingGoal {
  id: string;
  name: string;
  description?: string;
  targetAmount: number;
  currentAmount: number;
  deadline?: string;
  currency: string;
  status: 'active' | 'completed' | 'abandoned';
  autoTransfer?: boolean;
  autoTransferAmount?: number;
  autoTransferDay?: number;
  lastTransferDate?: string;
  userId: string;
  createdAt: string;
  updatedAt: string;
}

export const savingGoalService = {
  /**
   * 获取所有理财目标
   */
  getSavingGoals: async () => {
    /**
     * 保证 Dexie 已打开且 savingGoals 表可用
     */
    const ensureReady = async (): Promise<boolean> => {
      try {
        // 打开数据库（若已打开将直接返回）
        await db.open();
        // 检查表是否存在
        const hasTable = db.tables.some((t) => t.name === 'savingGoals');
        if (!hasTable) {
          console.warn('[SavingGoalService] 本地 IndexedDB 缺少 savingGoals 表，将跳过本地缓存读写');
          return false;
        }
        return true;
      } catch (e) {
        console.warn('[SavingGoalService] Dexie 数据库打开失败，跳过本地缓存读写', e);
        return false;
      }
    };

    const ready = await ensureReady();
    let localGoals: SavingGoal[] = [];
    if (ready) {
      try {
        localGoals = await db.savingGoals.toArray();
      } catch (e) {
        console.warn('[SavingGoalService] 读取本地 savingGoals 失败，使用空数组回退', e);
        localGoals = [];
      }
    }
    const token = localStorage.getItem('accessToken');

    if (offlineSyncService.isOnline() && token) {
      try {
        const response = await api.get<{ data: SavingGoal[] }>('/saving-goals');
        const serverGoals = (response?.data && (response.data as any).data)
          ? (response.data as any).data
          : (response?.data || []);
        
        // 更新本地缓存
        if (ready) {
          try {
            await db.savingGoals.clear();
            await db.savingGoals.bulkAdd(serverGoals);
          } catch (e) {
            console.warn('[SavingGoalService] 更新本地 savingGoals 缓存失败', e);
          }
        }
        return serverGoals;
      } catch (error) {
        console.error('获取理财目标失败，使用本地缓存', error);
        return localGoals;
      }
    }
    return localGoals;
  },

  /**
   * 创建理财目标
   */
  createSavingGoal: async (data: Partial<SavingGoal>) => {
    const userJson = localStorage.getItem('user');
    const user = userJson ? JSON.parse(userJson) : null;
    const userId = user?.id || '';

    const id = uuidv4();
    const newGoal: SavingGoal = {
      ...data,
      id,
      userId,
      currentAmount: data.currentAmount || 0,
      currency: data.currency || 'CNY',
      status: data.status || 'active',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    } as SavingGoal;

    // 1. 保存到本地
    try {
      await db.open();
      if (db.tables.some((t) => t.name === 'savingGoals')) {
        await db.savingGoals.add(newGoal);
      }
    } catch (e) {
      console.warn('[SavingGoalService] 本地保存 savingGoals 失败，继续进行同步队列入列', e);
    }

    // 2. 加入同步队列
    await db.syncQueue.add({
      action: 'CREATE',
      entity: 'SAVING_GOAL',
      entityId: id,
      data: newGoal,
      timestamp: Date.now(),
    });

    // 3. 触发同步
    if (offlineSyncService.isOnline()) {
      await offlineSyncService.syncPendingChanges().catch(() => {});
    }

    return newGoal;
  },

  /**
   * 更新理财目标
   */
  updateSavingGoal: async (id: string, data: Partial<SavingGoal>) => {
    // 1. 更新本地
    try {
      await db.open();
      if (db.tables.some((t) => t.name === 'savingGoals')) {
        await db.savingGoals.update(id, {
          ...data,
          updatedAt: new Date().toISOString(),
        });
      }
    } catch (e) {
      console.warn('[SavingGoalService] 本地更新 savingGoals 失败，继续进行同步队列入列', e);
    }

    // 2. 加入同步队列
    await db.syncQueue.add({
      action: 'UPDATE',
      entity: 'SAVING_GOAL',
      entityId: id,
      data: data,
      timestamp: Date.now(),
    });

    // 3. 触发同步
    if (offlineSyncService.isOnline()) {
      await offlineSyncService.syncPendingChanges().catch(() => {});
    }

    try {
      await db.open();
      if (db.tables.some((t) => t.name === 'savingGoals')) {
        return await db.savingGoals.get(id);
      }
    } catch (e) {
      console.warn('[SavingGoalService] 获取本地 savingGoals 失败，返回更新后的数据副本', e);
    }
    return { id, ...(data as any) } as SavingGoal;
  },

  /**
   * 删除理财目标
   */
  deleteSavingGoal: async (id: string) => {
    // 1. 删除本地
    try {
      await db.open();
      if (db.tables.some((t) => t.name === 'savingGoals')) {
        await db.savingGoals.delete(id);
      }
    } catch (e) {
      console.warn('[SavingGoalService] 本地删除 savingGoals 失败，继续进行同步队列入列', e);
    }

    // 2. 加入同步队列
    await db.syncQueue.add({
      action: 'DELETE',
      entity: 'SAVING_GOAL',
      entityId: id,
      data: null,
      timestamp: Date.now(),
    });

    // 3. 触发同步
    if (offlineSyncService.isOnline()) {
      await offlineSyncService.syncPendingChanges().catch(() => {});
    }
  }
};
