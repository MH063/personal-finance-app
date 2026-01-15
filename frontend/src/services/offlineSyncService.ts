import { db, SyncQueueItem } from '../db/db';
import api from './api';

export type SyncEventType = 'start' | 'progress' | 'complete' | 'error';
export type SyncEventData = {
  total?: number;
  processed?: number;
  success?: boolean;
  item?: SyncQueueItem;
  error?: any;
};
export type SyncListener = (event: SyncEventType, data?: SyncEventData) => void;

/**
 * 离线同步服务
 * 负责管理本地数据与服务器数据的同步逻辑
 */
export const offlineSyncService = {
  listeners: new Set<SyncListener>(),

  on(listener: SyncListener) {
    this.listeners.add(listener);
  },

  off(listener: SyncListener) {
    this.listeners.delete(listener);
  },

  notify(event: SyncEventType, data?: SyncEventData) {
    this.listeners.forEach(listener => {
      try {
        listener(event, data);
      } catch (e) {
        console.error('[OfflineSync] 事件监听器执行失败:', e);
      }
    });
  },

  /**
   * 同步状态锁，防止并发同步

   */
  isSyncing: false,
  /**
   * 服务禁用标识，登出后立即停用所有同步入口
   */
  disabled: false,

  /**
   * 检查是否具备认证条件
   */
  isAuthenticated(): boolean {
    if (this.disabled) return false;
    const token = localStorage.getItem('accessToken');
    if (!token) return false;

    // 检查是否在登录或注册页面，如果是则不执行同步
    const publicPaths = ['/login', '/register'];
    if (publicPaths.includes(window.location.pathname)) {
      return false;
    }

    try {
      // 简单检查 JWT 格式并尝试判断是否过期
      const payload = JSON.parse(atob(token.split('.')[1]));
      if (payload.exp && payload.exp * 1000 < Date.now()) {
        console.warn('[OfflineSync] Token 已过期，跳过同步');
        return false;
      }
    } catch (e) {
      // 解析失败说明 token 格式有问题
      return false;
    }

    return true;
  },

  /**
   * 初始化服务
   */
  async init(): Promise<void> {
    console.log('[OfflineSync] 正在初始化离线同步服务...');
    // 如果未登录，跳过初始化同步，等待登录后再触发
    if (!this.isAuthenticated()) {
      console.log('[OfflineSync] 用户未登录，跳过初始化同步');
      return;
    }
    
    if (this.isOnline()) {
      try {
        await this.syncPendingChanges();
        await this.refreshLocalCache();
      } catch (error) {
        console.error('[OfflineSync] 初始化同步失败:', error);
      }
    }
  },
  /**
   * 停止服务（登出时调用）
   * 清理内部状态并禁止后续同步入口
   */
  shutdown(): void {
    this.disabled = true;
    this.isSyncing = false;
    console.log('[OfflineSync] 已停止离线同步服务');
  },

  /**
   * 检查网络连接状态
   */
  isOnline(): boolean {
    return navigator.onLine;
  },

  /**
   * 同步挂起的变更到服务器
   */
  async syncPendingChanges(): Promise<void> {
    if (!this.isOnline() || this.isSyncing || !this.isAuthenticated()) return;

    this.isSyncing = true;
    let needsRefreshLocalCache = false;
    let processedCount = 0;

    try {
      // 1. 获取所有挂起的变更
      let pendingItems = await db.syncQueue.orderBy('timestamp').toArray();
      if (pendingItems.length === 0) return;

      // 2. 优化队列：移除冗余操作
      const optimizedItems = this.optimizeQueue(pendingItems);
      
      // 如果优化后删除了某些项，同步到数据库
      if (optimizedItems.length < pendingItems.length) {
        const remainingIds = new Set(optimizedItems.map(i => i.id));
        const deletedItems = pendingItems.filter(i => !remainingIds.has(i.id));
        for (const item of deletedItems) {
          await db.syncQueue.delete(item.id!);
        }
        console.log(`[OfflineSync] 队列已优化：移除 ${pendingItems.length - optimizedItems.length} 个冗余操作`);
        pendingItems = optimizedItems;
      }

      if (pendingItems.length === 0) return;
      console.log(`[OfflineSync] 发现 ${pendingItems.length} 个待同步项`);

      this.notify('start', { total: pendingItems.length });

      for (const item of pendingItems) {
        // 再次检查该项是否还在队列中（防止并发调用时的竞争）
        const exists = await db.syncQueue.get(item.id!);
        if (!exists) continue;

        try {
          console.log(`[OfflineSync] 正在同步项: ${item.action} ${item.entity} (ID: ${item.id})`);
          await this.processSyncItem(item);
          // 同步成功，从队列中移除
          if (item.id) {
            await db.syncQueue.delete(item.id);
            console.log(`[OfflineSync] 同步成功并移除项: ${item.id}`);
            
            processedCount++;
            this.notify('progress', { total: pendingItems.length, processed: processedCount, success: true, item });
          }
          if (item.entity === 'DEBT') {
            needsRefreshLocalCache = true;
          }
        } catch (error: any) {
        // 处理 IndexedDB 约束错误 (虽然上面改用了 put，但防御性处理同步队列本身的 ID 问题)
        if (error.name === 'ConstraintError' || error.message?.includes('ConstraintError')) {
          console.warn(`[OfflineSync] 检测到数据库约束错误 (ID: ${item.id})，可能由于重复同步引起。跳过该项。`, error.message);
          if (item.id) await db.syncQueue.delete(item.id);
          continue;
        }

        const status = error.response?.status;
        const errorMessage = error.response?.data?.message || error.message || '';
        const detailedError = error.response?.data;

        // 如果是 404 (不存在) 或 403 (无权限)，可能永远无法同步成功
        // 特别是在删除操作时，如果服务器上已经不存在，视为同步成功（目标已达成）
        if (status === 404) {
          if (item.action === 'DELETE') {
            console.log(`[OfflineSync] 同步项 (ID: ${item.id}, DELETE ${item.entity}) 目标不存在，视为同步成功`);
          } else {
            if (item.entity === 'DEBT') {
              try {
                await db.debts.delete(item.entityId);
                console.warn(`[OfflineSync] 债务不存在，已清理本地债务并移除同步项: debtId=${item.entityId}, queueId=${item.id}`);
              } catch (e) {
                console.warn(`[OfflineSync] 清理本地债务失败: debtId=${item.entityId}, queueId=${item.id}`, e);
              }
            }
          }
          if (item.entity === 'DEBT') {
            needsRefreshLocalCache = true;
          }
          if (item.id) await db.syncQueue.delete(item.id);
          continue; 
        }

        if (status === 403 || status === 401) {
          console.warn(`[OfflineSync] 认证或权限失败 (ID: ${item.id})，状态码 ${status} (${errorMessage})，暂停本轮同步并保留队列`);
          break;
        }

        // 只有不是 404/403 的异常才打印严重错误日志
        console.error(`[OfflineSync] 同步项失败 (ID: ${item.id}):`, {
          status,
          message: errorMessage,
          details: detailedError,
          item
        });

        // 如果是 400 (请求错误)，尝试修复或跳过
        if (status === 400) {
          console.warn(`[OfflineSync] 检测到 400 错误，尝试自动处理...`);

          if (item.entity === 'DEBT' && item.action === 'UPDATE') {
            try {
              const debtRes = await api.get<any>(`/debts/${item.entityId}`, {
                headers: { 'X-Silent-Error': 'true' },
              });
              const serverDebt = debtRes?.data;
              if (serverDebt && typeof serverDebt === 'object' && !Array.isArray(serverDebt) && serverDebt.id) {
                await db.debts.put(serverDebt);
                console.warn('[OfflineSync] 债务更新被拒绝，已回滚本地为服务器数据:', {
                  debtId: item.entityId,
                  message: errorMessage,
                });
                needsRefreshLocalCache = true;
              }
            } catch (rollbackError: any) {
              console.warn('[OfflineSync] 债务更新被拒绝，回滚本地数据失败:', {
                debtId: item.entityId,
                message: rollbackError?.message,
              });
            }

            console.error(`[OfflineSync] 无法自动修复的 400 错误，从队列移除以避免阻塞同步:`, errorMessage);
            if (item.id) await db.syncQueue.delete(item.id);
            continue;
          }
          
          // 针对交易记录缺失 type 或类型不匹配的特殊处理
          if (item.entity === 'TRANSACTION' && item.action === 'CREATE') {
            const transactionData = item.data;
            const categoryId = transactionData?.categoryId;
            
            if (categoryId) {
              // 从本地数据库获取分类信息
              const category = await db.categories.get(categoryId);
              if (category && category.type) {
                console.info(`[OfflineSync] 尝试修复交易记录 (ID: ${item.id}): 使用分类类型 "${category.type}"`);
                const fixedData = { ...transactionData, type: category.type };
                await db.syncQueue.update(item.id!, { data: fixedData });
                // 更新后继续循环，让下次同步尝试新的数据
                continue;
              }
            }

            // 如果没有分类信息但确实缺失 type，尝试默认值
            if (!transactionData?.type) {
              console.info(`[OfflineSync] 交易记录 (ID: ${item.id}) 缺失 type 且无法从分类修复，尝试补全为 expense`);
              const fixedData = { ...transactionData, type: 'expense' };
              await db.syncQueue.update(item.id!, { data: fixedData });
              continue;
            }
          }

          // 如果无法自动修复，为了不阻塞后续同步，将其标记为失败并移除（或者移动到错误日志表）
          console.error(`[OfflineSync] 无法自动修复的 400 错误，从队列移除以避免阻塞同步:`, errorMessage);
          if (item.id) await db.syncQueue.delete(item.id);
          continue;
        }

        // 如果是认证错误或其他无法恢复的错误，可能需要特殊处理
        // 这里简单跳过，等待下次尝试
        break; 
      }
    }
    } finally {
      this.isSyncing = false;
      this.notify('complete', { total: processedCount });
      if (needsRefreshLocalCache) {
        try {
          await this.refreshLocalCache();
        } catch (e) {
          console.warn('[OfflineSync] 同步完成后刷新本地缓存失败', e);
        }
      }
    }
  },

  /**
   * 根据实体名称获取对应的数据库表
   */
  getTableForEntity(entity: string) {
    switch (entity) {
      case 'LEDGER': return db.ledgers;
      case 'TRANSACTION': return db.transactions;
      case 'CATEGORY': return db.categories;
      case 'DEBT': return db.debts;
      case 'BUDGET': return db.budgets;
      default: return null;
    }
  },

  /**
   * 清理同步负载，移除后端 DTO 不允许的字段
   */
  cleanPayload(data: any): any {
    if (!data) return data;
    
    // 创建一个副本，避免修改原始数据
    const cleanData = { ...data };
    
    // 通用的系统级字段，所有 DTO 都不允许
    const systemFields = [
      'id', 
      'createdAt', 
      'updatedAt', 
      'ownerId', 
      'userId', 
      'isSystem', 
      'isDefault',
      'transactionCount',
      'totalAmount',
      'paymentCount',
      'totalPaid',
      'usedAmount',
      'usedBudget',
      'usagePercentage',
      'remainingAmount', // CREATE 时通常不允许，UPDATE 时部分允许，这里先移除，特定逻辑再处理
      'status', // 同上
      'debtType', // 债务类型通常不可更改
      'originalAmount', // 原始金额通常不可更改
      'paidPercentage', // 计算字段
      'isOverdue', // 计算字段
      'category', // 移除嵌套的对象，只保留 categoryId
      'ledger', // 移除嵌套的对象，只保留 ledgerId
      'tags', // 移除标签对象列表（如果后端 DTO 不支持直接发送对象数组）
    ];
    
    systemFields.forEach(field => {
      delete cleanData[field];
    });
    
    return cleanData;
  },

  /**
   * 处理单个同步项
   */
  async processSyncItem(item: SyncQueueItem): Promise<void> {
    const { action, entity, entityId, data } = item;
    
    // 实体与 API 路径的映射
    const endpointMap: Record<string, string> = {
      'TRANSACTION': '/transactions',
      'LEDGER': '/ledgers',
      'CATEGORY': '/categories',
      'DEBT': '/debts',
      'BUDGET': '/budgets'
    };
    
    const endpoint = endpointMap[entity] || '/ledgers';

    switch (action) {
      case 'CREATE': {
        const tempId = data?.id;
        const createData = this.cleanPayload(data);
        
        // 针对特定实体的特殊处理
        if (entity === 'DEBT') {
          // 债务创建时允许传递 ID，以保持离线 ID 一致性
          createData.id = tempId;
          // 债务创建时必须包含类型和原始金额，cleanPayload 默认移除了它们
          if (data.debtType) createData.debtType = data.debtType;
          if (data.originalAmount !== undefined) createData.originalAmount = data.originalAmount;
        } else if (entity === 'BUDGET') {
          // Budget CREATE 需要 categoryId，但 cleanPayload 默认会保留它（因为它不在 systemFields 中）
          // 但是 Budget CREATE 不允许 status
          delete createData.status;
        }

        const response = await api.post(endpoint, createData, {
          headers: { 
            'X-Silent-Error': 'true',
            'X-Sync-Action': 'CREATE',
            'X-Entity-ID': tempId
          }
        });
        
        // 同步成功后，用服务器返回的真实数据更新本地数据库
        // 注意：后端返回结构是 { success: true, data: { ... } }
        const result = response.data;
        const serverData = (result && typeof result === 'object' && 'success' in result && 'data' in result) 
          ? result.data 
          : result;

        if (serverData && tempId) {
          // 1. 删除本地的临时记录
          const table = this.getTableForEntity(entity);
          if (table) {
            await table.delete(tempId);
            // 2. 使用 put 替代 add，防止 ID 冲突 (ConstraintError)
            await table.put(serverData);
            console.log(`[OfflineSync] 已将本地临时记录 ${tempId} 替换为服务器真实记录 ${serverData.id}`);
            
            // 3. 重要：更新同步队列中所有引用了该临时 ID 的项
            // 例如：新创建了账本 A (临时 ID)，后续有在账本 A 下创建交易的操作
            const pendingItems = await db.syncQueue.filter(i => i.entityId === tempId || (i.data && i.data.ledgerId === tempId)).toArray();
            for (const pendingItem of pendingItems) {
              const newData = { ...pendingItem.data };
              if (newData.ledgerId === tempId) newData.ledgerId = serverData.id;
              if (newData.id === tempId) newData.id = serverData.id;

              await db.syncQueue.update(pendingItem.id!, {
                entityId: pendingItem.entityId === tempId ? serverData.id : pendingItem.entityId,
                data: newData
              });
            }
            if (pendingItems.length > 0) {
              console.log(`[OfflineSync] 已更新同步队列中的 ${pendingItems.length} 个相关项的 ID`);
            }
          }
        }
        break;
      }
      case 'UPDATE': {
        // 更新时移除 id 和时间戳，ID 已经在 URL 中了
        const updateData = this.cleanPayload(data);
        
        // 针对特定实体的特殊处理
        if (entity === 'DEBT') {
          // Debt UPDATE 允许 remainingAmount、status、originalAmount
          if (data.remainingAmount !== undefined) updateData.remainingAmount = data.remainingAmount;
          if (data.status !== undefined) updateData.status = data.status;
          if (data.originalAmount !== undefined) updateData.originalAmount = data.originalAmount;
        } else if (entity === 'BUDGET') {
          // 预算更新不允许 categoryId，后端 DTO 只有 amount, startDate, endDate, status
          delete updateData.categoryId;
          
          // 同时也允许 status，因为 cleanPayload 默认移除了它
          if (data.status !== undefined) updateData.status = data.status;
        }

        // 默认使用 PUT，BUDGET 使用 PATCH
        const method = entity === 'BUDGET' ? 'patch' : 'put';
        console.log('[OfflineSync] 同步更新请求:', { entity, entityId, method, updateData });
        const response = await (api as any)[method](`${endpoint}/${entityId}`, updateData, {
          headers: { 
            'X-Silent-Error': 'true',
            'X-Sync-Action': 'UPDATE',
            'X-Entity-ID': entityId
          }
        });

        if (entity === 'DEBT') {
          const serverData = response?.data;
          if (serverData && typeof serverData === 'object' && !Array.isArray(serverData) && serverData.id) {
            console.log('[OfflineSync] 债务更新成功，回写本地:', { id: serverData.id, originalAmount: (serverData as any).originalAmount });
            await db.debts.put(serverData);
          }
        }
        break;
      }
      case 'DELETE':
        await api.delete(`${endpoint}/${entityId}`, {
          headers: { 
            'X-Silent-Error': 'true',
            'X-Sync-Action': 'DELETE',
            'X-Entity-ID': entityId
          },
          validateStatus: (status) => (status >= 200 && status < 300) || status === 404
        });
        break;
    }
  },

  /**
   * 刷新本地所有缓存数据
   */
  async refreshLocalCache(): Promise<void> {
    if (!this.isOnline() || !this.isAuthenticated()) return;

    try {
      console.log('[OfflineSync] 正在刷新本地缓存...');
      
      // 使用静默模式请求，避免初始化时的 401 报错干扰用户
      const config = { headers: { 'X-Silent-Error': 'true' } };

      // 内部帮助函数：从响应中提取数组数据
      const extractArray = (res: any) => {
        const result = res.data;
        if (!result) return [];
        const innerData = (result && typeof result === 'object' && 'success' in result && 'data' in result) 
          ? result.data 
          : result;
        
        if (Array.isArray(innerData)) return innerData;
        if (innerData && typeof innerData === 'object' && 'data' in innerData && Array.isArray(innerData.data)) {
          return innerData.data; // 处理分页结构 { data: [], total: ... }
        }
        return [];
      };

      // 1. 同步分类
      const categories = extractArray(await api.get('/categories', config));
      if (categories.length > 0) {
        await db.categories.clear();
        await db.categories.bulkPut(categories);
      }

      // 2. 同步账本
      const ledgers = extractArray(await api.get('/ledgers', config));
      if (ledgers.length > 0) {
        await db.ledgers.clear();
        await db.ledgers.bulkPut(ledgers);
      }

      // 3. 同步预算
      const budgets = extractArray(await api.get('/budgets', config));
      if (budgets.length > 0) {
        await db.budgets.clear();
        await db.budgets.bulkPut(budgets);
      }

      // 4. 同步债务
      const debts = extractArray(await api.get('/debts', config));
      const serverDebtIds = new Set<string>((debts || []).map((d: any) => d?.id).filter(Boolean));
      const pendingDebtCreates = await db.syncQueue
        .where('entity')
        .equals('DEBT')
        .filter(i => i.action === 'CREATE')
        .toArray();
      const pendingDebtCreateIds = new Set(pendingDebtCreates.map(i => i.entityId));

      const localDebts = await db.debts.toArray();
      const staleDebtIds = localDebts
        .map((d: any) => d?.id)
        .filter((id: any) => !!id && !serverDebtIds.has(id) && !pendingDebtCreateIds.has(id));

      if (staleDebtIds.length > 0) {
        console.warn(`[OfflineSync] 检测到 ${staleDebtIds.length} 条服务器不存在的本地债务，已清理以避免脏数据`);
        await db.debts.bulkDelete(staleDebtIds);
      }

      if (debts.length > 0) {
        await db.debts.bulkPut(debts);
      }

      // 5. 同步交易记录 (只获取最近的)
      const transactions = extractArray(await api.get('/transactions', { ...config, params: { limit: 100 } }));
      if (transactions.length > 0) {
        // 对于交易，我们可能不想清除全部，而是合并
        await db.transactions.bulkPut(transactions);
      }
      
      console.log('[OfflineSync] 本地缓存刷新完成');
    } catch (error: any) {
      // 只有在非 401 错误时才打印错误，401 由 api.ts 统一处理跳转
      if (error.response?.status !== 401) {
        console.error('[OfflineSync] 刷新本地缓存失败:', error);
      }
    }
  },

  /**
   * 优化同步队列，合并或删除冗余操作
   */
  optimizeQueue(items: SyncQueueItem[]): SyncQueueItem[] {
    if (items.length <= 1) return items;

    const result: SyncQueueItem[] = [];
    const entityMap = new Map<string, SyncQueueItem[]>();

    // 按实体和 ID 分组
    for (const item of items) {
      const key = `${item.entity}:${item.entityId}`;
      if (!entityMap.has(key)) {
        entityMap.set(key, []);
      }
      entityMap.get(key)!.push(item);
    }

    // 处理每组操作
    for (const [, group] of entityMap.entries()) {
      if (group.length === 1) {
        result.push(group[0]);
        continue;
      }

      // 按照时间戳排序（虽然已经是排好序的，但防御性处理）
      group.sort((a, b) => a.timestamp - b.timestamp);

      let finalItem: SyncQueueItem | null = null;
      let isDeleted = false;
      let isCreatedLocally = group[0].action === 'CREATE';

      for (const item of group) {
        if (item.action === 'CREATE') {
          finalItem = item;
          isCreatedLocally = true;
        } else if (item.action === 'UPDATE') {
          if (finalItem) {
            finalItem.data = { ...finalItem.data, ...item.data };
          } else {
            finalItem = item;
          }
        } else if (item.action === 'DELETE') {
          isDeleted = true;
          // 如果是本地创建后又删除，则整个链路抵消
          if (isCreatedLocally) {
            finalItem = null;
          } else {
            finalItem = item;
          }
        }
      }

      if (finalItem && (!isDeleted || !isCreatedLocally)) {
        result.push(finalItem);
      }
    }

    // 保持原始队列的大致顺序（按最早操作的时间戳排序）
    return result.sort((a, b) => a.timestamp - b.timestamp);
  }
};

// 监听网络状态变化
window.addEventListener('online', () => {
  console.log('[OfflineSync] 网络已连接，启动同步...');
  offlineSyncService.syncPendingChanges();
});

window.addEventListener('offline', () => {
  console.log('[OfflineSync] 网络已断开，进入离线模式');
});
