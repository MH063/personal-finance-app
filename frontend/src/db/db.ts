import Dexie, { Table } from 'dexie';
import type { Transaction } from '../services/transactionService';
import type { Ledger } from '../services/ledgerService';
import type { Category } from '../services/categoryService';

/**
 * 同步队列项接口
 */
export interface SyncQueueItem {
  id?: number;
  action: 'CREATE' | 'UPDATE' | 'DELETE';
  entity: 'TRANSACTION' | 'LEDGER' | 'CATEGORY' | 'DEBT' | 'BUDGET';
  entityId: string;
  data: any;
  timestamp: number;
}

/**
 * 离线数据库类
 * 使用 Dexie.js (IndexedDB 封装) 实现本地持久化存储
 */
export class OfflineDB extends Dexie {
  transactions!: Table<Transaction>;
  ledgers!: Table<Ledger>;
  categories!: Table<Category>;
  debts!: Table<any>;
  budgets!: Table<any>;
  syncQueue!: Table<SyncQueueItem>;

  constructor() {
    super('PersonalFinanceDB');
    
    // 定义数据库版本和架构
    this.version(4).stores({
      transactions: 'id, type, categoryId, ledgerId, transactionDate',
      ledgers: 'id, name, type, ownerId',
      categories: 'id, name, type',
      debts: 'id, type, status',
      budgets: 'id, categoryId, status',
      syncQueue: '++id, action, entity, entityId, timestamp, [entity+entityId+action]'
    });
  }

  /**
   * 清除所有本地数据
   */
  async clearAll() {
    await this.transactions.clear();
    await this.ledgers.clear();
    await this.categories.clear();
    await this.debts.clear();
    await this.budgets.clear();
    await this.syncQueue.clear();
  }
}

export const db = new OfflineDB();
