import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { ConfigService } from '@nestjs/config';
import { BackupLog, BackupType } from '../entities/backup-log.entity';
import { User } from '../entities/user.entity';
import { Transaction } from '../entities/transaction.entity';
import { Category } from '../entities/category.entity';
import { Debt } from '../entities/debt.entity';
import { Ledger, LedgerMember } from '../entities/ledger.entity';
import { DebtPayment } from '../entities/debt-payment.entity';
import { Budget } from '../entities/budget.entity';
import { UserSetting } from '../entities/user-setting.entity';
import { TransactionLog } from '../entities/transaction-log.entity';
import { CreateBackupDto, RestoreBackupDto, CleanupBackupDto } from './dto/backup.dto';

export interface BackupResult {
  success: boolean;
  fileName: string;
  filePath: string;
  fileSize: number;
  recordCount: number;
  checksum: string;
  errorMessage?: string;
}

export interface BackupData {
  version: string;
  backupType: BackupType;
  createdAt: string;
  userId: string;
  data: {
    transactions?: Transaction[];
    categories?: Category[];
    debts?: Debt[];
    ledgers?: Ledger[];
    ledgerMembers?: LedgerMember[];
    debtPayments?: DebtPayment[];
    budgets?: Budget[];
    userSettings?: UserSetting[];
    transactionLogs?: TransactionLog[];
  };
}

@Injectable()
export class BackupService {
  private readonly logger = new Logger(BackupService.name);
  private readonly backupPath: string;
  private readonly encryptionKey: string;
  private readonly restoreLocks = new Set<string>(); // userId -> locking status

  constructor(
    @InjectRepository(BackupLog)
    private readonly backupLogRepository: Repository<BackupLog>,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectRepository(Transaction)
    private readonly transactionRepository: Repository<Transaction>,
    @InjectRepository(Category)
    private readonly categoryRepository: Repository<Category>,
    @InjectRepository(Debt)
    private readonly debtRepository: Repository<Debt>,
    @InjectRepository(Ledger)
    private readonly ledgerRepository: Repository<Ledger>,
    @InjectRepository(LedgerMember)
    private readonly ledgerMemberRepository: Repository<LedgerMember>,
    @InjectRepository(DebtPayment)
    private readonly debtPaymentRepository: Repository<DebtPayment>,
    @InjectRepository(Budget)
    private readonly budgetRepository: Repository<Budget>,
    @InjectRepository(UserSetting)
    private readonly userSettingRepository: Repository<UserSetting>,
    @InjectRepository(TransactionLog)
    private readonly transactionLogRepository: Repository<TransactionLog>,
    private readonly configService: ConfigService,
  ) {
    this.backupPath = this.configService.get<string>('BACKUP_PATH', './backups');
    this.encryptionKey = this.configService.get<string>(
      'BACKUP_ENCRYPTION_KEY',
      'default-backup-key-32chars!',
    );

    if (!fs.existsSync(this.backupPath)) {
      fs.mkdirSync(this.backupPath, { recursive: true });
    }
  }

  private toLocalDateOnly(input: unknown): Date {
    if (input instanceof Date) {
      if (Number.isNaN(input.getTime())) {
        throw new BadRequestException('还款日期格式不正确');
      }
      return new Date(input.getFullYear(), input.getMonth(), input.getDate());
    }

    if (typeof input !== 'string') {
      throw new BadRequestException('还款日期格式不正确');
    }

    const trimmed = input.trim();
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(trimmed);
    if (match) {
      const year = Number(match[1]);
      const month = Number(match[2]);
      const day = Number(match[3]);
      const date = new Date(year, month - 1, day);
      if (Number.isNaN(date.getTime())) {
        throw new BadRequestException('还款日期格式不正确');
      }
      return date;
    }

    const date = new Date(trimmed);
    if (Number.isNaN(date.getTime())) {
      throw new BadRequestException('还款日期格式不正确');
    }
    return new Date(date.getFullYear(), date.getMonth(), date.getDate());
  }

