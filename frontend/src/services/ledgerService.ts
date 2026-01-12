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
  role: 'owner' | 'admin' | 'member' | 'viewer';
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
   */
  getLedgers: async () => {
    // 始终尝试先从本地数据库读取
    const localLedgers = await db.ledgers.toArray();

    // 如果在线，静默刷新本地缓存
    if (offlineSyncService.isOnline()) {
      api.get<any>('/ledgers').then(response => {
        const result = response.data;
        const data = (result && typeof result === 'object' && 'success' in result && 'data' in result) 
          ? result.data 
          : result;
        
        if (data) {
          // 处理双层嵌套 { ledgers: [] } 或直接是数组 []
          const ledgers = Array.isArray(data) ? data : (data.ledgers || []);
          db.ledgers.bulkPut(ledgers);
        }
      }).catch(err => console.warn('后台刷新账本失败', err));
    }

    return localLedgers;
  },

  /**
   * 获取账本详情
   */
  getLedger: async (id: string) => {
    const localLedger = await db.ledgers.get(id);
    
    if (offlineSyncService.isOnline()) {
      api.get<any>(`/ledgers/${id}`).then(response => {
        const result = response.data;
        const data = (result && typeof result === 'object' && 'success' in result && 'data' in result) 
          ? result.data 
          : result;
        
        if (data) {
          db.ledgers.put(data);
        }
      }).catch(err => console.warn(`后台刷新账本详情失败: ${id}`, err));
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
      offlineSyncService.syncPendingChanges().catch(() => {});
    }

    return newLedger;
  },

  /**
   * 更新账本
   */
  updateLedger: async (id: string, data: Partial<Ledger>) => {
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
      offlineSyncService.syncPendingChanges().catch(err => {
        // 静默处理，offlineSyncService 内部已经处理了具体的错误日志
      });
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
