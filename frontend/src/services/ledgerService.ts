import api from './api';
import { db } from '../db/db';
import { offlineSyncService } from './offlineSyncService';
import { v4 as uuidv4 } from 'uuid';

export interface Ledger {
  id: string;
  name: string;
  description?: string;
  ownerId: string;
  type: 'private' | 'shared';
  isDefault: boolean;
  createdAt: string;
  updatedAt: string;
  version?: number;
  members?: LedgerMember[];
  owner?: {
    id: string;
    username: string;
    fullName: string;
  };
}

export interface LedgerMember {
  id: string;
  ledgerId: string;
  userId: string;
  role: 'owner' | 'admin' | 'member' | 'viewer' | 'child';
  joinedAt: string;
  user?: {
    id: string;
    username: string;
    fullName: string;
    email: string;
  };
}

export const ledgerService = {
  /**
   * 获取用户的所有账本
   * 在线优先：在线且已认证时直接请求服务端，覆盖本地并返回服务端数据；离线时返回本地缓存
   */
  /**
   * 获取用户的所有账本
   */
  getLedgers: async (options?: { silent?: boolean }) => {
    const localLedgers = await db.ledgers.toArray();
    const token = localStorage.getItem('accessToken');

    if (offlineSyncService.isOnline() && token) {
      try {
        console.log('[LedgerService] 在线获取账本列表（服务端优先）');
        const response = await api.get<any>('/ledgers', options?.silent ? { headers: { 'X-Silent-Loading': 'true', 'X-Silent-Error': 'true' } } : undefined);
        const result = response.data;
        if (result) {
          const ledgers = Array.isArray(result) ? result : (result.ledgers || result.data || []);
          await db.ledgers.clear();
          await db.ledgers.bulkPut(ledgers);
          return ledgers;
        }
      } catch (err) {
        console.warn('[LedgerService] 在线获取账本失败，回退本地数据', err);
      }
    }
    return localLedgers;
  },

  /**
   * 获取账本详情
   * 在线优先：在线时返回服务端详情并同步本地；离线返回本地缓存
   */
  getLedger: async (id: string) => {
    const localLedger = await db.ledgers.get(id);
    const token = localStorage.getItem('accessToken');
    if (offlineSyncService.isOnline() && token) {
      try {
        const response = await api.get<any>(`/ledgers/${id}`);
        const data = response.data;
        if (data) {
          await db.ledgers.put(data);
          return data;
        }
      } catch (err) {
        console.warn(`[LedgerService] 在线获取账本详情失败，返回本地缓存: ${id}`, err);
      }
    }
    return localLedger;
  },

  /**
   * 创建账本
   */
  createLedger: async (data: Partial<Ledger>) => {
    // 获取当前用户信息以设置 ownerId
    const userJson = localStorage.getItem('user');
    const user = userJson ? JSON.parse(userJson) : null;
    const ownerId = user?.id || '';

    const id = uuidv4();
    const newLedger = {
      ...data,
      id,
      ownerId,
      owner: user ? {
        id: user.id,
        username: user.username,
        fullName: user.fullName || user.username
      } : undefined,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      isDefault: false,
    } as Ledger;

    // 1. 保存到本地
    await db.ledgers.add(newLedger);

    // 2. 加入同步队列
    await db.syncQueue.add({
      action: 'CREATE',
      entity: 'LEDGER',
      entityId: id,
      data: newLedger,
      timestamp: Date.now(),
    });

    // 3. 触发同步
    if (offlineSyncService.isOnline()) {
      await offlineSyncService.syncPendingChanges().catch(() => {});
    }

    return newLedger;
  },

  /**
   * 更新账本
   */
  updateLedger: async (id: string, data: Partial<Ledger>) => {
    // 获取当前记录
    const current = await db.ledgers.get(id);

    // 1. 更新本地
    await db.ledgers.update(id, {
      ...data,
      updatedAt: new Date().toISOString(),
    });

    // 2. 加入同步队列
    await db.syncQueue.add({
      action: 'UPDATE',
      entity: 'LEDGER',
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
   * 删除账本
   */
  deleteLedger: async (id: string) => {
    // 1. 从本地删除
    await db.ledgers.delete(id);

    // 2. 加入同步队列（先检查是否已存在删除任务，避免重复）
    const existingDelete = await db.syncQueue
      .where('[entity+entityId+action]')
      .equals(['LEDGER', id, 'DELETE'])
      .first();

    if (!existingDelete) {
      await db.syncQueue.add({
        action: 'DELETE',
        entity: 'LEDGER',
        entityId: id,
        data: null,
        timestamp: Date.now(),
      });
    }

    // 3. 触发同步
    if (offlineSyncService.isOnline()) {
      await offlineSyncService.syncPendingChanges().catch(() => {});
    }

    return { id };
  },

  /**
   * 添加账本成员
   */
  addMember: async (ledgerId: string, userId: string, role: string = 'member') => {
    const response = await api.post<any>(`/ledgers/${ledgerId}/members`, { userId, role });
    const result = response.data;
    // 根据 Rule 5: 优先获取嵌套的 data 字段
    return (result && typeof result === 'object' && 'success' in result && 'data' in result) 
      ? result.data 
      : result;
  },

  /**
   * 移除账本成员
   */
  removeMember: async (ledgerId: string, userId: string) => {
    const response = await api.delete<any>(`/ledgers/${ledgerId}/members/${userId}`);
    const result = response.data;
    // 根据 Rule 5: 优先获取嵌套的 data 字段
    return (result && typeof result === 'object' && 'success' in result && 'data' in result) 
      ? result.data 
      : result;
  }
};