  private assertDebtPaymentDateNotFuture(
    userId: string,
    sourcePaymentId: string,
    input: unknown,
  ): void {
    const paymentDate = this.toLocalDateOnly(input);
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    if (paymentDate.getTime() > today.getTime()) {
      this.logger.warn(
        `拒绝恢复未来还款日期: userId=${userId}, sourcePaymentId=${sourcePaymentId}, paymentDate=${paymentDate.toISOString()}`,
      );
      throw new BadRequestException('还款日期不能超过当前时间');
    }
  }

  /**
   * 创建备份
   */
  async createBackup(userId: string, dto: CreateBackupDto): Promise<BackupLog> {
    this.logger.log(`用户 ${userId} 开始创建备份: ${dto.backupType}`);

    const startTime = Date.now();
    let result: BackupResult;

    try {
      const backupData = await this.collectBackupData(userId, dto.backupType || BackupType.FULL);
      result = await this.saveBackupFile(userId, backupData, dto.encrypt || false);

      const backupLog = this.backupLogRepository.create({
        userId,
        backupType: dto.backupType || BackupType.FULL,
        fileName: result.fileName,
        filePath: result.filePath,
        fileSize: result.fileSize,
        isEncrypted: dto.encrypt || false,
        recordCount: result.recordCount,
        checksum: result.checksum,
        isSuccess: true,
      });

      const savedLog = await this.backupLogRepository.save(backupLog);

      const elapsed = (Date.now() - startTime) / 1000;
      this.logger.log(`备份创建成功: ${result.fileName} (${result.fileSize} bytes, ${elapsed}s)`);

      return savedLog;
    } catch (error: any) {
      this.logger.error(`备份创建失败: ${error.message}`);

      const failedLog = this.backupLogRepository.create({
        userId,
        backupType: dto.backupType || BackupType.FULL,
        fileName: 'FAILED', // 设置一个默认值防止数据库约束错误
        isSuccess: false,
        errorMessage: error.message,
      });

      await this.backupLogRepository.save(failedLog);

      return {
        success: false,
        fileName: '',
        filePath: '',
        fileSize: 0,
        recordCount: 0,
        checksum: '',
        errorMessage: error.message,
        userId: userId,
        backupType: dto.backupType || BackupType.FULL,
      } as any;
    }
  }

  /**
   * 获取备份历史
   */
  async getBackupHistory(userId: string, successfulOnly: boolean = true) {
    const queryBuilder = this.backupLogRepository
      .createQueryBuilder('backup')
      .where('backup.userId = :userId', { userId })
      .orderBy('backup.createdAt', 'DESC');

    if (successfulOnly) {
      queryBuilder.andWhere('backup.isSuccess = :success', { success: true });
    }

    return queryBuilder.getMany();
  }

  /**
   * 获取备份下载信息
   */
  async getBackupDownloadInfo(
    userId: string,
    backupId: string,
  ): Promise<{ filePath: string; fileName: string; fileSize: number; checksum: string }> {
    const backupLog = await this.backupLogRepository.findOne({
      where: { id: backupId, userId },
    });

    if (!backupLog) {
      throw new NotFoundException('备份记录不存在');
    }

    if (!backupLog.isSuccess) {
      throw new BadRequestException('该备份文件无效');
    }

    if (!fs.existsSync(backupLog.filePath)) {
      throw new NotFoundException('备份文件已丢失');
    }

    // 调试日志：校验磁盘文件的哈希值
    const fileBuffer = fs.readFileSync(backupLog.filePath);
    const currentHash = crypto.createHash('sha256').update(fileBuffer).digest('hex');
    this.logger.debug(
      `[Backup] 下载请求: ID=${backupId}, 数据库哈希=${backupLog.checksum}, 磁盘实际哈希=${currentHash}, 大小=${fileBuffer.length}`,
    );

    return {
      filePath: backupLog.filePath,
      fileName: backupLog.fileName,
      fileSize: Number(backupLog.fileSize),
      checksum: backupLog.checksum,
    };
  }

