import { db, SyncQueueItem } from '../db/db';
import api from './api';

/**
 * 离线同步服务
 * 负责管理本地数据与服务器数据的同步逻辑
 */
export const offlineSyncService = {
  /**
   * 同步状态锁，防止并发同步
   */
  isSyncing: false,

  /**
   * 检查是否具备认证条件
   */
  isAuthenticated(): boolean {
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

      for (const item of pendingItems) {
        // 再次检查该项是否还在队列中（防止并发调用时的竞争）
        const exists = await db.syncQueue.get(item.id!);
        if (!exists) continue;

        try {
          await this.processSyncItem(item);
          // 同步成功，从队列中移除
          if (item.id) await db.syncQueue.delete(item.id);
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
        if (status === 404 || status === 403) {
          if (item.action === 'DELETE') {
            console.log(`[OfflineSync] 同步项 (ID: ${item.id}, DELETE ${item.entity}) 在服务器上已不存在或无权限，视为同步成功`);
          } else {
            console.warn(`[OfflineSync] 同步项失败 (ID: ${item.id})，状态码 ${status} (${errorMessage})，将其从队列移除`);
          }
          if (item.id) await db.syncQueue.delete(item.id);
          continue; 
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
      'remainingAmount', // CREATE 时通常不允许，UPDATE 时部分允许，这里先移除，特定逻辑再处理
      'status', // 同上
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
        const response = await api.post(endpoint, createData, {
          headers: { 'X-Silent-Error': 'true' }
        });
        
        // 同步成功后，用服务器返回的真实数据更新本地数据库
        if (response.data && tempId) {
          const serverData = response.data;
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
          // Debt UPDATE 允许 remainingAmount 和 status
          if (data.remainingAmount !== undefined) updateData.remainingAmount = data.remainingAmount;
          if (data.status !== undefined) updateData.status = data.status;
        }

        // 默认使用 PUT，BUDGET 使用 PATCH
        const method = entity === 'BUDGET' ? 'patch' : 'put';
        await (api as any)[method](`${endpoint}/${entityId}`, updateData, {
          headers: { 'X-Silent-Error': 'true' }
        });
        break;
      }
      case 'DELETE':
        await api.delete(`${endpoint}/${entityId}`, {
          headers: { 'X-Silent-Error': 'true' },
          validateStatus: (status) => (status >= 200 && status < 300) || status === 404 || status === 403
        });
        break;
    }
  },

  /**
   * 从服务器同步最新的数据到本地缓存
   */
  async refreshLocalCache(): Promise<void> {
    if (!this.isOnline() || !this.isAuthenticated()) return;

    try {
      // 使用静默模式请求，避免初始化时的 401 报错干扰用户
      const config = { headers: { 'X-Silent-Error': 'true' } };

      // 同步账本
      const ledgersRes = await api.get('/ledgers', config);
      if (ledgersRes.data && Array.isArray(ledgersRes.data)) {
        await db.ledgers.bulkPut(ledgersRes.data);
      }

      // 同步交易记录 (简单起见，同步最近的，限制为 100 条以符合后端校验)
      const txRes = await api.get('/transactions?limit=100', config);
      if (txRes.data) {
        // 交易记录返回的是分页结构 { data: Transaction[], total: number, ... } 或者直接是数组
        const transactions = txRes.data.data || txRes.data;
        if (Array.isArray(transactions)) {
          await db.transactions.bulkPut(transactions);
        }
      }
      
      // 同步债务和预算
      const debtsRes = await api.get('/debts', config);
      if (debtsRes.data && Array.isArray(debtsRes.data)) {
        await db.debts.bulkPut(debtsRes.data);
      }
      
      const budgetsRes = await api.get('/budgets', config);
      if (budgetsRes.data && Array.isArray(budgetsRes.data)) {
        await db.budgets.bulkPut(budgetsRes.data);
      }

      // 同步分类
      const categoriesRes = await api.get('/categories', config);
      if (categoriesRes.data && Array.isArray(categoriesRes.data)) {
        await db.categories.bulkPut(categoriesRes.data);
      }
      
      console.log('[OfflineSync] 本地缓存已更新');
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
    for (const [key, group] of entityMap.entries()) {
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