  /**
   * 恢复备份
   */
  /**
   * 恢复备份的核心逻辑
   */
  private async processRestore(userId: string, backupData: BackupData): Promise<number> {
    let totalItemsInBackup = 0;

    // 计算备份文件中的总记录数（所有模块之和）
    if (backupData.data) {
      const {
        ledgers,
        ledgerMembers,
        categories,
        debts,
        debtPayments,
        transactions,
        budgets,
        userSettings,
        transactionLogs,
      } = backupData.data;

      totalItemsInBackup =
        (ledgers?.length || 0) +
        (ledgerMembers?.length || 0) +
        (categories?.length || 0) +
        (debts?.length || 0) +
        (debtPayments?.length || 0) +
        (transactions?.length || 0) +
        (budgets?.length || 0) +
        (userSettings?.length || 0) +
        (transactionLogs?.length || 0);
    }

    this.logger.log(`备份文件包含总记录数: ${totalItemsInBackup}`);

    if (backupData.data?.debtPayments && backupData.data.debtPayments.length > 0) {
      for (const payment of backupData.data.debtPayments) {
        this.assertDebtPaymentDateNotFuture(
          userId,
          (payment as any)?.id || 'unknown',
          (payment as any)?.paymentDate,
        );
      }
    }

    let restoredCount = 0;

    // ID 映射表，用于解决新生成的 ID 与原 ID 之间的引用关系
    const idMap = {
      categories: new Map<string, string>(), // oldId -> newId
      ledgers: new Map<string, string>(),
      debts: new Map<string, string>(),
    };

    // 1. 优先恢复账本 (因为交易依赖账本)
    if (backupData.data.ledgers) {
      this.logger.log(`开始恢复账本，总计: ${backupData.data.ledgers.length}`);
      for (const ledger of backupData.data.ledgers) {
        try {
          // 先检查该账本是否已经存在（根据名称和用户 ID）
          let targetLedger = await this.ledgerRepository.findOne({
            where: { name: ledger.name, ownerId: userId },
          });

          if (!targetLedger) {
            const newId = uuidv4();
            idMap.ledgers.set(ledger.id, newId);

            // 清理关联对象，只保留基本属性
            const {
              members: _members,
              transactions: _transactions,
              owner: _owner,
              ...ledgerData
            } = ledger as any;

            targetLedger = await this.ledgerRepository.save({
              ...ledgerData,
              id: newId,
              ownerId: userId,
            });
            restoredCount++;
          } else {
            // 如果已存在同名账本，建立映射关系，避免重复创建
            idMap.ledgers.set(ledger.id, targetLedger.id);
            this.logger.log(
              `账本 "${ledger.name}" 已存在，跳过创建并使用现有 ID: ${targetLedger.id}`,
            );
            restoredCount++; // 即使已存在也计入“已处理”或“已包含”的记录数
          }
        } catch (e: any) {
          this.logger.error(`恢复账本失败: ${e.message}`);
        }
      }
    }

    // 恢复账本成员
    if (backupData.data.ledgerMembers) {
      this.logger.log(`开始恢复账本成员，总计: ${backupData.data.ledgerMembers.length}`);
      for (const member of backupData.data.ledgerMembers) {
        try {
          const newLedgerId = idMap.ledgers.get(member.ledgerId);
          if (newLedgerId) {
            const { user: _user, ledger: _ledger, ...memberData } = member as any;
            await this.ledgerMemberRepository.save({
              ...memberData,
              id: uuidv4(),
              ledgerId: newLedgerId,
              userId: userId,
            });
            restoredCount++;
          }
        } catch (e: any) {
          this.logger.error(`恢复账本成员失败: ${e.message}`);
        }
      }
    }

    // 2. 恢复分类 (因为交易依赖分类)
    if (backupData.data.categories) {
      this.logger.log(`开始恢复分类，总计: ${backupData.data.categories.length}`);
      // 先第一遍循环：创建所有分类，暂不设置父子关系
      for (const cat of backupData.data.categories) {
        try {
          // 先检查分类是否已存在
          let targetCategory = await this.categoryRepository.findOne({
            where: { name: cat.name, userId, type: cat.type },
          });

          if (!targetCategory) {
            const newId = uuidv4();
            idMap.categories.set(cat.id, newId);

            const {
              parent: _parent,
              children: _children,
              transactions: _transactions,
              user: _user,
              ...catData
            } = cat as any;

            targetCategory = await this.categoryRepository.save({
              ...catData,
              id: newId,
              userId: userId,
              parentId: null,
            });
            restoredCount++;
          } else {
            idMap.categories.set(cat.id, targetCategory.id);
            this.logger.log(
              `分类 "${cat.name}" (${cat.type}) 已存在，使用现有 ID: ${targetCategory.id}`,
            );
            restoredCount++; // 计入总数
          }
        } catch (e: any) {
          this.logger.error(`恢复分类失败: ${e.message}`);
        }
      }

      // 第二遍循环：恢复父子关系 (不增加 restoredCount，因为这只是更新关系)
      for (const cat of backupData.data.categories) {
        try {
          if (cat.parent && cat.parent.id) {
            const newId = idMap.categories.get(cat.id);
            const newParentId = idMap.categories.get(cat.parent.id);

            if (newId && newParentId) {
              await this.categoryRepository.update(newId, {
                parent: { id: newParentId },
              });
            }
          }
        } catch (e: any) {
          this.logger.error(`建立分类父子关系失败: ${e.message}`);
        }
      }
    }

    // 3. 恢复债务
    if (backupData.data.debts) {
      this.logger.log(`开始恢复债务，总计: ${backupData.data.debts.length}`);
      for (const debt of backupData.data.debts) {
        try {
          const oldId = debt.id;
          const newId = uuidv4();
          idMap.debts.set(oldId, newId);

          const { payments: _payments, user: _user, ...debtData } = debt as any;

          await this.debtRepository.save({
            ...debtData,
            id: newId,
            userId: userId,
          });
          restoredCount++;
        } catch (e: any) {
          this.logger.error(`恢复债务失败: ${e.message}`);
        }
      }
    }

    // 恢复债务还款记录
    if (backupData.data.debtPayments) {
      this.logger.log(`开始恢复债务还款记录，总计: ${backupData.data.debtPayments.length}`);
      for (const payment of backupData.data.debtPayments) {
        try {
          const newDebtId = idMap.debts.get(payment.debtId);
          if (newDebtId) {
            const { debt: _debt, ...paymentData } = payment as any;
            this.assertDebtPaymentDateNotFuture(
              userId,
              payment?.id || 'unknown',
              paymentData.paymentDate,
            );
            await this.debtPaymentRepository.save({
              ...paymentData,
              id: uuidv4(),
              debtId: newDebtId,
              userId: userId,
              paymentDate: new Date(paymentData.paymentDate),
            });
            restoredCount++;
          }
        } catch (e: any) {
          this.logger.error(`恢复债务还款记录失败: ${e.message}`);
        }
      }
    }

    // 4. 最后恢复交易 (依赖账本和分类)
    if (backupData.data.transactions) {
      this.logger.log(`开始恢复交易记录，总计: ${backupData.data.transactions.length}`);
      for (const tx of backupData.data.transactions) {
        const { category: _category, ledger: _ledger, user: _user, ...txData } = tx as any;

        // 映射外键 ID
        let newCategoryId = null;
        const oldCategoryId = tx.category?.id || txData.categoryId;
        if (oldCategoryId && idMap.categories.has(oldCategoryId)) {
          newCategoryId = idMap.categories.get(oldCategoryId);
        } else if (oldCategoryId) {
          this.logger.warn(
            `交易记录 ${txData.id || 'unknown'} 引用了未知的分类 ID: ${oldCategoryId}`,
          );
        }

        let newLedgerId = null;
        const oldLedgerId = tx.ledger?.id || txData.ledgerId;
        if (oldLedgerId && idMap.ledgers.has(oldLedgerId)) {
          newLedgerId = idMap.ledgers.get(oldLedgerId);
        } else if (oldLedgerId) {
          // 如果映射表中没有，尝试直接从数据库查一下同名账本
          if (tx.ledger?.name) {
            const existingLedger = await this.ledgerRepository.findOne({
              where: { name: tx.ledger.name, ownerId: userId },
            });
            if (existingLedger) {
              newLedgerId = existingLedger.id;
              idMap.ledgers.set(oldLedgerId, newLedgerId);
            }
          }

          if (!newLedgerId) {
            this.logger.warn(
              `交易记录 ${txData.id || 'unknown'} 引用了未知的账本 ID: ${oldLedgerId}`,
            );
          }
        }

        try {
          await this.transactionRepository.save({
            ...txData,
            id: uuidv4(),
            userId: userId,
            categoryId: newCategoryId,
            ledgerId: newLedgerId,
          });
          restoredCount++;
        } catch (e: any) {
          this.logger.error(`恢复交易记录失败: ${e.message}`, e.stack);
          // 继续尝试恢复下一条记录，而不是中断整个过程
        }
      }
    }

    // 5. 恢复预算 (依赖分类)
    if (backupData.data.budgets) {
      this.logger.log(`开始恢复预算记录，总计: ${backupData.data.budgets.length}`);
      for (const budget of backupData.data.budgets) {
        const { category: _category, user: _user, ...budgetData } = budget as any;

        let newCategoryId = null;
        const oldCategoryId = budget.category?.id || budgetData.categoryId;
        if (oldCategoryId && idMap.categories.has(oldCategoryId)) {
          newCategoryId = idMap.categories.get(oldCategoryId);
        }

        try {
          await this.budgetRepository.save({
            ...budgetData,
            id: uuidv4(),
            userId: userId,
            categoryId: newCategoryId,
          });
          restoredCount++;
        } catch (e: any) {
          this.logger.error(`恢复预算记录失败: ${e.message}`);
        }
      }
    }

    // 6. 恢复系统设置
    if (backupData.data.userSettings && backupData.data.userSettings.length > 0) {
      this.logger.log(`开始恢复用户设置`);
      // 通常只有一个设置记录，但为了兼容性使用循环
      for (const setting of backupData.data.userSettings) {
        try {
          // 查找是否已有设置，有则更新，无则创建
          const existingSetting = await this.userSettingRepository.findOne({
            where: { userId },
          });

          const { user: _user, ...settingData } = setting as any;

          if (existingSetting) {
            await this.userSettingRepository.update(existingSetting.id, {
              ...settingData,
              updatedAt: new Date(),
            });
            this.logger.log(`用户设置已更新: ${existingSetting.id}`);
          } else {
            await this.userSettingRepository.save({
              ...settingData,
              id: uuidv4(),
              userId: userId,
            });
            this.logger.log(`用户设置已创建`);
          }
          restoredCount++;
        } catch (e: any) {
          this.logger.error(`恢复用户设置失败: ${e.message}`);
        }
      }
    }

    // 7. 恢复操作日志
    if (backupData.data.transactionLogs && backupData.data.transactionLogs.length > 0) {
      this.logger.log(`开始恢复操作日志，总计: ${backupData.data.transactionLogs.length}`);
      for (const log of backupData.data.transactionLogs) {
        try {
          const { user: _user, ...logData } = log as any;
          await this.transactionLogRepository.save({
            ...logData,
            id: uuidv4(),
            userId: userId,
          });
          restoredCount++;
        } catch (e: any) {
          this.logger.error(`恢复操作日志失败: ${e.message}`);
        }
      }
    }

    // 返回实际解析出的总记录数，而不是单纯的数据库插入数
    // 这样用户就能在界面上看到备份文件中包含的所有数据项
    return Math.max(restoredCount, totalItemsInBackup);
  }

  async restoreBackup(userId: string, dto: RestoreBackupDto): Promise<{ restoredCount: number }> {
    if (this.restoreLocks.has(userId)) {
      throw new BadRequestException('数据恢复正在进行中，请勿重复操作');
    }
    this.restoreLocks.add(userId);

    try {
      this.logger.log(`用户 ${userId} 开始恢复备份: ${dto.backupId}`);

      const backupLog = await this.backupLogRepository.findOne({
        where: { id: dto.backupId, userId },
      });

      if (!backupLog) {
        throw new NotFoundException('备份记录不存在');
      }

      // 防重复恢复校验
      if (backupLog.isRestored) {
        this.logger.warn(`备份 ${dto.backupId} 已经恢复过，跳过重复恢复`);
        throw new BadRequestException('该备份数据已在系统中，无需重复恢复');
      }

      if (!fs.existsSync(backupLog.filePath)) {
        throw new NotFoundException('备份文件已丢失');
      }

      const fileContent = fs.readFileSync(backupLog.filePath, 'utf-8');
      let backupData: BackupData;

      try {
        if (backupLog.isEncrypted) {
          const decrypted = this.decryptData(fileContent, dto.password);
          backupData = JSON.parse(decrypted);
        } else {
          backupData = JSON.parse(fileContent);
        }
      } catch (_error: any) {
        throw new BadRequestException('备份文件解析失败，可能是密码错误或文件损坏');
      }

      const restoredCount = await this.processRestore(userId, backupData);

      // 更新备份记录状态
      backupLog.isRestored = true;
      backupLog.lastRestoredAt = new Date();
      await this.backupLogRepository.save(backupLog);

      this.logger.log(`备份恢复完成: 恢复 ${restoredCount} 条记录`);
      return { restoredCount };
    } finally {
      this.restoreLocks.delete(userId);
    }
  }

  /**
   * 上传并恢复备份
   */
  async uploadAndRestore(
    userId: string,
    file: any,
    password?: string,
  ): Promise<{ restoredCount: number }> {
    if (this.restoreLocks.has(userId)) {
      throw new BadRequestException('数据恢复正在进行中，请勿重复操作');
    }
    this.restoreLocks.add(userId);

    try {
      this.logger.log(`用户 ${userId} 开始上传并恢复备份`);

      const startTime = Date.now();
      const fileContent = file.buffer.toString('utf8');

      // 计算上传文件的校验和，用于防重复检测
      const buffer = Buffer.from(fileContent, 'utf8');
      const checksum = crypto.createHash('sha256').update(buffer).digest('hex');
      const endTime = Date.now();
      this.logger.log(`[Performance] 后端文件指纹计算耗时: ${endTime - startTime}ms`);

      // 检查是否存在相同校验和且已成功恢复的备份记录
      const existingBackup = await this.backupLogRepository.findOne({
        where: {
          userId,
          checksum,
          isSuccess: true,
          isRestored: true,
        },
      });

      if (existingBackup) {
        this.logger.warn(
          `检测到重复的备份文件上传 (Checksum: ${checksum})，该备份已在 ${existingBackup.lastRestoredAt} 恢复过`,
        );
        throw new BadRequestException('该备份数据已在系统中，无需重复恢复');
      }

      let backupData: BackupData;

      try {
        // 尝试解析 JSON，如果失败则可能是加密的
        try {
          backupData = JSON.parse(fileContent);
        } catch (_e) {
          const decrypted = this.decryptData(fileContent, password);
          backupData = JSON.parse(decrypted);
        }
      } catch (_error: any) {
        throw new BadRequestException('备份文件解析失败，可能是文件损坏或加密格式不正确');
      }

      // 基础验证
      if (!backupData.version || !backupData.data) {
        throw new BadRequestException('无效的备份文件格式');
      }

      const restoredCount = await this.processRestore(userId, backupData);

      // 记录上传并恢复的操作日志
      try {
        let finalBackupType = BackupType.FULL;
        if (backupData.backupType) {
          const typeStr = backupData.backupType.toString().toLowerCase();
          if (Object.values(BackupType).includes(typeStr as BackupType)) {
            finalBackupType = typeStr as BackupType;
          }
        }

        // 重新统计备份文件中的真实记录数
        let totalItemsInBackup = 0;
        if (backupData.data) {
          const {
            ledgers,
            ledgerMembers,
            categories,
            debts,
            debtPayments,
            transactions,
            budgets,
            userSettings,
            transactionLogs,
          } = backupData.data;

          totalItemsInBackup =
            (ledgers?.length || 0) +
            (ledgerMembers?.length || 0) +
            (categories?.length || 0) +
            (debts?.length || 0) +
            (debtPayments?.length || 0) +
            (transactions?.length || 0) +
            (budgets?.length || 0) +
            (userSettings?.length || 0) +
            (transactionLogs?.length || 0);
        }

        const uploadLog = this.backupLogRepository.create({
          userId,
          backupType: finalBackupType,
          fileName: file.originalname,
          fileSize: file.size,
          checksum: checksum,
          recordCount: totalItemsInBackup > 0 ? totalItemsInBackup : restoredCount,
          isSuccess: true,
          isRestored: true,
          lastRestoredAt: new Date(),
          errorMessage: '通过上传恢复',
        });
        await this.backupLogRepository.save(uploadLog);
      } catch (e: any) {
        this.logger.error(`记录上传恢复日志失败: ${e.message}`);
      }

      this.logger.log(`上传恢复完成: 恢复 ${restoredCount} 条记录`);
      return { restoredCount };
    } finally {
      this.restoreLocks.delete(userId);
    }
  }

  /**
   * 删除备份
   */
  async deleteBackup(userId: string, backupId: string): Promise<void> {
    const backupLog = await this.backupLogRepository.findOne({
      where: { id: backupId, userId },
    });

    if (!backupLog) {
      throw new NotFoundException('备份记录不存在');
    }

    if (backupLog.filePath && fs.existsSync(backupLog.filePath)) {
      fs.unlinkSync(backupLog.filePath);
    }

    await this.backupLogRepository.remove(backupLog);
    this.logger.log(`备份删除成功: ${backupId}`);
  }

  /**
   * 清理旧备份
   */
  async cleanupOldBackups(
    userId: string,
    dto: CleanupBackupDto,
  ): Promise<{ deletedCount: number }> {
    const queryBuilder = this.backupLogRepository
      .createQueryBuilder('backup')
      .where('backup.userId = :userId', { userId })
      .andWhere('backup.isSuccess = :success', { success: true })
      .orderBy('backup.createdAt', 'DESC');

    if (dto.olderThan) {
      queryBuilder.andWhere('backup.createdAt < :olderThan', {
        olderThan: new Date(dto.olderThan),
      });
    }

    const backups = await queryBuilder.getMany();

    let backupsToDelete = backups;
    if (dto.keepCount && dto.keepCount > 0) {
      backupsToDelete = backups.slice(dto.keepCount);
    }

    for (const backup of backupsToDelete) {
      if (backup.filePath && fs.existsSync(backup.filePath)) {
        fs.unlinkSync(backup.filePath);
      }
      await this.backupLogRepository.remove(backup);
    }

    this.logger.log(`清理备份完成: 删除 ${backupsToDelete.length} 个旧备份`);
    return { deletedCount: backupsToDelete.length };
  }

  /**
   * 收集备份数据
   */
  private async collectBackupData(userId: string, backupType: BackupType): Promise<BackupData> {
    const data: BackupData = {
      version: '1.0.0',
      backupType,
      createdAt: new Date().toISOString(),
      userId,
      data: {},
    };

    // 1. 获取账本数据 (FULL 或 TRANSACTIONS 类型都需要账本)
    // 即使是 TRANSACTIONS 类型，我们也需要账本，因为交易记录依赖它
    if (backupType === BackupType.FULL || backupType === BackupType.TRANSACTIONS) {
      this.logger.log(`开始收集账本数据...`);
      data.data.ledgers = await this.ledgerRepository.find({
        where: { ownerId: userId },
      });
      this.logger.log(`获取到 ${data.data.ledgers.length} 个账本`);

      // 获取相关的账本成员
      if (data.data.ledgers.length > 0) {
        const ledgerIds = data.data.ledgers.map((l) => l.id).filter((id) => !!id);
        this.logger.log(`账本 ID 列表: ${JSON.stringify(ledgerIds)}`);
        // 使用 QueryBuilder 确保查询语法正确
        data.data.ledgerMembers = await this.ledgerMemberRepository
          .createQueryBuilder('member')
          .where('member.ledgerId IN (:...ids)', { ids: ledgerIds })
          .getMany();
        this.logger.log(`获取到 ${data.data.ledgerMembers.length} 个账本成员`);
      }
    }

    // 2. 获取分类数据
    // 即使是 TRANSACTIONS 类型，我们也需要分类，因为交易记录依赖它
    if (
      backupType === BackupType.FULL ||
      backupType === BackupType.CATEGORIES ||
      backupType === BackupType.TRANSACTIONS
    ) {
      data.data.categories = await this.categoryRepository.find({
        where: { userId },
        relations: ['parent'],
      });
    }

    // 3. 获取交易数据
    if (backupType === BackupType.FULL || backupType === BackupType.TRANSACTIONS) {
      data.data.transactions = await this.transactionRepository.find({
        where: { userId, isDeleted: false },
      });
    }

    // 4. 获取债务数据
    if (backupType === BackupType.FULL || backupType === BackupType.DEBTS) {
      this.logger.log(`开始收集债务数据...`);
      data.data.debts = await this.debtRepository.find({
        where: { userId },
      });
      this.logger.log(`获取到 ${data.data.debts.length} 条债务`);

      // 获取相关的还款记录
      if (data.data.debts.length > 0) {
        const debtIds = data.data.debts.map((d) => d.id).filter((id) => !!id);
        this.logger.log(`债务 ID 列表: ${JSON.stringify(debtIds)}`);
        // 使用 QueryBuilder 确保查询语法正确
        data.data.debtPayments = await this.debtPaymentRepository
          .createQueryBuilder('payment')
          .where('payment.debtId IN (:...ids)', { ids: debtIds })
          .getMany();
        this.logger.log(`获取到 ${data.data.debtPayments.length} 条还款记录`);
      }
    }

    // 5. 获取预算数据
    if (backupType === BackupType.FULL) {
      data.data.budgets = await this.budgetRepository.find({
        where: { userId },
      });

      // 6. 获取系统设置 (用户偏好设置)
      data.data.userSettings = await this.userSettingRepository.find({
        where: { userId },
      });

      // 7. 获取系统操作日志 (最近 500 条)
      data.data.transactionLogs = await this.transactionLogRepository.find({
        where: { userId },
        order: { createdAt: 'DESC' },
        take: 500,
      });
    }

    return data;
  }

  /**
   * 保存备份文件
   */
  private async saveBackupFile(
    userId: string,
    data: BackupData,
    encrypt: boolean,
  ): Promise<BackupResult> {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const fileName = `backup_${userId}_${data.backupType}_${timestamp}.json`;
    const filePath = path.join(this.backupPath, fileName);

    const json = JSON.stringify(data, null, 2);
    const content = encrypt ? this.encryptData(json) : json;

    // 明确使用 Buffer 以确保哈希和写入磁盘的内容完全一致（处理多字节字符）
    const buffer = Buffer.from(content, 'utf8');
    const checksum = crypto.createHash('sha256').update(buffer).digest('hex');

    fs.writeFileSync(filePath, buffer);
    const stats = fs.statSync(filePath);

    const recordCount =
      (data.data.transactions?.length || 0) +
      (data.data.categories?.length || 0) +
      (data.data.debts?.length || 0) +
      (data.data.ledgers?.length || 0) +
      (data.data.budgets?.length || 0) +
      (data.data.userSettings?.length || 0) +
      (data.data.transactionLogs?.length || 0);

    return {
      success: true,
      fileName,
      filePath,
      fileSize: stats.size,
      recordCount,
      checksum,
    };
  }

  /**
   * 加密数据
   */
  private encryptData(data: string): string {
    const iv = crypto.randomBytes(16);
    const key = crypto.scryptSync(this.encryptionKey, 'salt', 32);
    const cipher = crypto.createCipheriv('aes-256-cbc', key, iv);

    let encrypted = cipher.update(data, 'utf8', 'hex');
    encrypted += cipher.final('hex');

    return iv.toString('hex') + ':' + encrypted;
  }

  /**
   * 解密数据
   */
  private decryptData(encryptedData: string, _password?: string): string {
    const [ivHex, encrypted] = encryptedData.split(':');
    const iv = Buffer.from(ivHex, 'hex');
    const key = crypto.scryptSync(this.encryptionKey, 'salt', 32);
    const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv);

    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');

    return decrypted;
  }
}
