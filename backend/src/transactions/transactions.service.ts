import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import {
  Repository,
  Between,
  In,
  Not,
  OptimisticLockVersionMismatchError,
  Raw,
  FindOptionsWhere,
  ArrayContains,
} from 'typeorm';
import { Transaction, TransactionType, PaymentMethod } from '../entities/transaction.entity';
import { Category } from '../entities/category.entity';
import { Ledger, LedgerMember } from '../entities/ledger.entity';
import { TransactionLog, LogAction, EntityType } from '../entities/transaction-log.entity';
import { LedgerGateway } from '../ledgers/ledger.gateway';
import Redis from 'ioredis';
import { Inject } from '@nestjs/common';
import { StatisticsService } from '../statistics/statistics.service';
import {
  CreateTransactionDto,
  UpdateTransactionDto,
  TransactionQueryDto,
  BatchDeleteDto,
  BatchUpdateCategoryDto,
  BatchCreateTransactionDto,
} from './dto/transaction.dto';

export interface PaginationResult<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

@Injectable()
export class TransactionsService {
  private readonly logger = new Logger(TransactionsService.name);

  constructor(
    @InjectRepository(Transaction)
    private readonly transactionRepository: Repository<Transaction>,
    @InjectRepository(Category)
    private readonly categoryRepository: Repository<Category>,
    @InjectRepository(Ledger)
    private readonly ledgerRepository: Repository<Ledger>,
    @InjectRepository(LedgerMember)
    private readonly ledgerMemberRepository: Repository<LedgerMember>,
    @InjectRepository(TransactionLog)
    private readonly logRepository: Repository<TransactionLog>,
    private readonly ledgerGateway: LedgerGateway,
    private readonly statisticsService: StatisticsService,
    @Inject('REDIS_CLIENT')
    private readonly redis: Redis,
  ) {}

  /**
   * 验证分类与交易类型是否匹配
   */
  private async validateCategory(
    userId: string,
    categoryId: string,
    transactionType: TransactionType,
  ): Promise<Category> {
    const category = await this.categoryRepository.findOne({
      where: { id: categoryId, userId },
    });

    if (!category) {
      throw new NotFoundException('分类不存在');
    }

    if (category.type.toString() !== transactionType.toString()) {
      throw new BadRequestException('分类类型与交易类型不匹配');
    }

    return category;
  }

  /**
   * 解析用于创建交易的账本ID（严格验证）
   * 显式传入则校验成员权限；未传入时：
   * - 若用户无任何账本成员关系，抛出错误提示“请先创建账本再添加记录”
   * - 若用户存在多个账本成员关系，抛出选择提示错误，包含可选账本列表
   * - 若仅有一个账本成员关系，返回该账本ID
   */
  private async resolveLedgerIdForCreate(userId: string, ledgerId?: string): Promise<string> {
    if (ledgerId) {
      const membership = await this.ledgerMemberRepository.findOne({
        where: { ledgerId, userId },
      });
      if (!membership) {
        throw new ForbiddenException('您没有权限在该账本中创建交易');
      }
      return ledgerId;
    }

    const memberships = await this.ledgerMemberRepository.find({
      where: { userId },
    });
    const ledgerIds = memberships.map((m) => m.ledgerId);

    if (ledgerIds.length === 0) {
      this.logger.warn(`用户 ${userId} 无账本成员关系，拒绝创建交易`);
      await this.logRepository.save({
        action: LogAction.CREATE,
        entityType: EntityType.TRANSACTION,
        entityId: 'unknown',
        newData: { reason: 'NO_LEDGER', message: '请先创建账本再添加记录' },
        userId,
      });
      throw new BadRequestException('请先创建账本再添加记录');
    }

    if (ledgerIds.length > 1) {
      const ledgers = await this.ledgerRepository.find({
        where: { id: In(ledgerIds) },
        order: { createdAt: 'ASC' },
      });
      const options = ledgers.map((l) => ({ id: l.id, name: l.name, type: l.type }));
      this.logger.warn(`用户 ${userId} 关联多账本，需选择具体账本`);
      const err: any = new BadRequestException({
        message: '需要选择账本后再创建记录',
        code: 'LEDGER_SELECTION_REQUIRED',
        data: { ledgers: options },
      });
      throw err;
    }

    return ledgerIds[0];
  }

  /**
   * 创建交易记录
   */
  async create(userId: string, createDto: CreateTransactionDto): Promise<Transaction> {
    this.logger.log(`用户 ${userId} 创建交易记录: ${createDto.amount} ${createDto.type}`);

    // 基础必填校验：金额、日期已由 DTO 校验，这里补充类型特定的校验
    if (!createDto.paymentMethod) {
      throw new BadRequestException('支付方式为必填项');
    }
    const hasSubject =
      !!(createDto.merchant && createDto.merchant.trim().length > 0) ||
      !!(createDto.description && createDto.description.trim().length > 0);
    if (!hasSubject) {
      if (createDto.type === TransactionType.INCOME) {
        throw new BadRequestException('收入记录需填写收入来源（商户或备注其一）');
      } else if (createDto.type === TransactionType.EXPENSE) {
        throw new BadRequestException('支出记录需填写支出对象（商户或备注其一）');
      }
    }

    if (createDto.categoryId) {
      await this.validateCategory(userId, createDto.categoryId, createDto.type);
    }

    const ledgerId = await this.resolveLedgerIdForCreate(userId, createDto.ledgerId);

    const txRunner = this.transactionRepository.manager.connection.createQueryRunner();
    await txRunner.connect();
    await txRunner.startTransaction();
    try {
      const transaction = this.transactionRepository.create({
        ...createDto,
        userId,
        ledgerId,
        categoryId: createDto.categoryId || undefined,
        transactionDate: new Date(createDto.transactionDate),
      });

      const savedTransaction = await txRunner.manager.save(Transaction, transaction);

      await txRunner.manager.save(TransactionLog, {
        action: LogAction.CREATE,
        entityType: EntityType.TRANSACTION,
        entityId: savedTransaction.id,
        newData: this.sanitizeTransactionData(savedTransaction),
        userId,
      });

      await txRunner.commitTransaction();

      this.ledgerGateway.notifyUpdate(ledgerId, 'TRANSACTION_CREATED', savedTransaction, userId);
      this.logger.log(`交易记录创建成功: ${savedTransaction.id}`);
      this.invalidateStatistics(userId);
      return this.findOne(userId, savedTransaction.id);
    } catch (err) {
      await txRunner.rollbackTransaction();
      throw err;
    } finally {
      await txRunner.release();
    }
  }

  /**
   * 创建转账双记录（原子事务）
   * 将一次转账拆分为来源账本的支出与目标账本的收入两条记录，确保账本余额一致性
   * - 校验用户对两个账本的权限
   * - 使用数据库事务保证两条记录要么同时成功，要么同时回滚
   */
  async createTransferPair(
    userId: string,
    createDto: CreateTransactionDto,
  ): Promise<{ from: Transaction; to: Transaction }> {
    this.logger.log(
      `用户 ${userId} 创建转账双记录: 金额=${createDto.amount}, 来源账本=${createDto.ledgerId}, 目标账本=${createDto.toLedgerId}`,
    );
    if (!createDto.amount || createDto.amount <= 0) {
      throw new BadRequestException('转账金额必须大于0');
    }
    // 解析来源账本
    const fromLedgerId = await this.resolveLedgerIdForCreate(userId, createDto.ledgerId);
    // 解析目标账本，且必须与来源不同
    let toLedgerId: string | null = null;
    if (createDto.toLedgerId) {
      try {
        toLedgerId = await this.resolveLedgerIdForCreate(userId, createDto.toLedgerId);
      } catch {
        toLedgerId = null;
      }
    }
    if (!toLedgerId || toLedgerId === fromLedgerId) {
      // 从用户的账本成员列表中选择一个不同于来源的账本
      const memberships = await this.ledgerMemberRepository.find({ where: { userId } });
      const candidate = memberships.map((m) => m.ledgerId).find((id) => id !== fromLedgerId);
      if (!candidate) {
        throw new BadRequestException('没有可用的目标账本，请先创建或加入另一个账本');
      }
      toLedgerId = candidate;
    }
    const transferDate = new Date(createDto.transactionDate);
    const transferGroupId = (await import('uuid')).v4();
    const queryRunner = this.transactionRepository.manager.connection.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();
    try {
      // 来源：支出
      const fromTx = this.transactionRepository.create({
        amount: createDto.amount,
        type: TransactionType.EXPENSE,
        description: createDto.description,
        paymentMethod: createDto.paymentMethod,
        merchant: createDto.merchant,
        transactionDate: transferDate,
        tags: createDto.tags || [],
        reconciled: !!createDto.reconciled,
        isAdjustment: !!createDto.isAdjustment,
        isTransfer: true,
        toLedgerId: toLedgerId,
        metadata: {
          ...(createDto.metadata || {}),
          transferGroupId,
        },
        userId,
        ledgerId: fromLedgerId,
        categoryId: undefined,
      });
      const savedFrom = await queryRunner.manager.save(Transaction, fromTx);
      // 目标：收入
      const toTx = this.transactionRepository.create({
        amount: createDto.amount,
        type: TransactionType.INCOME,
        description: createDto.description,
        paymentMethod: createDto.paymentMethod,
        merchant: createDto.merchant,
        transactionDate: transferDate,
        tags: createDto.tags || [],
        reconciled: !!createDto.reconciled,
        isAdjustment: !!createDto.isAdjustment,
        isTransfer: true,
        toLedgerId: toLedgerId,
        metadata: {
          ...(createDto.metadata || {}),
          transferGroupId,
        },
        userId,
        ledgerId: toLedgerId,
        categoryId: undefined,
      });
      const savedTo = await queryRunner.manager.save(Transaction, toTx);
      await queryRunner.commitTransaction();
      // 通知两个账本
      this.ledgerGateway.notifyUpdate(fromLedgerId, 'TRANSACTION_CREATED', savedFrom, userId);
      this.ledgerGateway.notifyUpdate(toLedgerId, 'TRANSACTION_CREATED', savedTo, userId);
      // 记录日志
      await this.logRepository.save({
        action: LogAction.CREATE,
        entityType: EntityType.TRANSACTION,
        entityId: savedFrom.id,
        newData: this.sanitizeTransactionData(savedFrom),
        userId,
      });
      await this.logRepository.save({
        action: LogAction.CREATE,
        entityType: EntityType.TRANSACTION,
        entityId: savedTo.id,
        newData: this.sanitizeTransactionData(savedTo),
        userId,
      });
      // 缓存与版本处理
      this.invalidateStatistics(userId);
      // 返回包含关联的完整记录
      const fullFrom = await this.findOne(userId, savedFrom.id);
      const fullTo = await this.findOne(userId, savedTo.id);
      this.logger.log(
        `转账双记录创建成功: from=${fullFrom.id}(${fromLedgerId}) -> to=${fullTo.id}(${toLedgerId})`,
      );
      return { from: fullFrom, to: fullTo };
    } catch (err: any) {
      await queryRunner.rollbackTransaction();
      this.logger.error(`转账双记录创建失败: ${err?.message || err}`, err?.stack);
      throw err;
    } finally {
      await queryRunner.release();
    }
  }

  /**
   * 批量创建交易记录
   */
  async batchCreate(
    userId: string,
    dto: BatchCreateTransactionDto,
  ): Promise<{ createdCount: number }> {
    this.logger.log(`用户 ${userId} 批量创建交易记录: ${dto.transactions.length}条`);

    const createdTransactions: Transaction[] = [];

    let defaultLedgerId: string | null = null;
    try {
      defaultLedgerId = await this.resolveLedgerIdForCreate(userId);
    } catch (e: any) {
      const msg = e?.message || '';
      this.logger.warn(`批量创建校验账本失败: ${msg}`);
      return { createdCount: 0 };
    }

    for (const createDto of dto.transactions) {
      try {
        if (createDto.categoryId) {
          // 这里不做严格的 validateCategory 阻塞，防止一条失败导致全部失败。
          // 实际生产中可能需要缓存 category Map 来验证。
          // 暂时信任前端传来的 categoryId (或者如果报错会被 catch)
          // 还是加上验证比较好，但为了性能，我们可以先查出用户所有 Category
        }

        const ledgerId = createDto.ledgerId
          ? await this.resolveLedgerIdForCreate(userId, createDto.ledgerId).catch(() => {
              if (!defaultLedgerId) throw new BadRequestException('请先创建账本再添加记录');
              return defaultLedgerId;
            })
          : defaultLedgerId!;

        const transaction = this.transactionRepository.create({
          ...createDto,
          userId,
          ledgerId,
          categoryId: createDto.categoryId || undefined,
          transactionDate: new Date(createDto.transactionDate),
        });

        createdTransactions.push(transaction);
      } catch (err: any) {
        const message = err instanceof Error ? err.message : String(err);
        const stack = err instanceof Error ? err.stack : undefined;
        this.logger.error(`批量创建中单条预处理失败: ${message}`, stack);
      }
    }

    if (createdTransactions.length > 0) {
      const savedTransactions = await this.transactionRepository.save(createdTransactions);

      // 批量发送通知
      this.ledgerGateway.notifyUpdate(
        null,
        'TRANSACTION_BATCH_CREATED',
        { count: savedTransactions.length },
        userId,
      );

      // 批量记录日志
      await this.logRepository.save({
        action: LogAction.CREATE,
        entityType: EntityType.TRANSACTION,
        entityId: 'batch',
        newData: { count: savedTransactions.length },
        userId,
      });

      this.invalidateStatistics(userId);

      return { createdCount: savedTransactions.length };
    }

    return { createdCount: 0 };
  }

  /**
   * 获取交易记录列表（分页）
   */
  async findAll(
    userId: string,
    query: TransactionQueryDto,
  ): Promise<PaginationResult<Transaction>> {
    const {
      page = 1,
      limit = 20,
      startDate,
      endDate,
      type,
      categoryId,
      ledgerId,
      minAmount,
      maxAmount,
      paymentMethod,
      sortBy = 'transactionDate',
      sortOrder = 'desc',
      tag,
      reconciled,
      isAdjustment,
      isTransfer,
    } = query;

    const where: FindOptionsWhere<Transaction> = {};

    // 如果指定了账本 ID，先验证权限
    if (ledgerId) {
      const membership = await this.ledgerMemberRepository.findOne({
        where: { ledgerId, userId },
      });
      if (!membership) {
        throw new ForbiddenException('您没有权限查看该账本的交易');
      }
      where.ledgerId = ledgerId;
    } else {
      // 如果没指定账本，则返回用户作为成员的所有账本下的交易
      const memberships = await this.ledgerMemberRepository.find({
        where: { userId },
      });
      const ledgerIds = memberships.map((m) => m.ledgerId);
      if (ledgerIds.length > 0) {
        where.ledgerId = In(ledgerIds);
      } else {
        // 如果没有加入任何账本，则只能看自己的交易且没有账本的（理论上不会发生，因为注册时有默认账本）
        where.userId = userId;
      }
    }

    if (startDate && endDate) {
      where.transactionDate = Between(new Date(startDate), new Date(endDate));
    } else if (startDate) {
      where.transactionDate = Between(new Date(startDate), new Date('2099-12-31'));
    } else if (endDate) {
      where.transactionDate = Between(new Date('1970-01-01'), new Date(endDate));
    }

    if (type) {
      where.type = type;
    }

    if (categoryId) {
      where.categoryId = categoryId;
    }

    if (paymentMethod) {
      where.paymentMethod = paymentMethod;
    }

    if (tag) {
      where.tags = ArrayContains([tag]);
    }

    if (reconciled !== undefined) {
      where.reconciled = reconciled;
    }

    if (isAdjustment !== undefined) {
      where.isAdjustment = isAdjustment;
    }

    if (isTransfer !== undefined) {
      where.isTransfer = isTransfer;
    }

    if (minAmount !== undefined && maxAmount !== undefined) {
      where.amount = Between(minAmount, maxAmount);
    } else if (minAmount !== undefined) {
      where.amount = Between(minAmount, 1000000000);
    } else if (maxAmount !== undefined) {
      where.amount = Between(0, maxAmount);
    }

    const [data, total] = await this.transactionRepository.findAndCount({
      where,
      relations: ['category', 'ledger'],
      order: { [sortBy]: sortOrder },
      skip: (page - 1) * limit,
      take: limit,
    });

    return {
      data,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  /**
   * 获取单个交易记录
   */
  async findOne(userId: string, id: string): Promise<Transaction> {
    const transaction = await this.transactionRepository.findOne({
      where: { id },
      relations: ['category', 'ledger'],
    });

    if (!transaction) {
      throw new NotFoundException('交易记录不存在');
    }

    // 验证用户是否有权访问该交易（必须是该交易所在账本的成员）
    const membership = await this.ledgerMemberRepository.findOne({
      where: { ledgerId: transaction.ledgerId, userId },
    });

    if (!membership && transaction.userId !== userId) {
      throw new ForbiddenException('您没有权限查看此交易记录');
    }

    return transaction;
  }

  /**
   * 更新交易记录
   */
  async update(userId: string, id: string, updateDto: UpdateTransactionDto): Promise<Transaction> {
    this.logger.log(`用户 ${userId} 更新交易记录: ${id}`);

    const transaction = await this.findOne(userId, id);

    // 验证权限：只有交易创建者、账本所有者或账本管理员可以修改
    const membership = await this.ledgerMemberRepository.findOne({
      where: { ledgerId: transaction.ledgerId, userId },
    });

    const isOwnerOrAdmin = membership && ['owner', 'admin'].includes(membership.role);
    if (transaction.userId !== userId && !isOwnerOrAdmin) {
      throw new ForbiddenException('您没有权限修改此交易记录');
    }

    // 检查是否为债务关联交易，如果是，则禁止通过常规接口修改
    if (transaction.metadata?.isDebtLink) {
      throw new ForbiddenException('此交易关联至债务记录，请前往债务管理模块进行修改');
    }

    if (updateDto.categoryId) {
      await this.validateCategory(
        userId,
        updateDto.categoryId,
        updateDto.type || (transaction.type as TransactionType),
      );
    }

    // 如果尝试更改账本，验证权限
    if (updateDto.ledgerId && updateDto.ledgerId !== transaction.ledgerId) {
      const membership = await this.ledgerMemberRepository.findOne({
        where: { ledgerId: updateDto.ledgerId, userId },
      });
      if (!membership) {
        throw new ForbiddenException('您没有权限将交易移动到该账本');
      }
    }

    const oldData = { ...transaction };

    // 乐观锁校验
    if (updateDto.version !== undefined && transaction.version !== updateDto.version) {
      throw new OptimisticLockVersionMismatchError(
        'Transaction',
        updateDto.version,
        transaction.version,
      );
    }

    const changedFields: string[] = [];
    Object.keys(updateDto).forEach((key) => {
      if (
        key !== 'version' &&
        updateDto[key as keyof UpdateTransactionDto] !== undefined &&
        updateDto[key as keyof UpdateTransactionDto] !== (transaction as any)[key]
      ) {
        changedFields.push(key);
      }
    });

    // 移除 version，防止 Object.assign 覆盖实体中的 version，让 TypeORM 自动管理
    const updateData: Partial<UpdateTransactionDto> = { ...updateDto };
    delete (updateData as any).version;
    Object.assign(transaction, updateData);

    if (updateDto.transactionDate) {
      transaction.transactionDate = new Date(updateDto.transactionDate);
    }

    const updatedTransaction = await this.transactionRepository.save(transaction);

    // 发送实时更新通知
    this.ledgerGateway.notifyUpdate(
      transaction.ledgerId,
      'TRANSACTION_UPDATED',
      updatedTransaction,
      userId,
    );

    await this.logRepository.save({
      action: LogAction.UPDATE,
      entityType: EntityType.TRANSACTION,
      entityId: id,
      oldData: this.sanitizeTransactionData(oldData),
      newData: this.sanitizeTransactionData(transaction),
      changedFields,
      userId,
    });

    // 失效统计缓存，确保概览实时更新
    this.invalidateStatistics(userId);

    return this.findOne(userId, id);
  }

  /**
   * 删除交易记录（物理删除）
   */
  async remove(userId: string, id: string): Promise<void> {
    this.logger.log(`用户 ${userId} 删除交易记录: ${id}`);

    const transaction = await this.findOne(userId, id);

    // 验证权限：只有交易创建者、账本所有者或账本管理员可以删除
    const membership = await this.ledgerMemberRepository.findOne({
      where: { ledgerId: transaction.ledgerId, userId },
    });

    const isOwnerOrAdmin = membership && ['owner', 'admin'].includes(membership.role);
    if (transaction.userId !== userId && !isOwnerOrAdmin) {
      throw new ForbiddenException('您没有权限删除此交易记录');
    }

    // 检查是否为债务关联交易
    if (transaction.metadata?.isDebtLink) {
      throw new ForbiddenException('此交易关联至债务记录，请前往债务管理模块进行删除');
    }

    await this.transactionRepository.remove(transaction);

    // 发送实时更新通知
    this.ledgerGateway.notifyUpdate(transaction.ledgerId, 'TRANSACTION_DELETED', { id }, userId);

    await this.logRepository.save({
      action: LogAction.DELETE,
      entityType: EntityType.TRANSACTION,
      entityId: id,
      oldData: this.sanitizeTransactionData(transaction),
      userId,
    });

    this.logger.log(`交易记录删除成功: ${id}`);
    // 失效统计缓存，确保概览实时更新
    this.invalidateStatistics(userId);
  }

  /**
   * 批量删除交易记录
   */
  async batchRemove(userId: string, dto: BatchDeleteDto): Promise<{ deletedCount: number }> {
    this.logger.log(`用户 ${userId} 批量删除交易记录: ${dto.ids.length}条`);

    // 检查是否有受保护的债务关联交易
    const protectedCount = await this.transactionRepository.count({
      where: {
        id: In(dto.ids),
        userId,
        metadata: Raw((alias) => `${alias} @> :meta`, {
          meta: JSON.stringify({ isDebtLink: true }),
        }),
      },
    });

    if (protectedCount > 0) {
      throw new ForbiddenException(
        '选中的记录中包含债务关联交易，无法批量删除。请前往债务管理模块操作。',
      );
    }

    const result = await this.transactionRepository.delete({
      id: In(dto.ids),
      userId,
    });

    if (result.affected === 0) {
      throw new NotFoundException('未找到要删除的交易记录');
    }

    // 批量删除时，由于涉及多个可能的账本，我们简单触发一个全局更新或者针对该用户的更新
    this.ledgerGateway.notifyUpdate(null, 'TRANSACTION_BATCH_DELETED', { ids: dto.ids }, userId);

    await this.logRepository.save({
      action: LogAction.DELETE,
      entityType: EntityType.TRANSACTION,
      entityId: dto.ids.length === 1 ? dto.ids[0] : 'batch',
      oldData: { ids: dto.ids },
      userId,
    });

    // 失效统计缓存，确保概览实时更新
    this.invalidateStatistics(userId);
    return { deletedCount: result.affected || 0 };
  }

  /**
   * 批量更新分类
   */
  async batchUpdateCategory(
    userId: string,
    dto: BatchUpdateCategoryDto,
  ): Promise<{ updatedCount: number }> {
    this.logger.log(`用户 ${userId} 批量更新交易分类: ${dto.ids.length}条`);

    const category = await this.categoryRepository.findOne({
      where: { id: dto.categoryId, userId },
    });

    if (!category) {
      throw new NotFoundException('分类不存在');
    }

    // 检查是否有交易类型与新分类类型不匹配
    const incompatibleTransactions = await this.transactionRepository.count({
      where: {
        id: In(dto.ids),
        userId,
        type: Not(category.type as any),
      },
    });

    if (incompatibleTransactions > 0) {
      throw new BadRequestException('部分选中的交易类型与新分类不匹配');
    }

    const result = await this.transactionRepository.update(
      { id: In(dto.ids), userId },
      { categoryId: dto.categoryId },
    );

    // 触发更新通知
    this.ledgerGateway.notifyUpdate(
      null,
      'TRANSACTION_BATCH_UPDATED',
      { ids: dto.ids, categoryId: dto.categoryId },
      userId,
    );

    if (result.affected === 0) {
      throw new NotFoundException('未找到要更新的交易记录');
    }

    await this.logRepository.save({
      action: LogAction.UPDATE,
      entityType: EntityType.TRANSACTION,
      entityId: dto.ids.length === 1 ? dto.ids[0] : 'batch',
      newData: { categoryId: dto.categoryId, count: result.affected },
      changedFields: ['categoryId'],
      userId,
    });

    // 失效统计缓存，确保概览实时更新
    this.invalidateStatistics(userId);
    return { updatedCount: result.affected || 0 };
  }

  async updateLinkedDebtEntryTransaction(
    userId: string,
    debtId: string,
    patch: {
      amount?: number;
      description?: string;
      paymentMethod?: PaymentMethod;
      transactionDate?: string | Date;
    },
  ): Promise<{ updatedCount: number; ids: string[] }> {
    if (!debtId) return { updatedCount: 0, ids: [] };

    const where: any = { userId };
    where.metadata = Raw(
      (alias) => `${alias} @> :meta AND NOT (jsonb_exists(${alias}, 'paymentId'))`,
      { meta: JSON.stringify({ debtId }) },
    );

    const linkedTxs = await this.transactionRepository.find({ where });
    if (linkedTxs.length === 0) return { updatedCount: 0, ids: [] };

    const ids: string[] = [];

    for (const tx of linkedTxs) {
      const oldData = { ...(tx as any) };
      const changedFields: string[] = [];

      if (patch.amount !== undefined && Number(tx.amount) !== Number(patch.amount)) {
        (tx as any).amount = patch.amount as any;
        changedFields.push('amount');
      }

      if (patch.description !== undefined && (tx.description || '') !== patch.description) {
        tx.description = patch.description as any;
        changedFields.push('description');
      }

      if (patch.paymentMethod !== undefined && tx.paymentMethod !== patch.paymentMethod) {
        tx.paymentMethod = patch.paymentMethod as any;
        changedFields.push('paymentMethod');
      }

      if (patch.transactionDate !== undefined) {
        const nextDate = new Date(patch.transactionDate);
        if (!Number.isNaN(nextDate.getTime())) {
          const currentTime = tx.transactionDate ? new Date(tx.transactionDate).getTime() : 0;
          if (currentTime !== nextDate.getTime()) {
            tx.transactionDate = nextDate as any;
            changedFields.push('transactionDate');
          }
        }
      }

      if (changedFields.length === 0) continue;

      const saved = await this.transactionRepository.save(tx);
      ids.push(saved.id);

      this.ledgerGateway.notifyUpdate(tx.ledgerId, 'TRANSACTION_UPDATED', saved, userId);

      await this.logRepository.save({
        action: LogAction.UPDATE,
        entityType: EntityType.TRANSACTION,
        entityId: saved.id,
        oldData: this.sanitizeTransactionData(oldData as any),
        newData: this.sanitizeTransactionData(saved as any),
        changedFields,
        userId,
      });
    }

    // 失效统计缓存，确保概览实时更新
    if (ids.length > 0) {
      this.invalidateStatistics(userId);
    }
    if (ids.length > 0) {
      this.logger.log(
        `已更新债务关联交易: userId=${userId}, debtId=${debtId}, count=${ids.length}`,
      );
    }

    return { updatedCount: ids.length, ids };
  }

  async updateLinkedPaymentTransactions(
    userId: string,
    paymentId: string,
    patch: {
      amount?: number;
      description?: string;
      paymentMethod?: PaymentMethod;
      transactionDate?: string | Date;
    },
  ): Promise<{ updatedCount: number; ids: string[] }> {
    if (!paymentId) return { updatedCount: 0, ids: [] };

    const where: any = { userId };
    where.metadata = Raw((alias) => `${alias} @> :meta`, { meta: JSON.stringify({ paymentId }) });

    const linkedTxs = await this.transactionRepository.find({ where });
    if (linkedTxs.length === 0) return { updatedCount: 0, ids: [] };

    const ids: string[] = [];

    for (const tx of linkedTxs) {
      const oldData = { ...(tx as any) };
      const changedFields: string[] = [];

      if (patch.amount !== undefined && Number(tx.amount) !== Number(patch.amount)) {
        (tx as any).amount = patch.amount as any;
        changedFields.push('amount');
      }

      if (patch.description !== undefined && (tx.description || '') !== patch.description) {
        tx.description = patch.description as any;
        changedFields.push('description');
      }

      if (patch.paymentMethod !== undefined && tx.paymentMethod !== patch.paymentMethod) {
        tx.paymentMethod = patch.paymentMethod as any;
        changedFields.push('paymentMethod');
      }

      if (patch.transactionDate !== undefined) {
        const nextDate = new Date(patch.transactionDate);
        if (!Number.isNaN(nextDate.getTime())) {
          const currentTime = tx.transactionDate ? new Date(tx.transactionDate).getTime() : 0;
          if (currentTime !== nextDate.getTime()) {
            tx.transactionDate = nextDate as any;
            changedFields.push('transactionDate');
          }
        }
      }

      if (changedFields.length === 0) continue;

      const saved = await this.transactionRepository.save(tx);
      ids.push(saved.id);

      this.ledgerGateway.notifyUpdate(tx.ledgerId, 'TRANSACTION_UPDATED', saved, userId);

      await this.logRepository.save({
        action: LogAction.UPDATE,
        entityType: EntityType.TRANSACTION,
        entityId: saved.id,
        oldData: this.sanitizeTransactionData(oldData as any),
        newData: this.sanitizeTransactionData(saved as any),
        changedFields,
        userId,
      });
    }

    // 失效统计缓存，确保概览实时更新
    if (ids.length > 0) {
      this.invalidateStatistics(userId);
    }
    if (ids.length > 0) {
      this.logger.log(
        `已更新还款关联交易: userId=${userId}, paymentId=${paymentId}, count=${ids.length}`,
      );
    }

    return { updatedCount: ids.length, ids };
  }

  /**
   * 检查是否存在关联的交易记录
   */
  async existsLinkedTransaction(
    userId: string,
    criteria: { debtId?: string; paymentId?: string },
  ): Promise<boolean> {
    const { debtId, paymentId } = criteria;
    if (!debtId && !paymentId) return false;

    const where: any = { userId };
    if (paymentId) {
      where.metadata = Raw((alias) => `${alias} @> :meta`, { meta: JSON.stringify({ paymentId }) });
    } else if (debtId) {
      // 仅匹配债务本身的交易（不含还款），通过判断 metadata 中是否存在 paymentId 来区分
      // 使用 jsonb_exists 函数代替 ?? 操作符，避免 TypeORM/Postgres 的转义问题
      where.metadata = Raw(
        (alias) => `${alias} @> :meta AND NOT (jsonb_exists(${alias}, 'paymentId'))`,
        { meta: JSON.stringify({ debtId }) },
      );
    }

    const count = await this.transactionRepository.count({ where });
    return count > 0;
  }

  /**
   * 删除与债务或还款关联的交易记录
   */
  async removeLinkedTransactions(
    userId: string,
    criteria: { debtId?: string; paymentId?: string },
  ): Promise<void> {
    const { debtId, paymentId } = criteria;
    if (!debtId && !paymentId) return;

    this.logger.log(`删除关联交易: userId=${userId}, criteria=${JSON.stringify(criteria)}`);

    const where: any = { userId };

    if (paymentId) {
      // 这里的 Raw 语法取决于数据库类型，PostgreSQL 使用 @>
      where.metadata = Raw((alias) => `${alias} @> :meta`, { meta: JSON.stringify({ paymentId }) });
    } else if (debtId) {
      where.metadata = Raw((alias) => `${alias} @> :meta`, { meta: JSON.stringify({ debtId }) });
    }

    const linkedTxs = await this.transactionRepository.find({ where });

    if (linkedTxs.length > 0) {
      const ids = linkedTxs.map((tx) => tx.id);
      await this.transactionRepository.delete({ id: In(ids) });
      this.logger.log(`已物理删除 ${linkedTxs.length} 条关联交易记录`);

      // 发送实时更新通知
      this.ledgerGateway.notifyUpdate(null, 'TRANSACTION_BATCH_DELETED', { ids }, userId);
      // 失效统计缓存，确保概览实时更新
      this.invalidateStatistics(userId);
    }
  }

  /**
   * 获取交易记录变更历史
   */
  async getHistory(userId: string, transactionId: string): Promise<TransactionLog[]> {
    await this.findOne(userId, transactionId);

    return this.logRepository.find({
      where: {
        entityType: EntityType.TRANSACTION,
        entityId: transactionId,
        userId,
      },
      order: { createdAt: 'DESC' },
    });
  }

  /**
   * 清理交易记录敏感数据
   */
  private sanitizeTransactionData(transaction: Transaction): Record<string, any> {
    const data: Record<string, any> = { ...(transaction as any) };
    delete (data as any).user;
    return data;
  }

  /**
   * 失效统计缓存（统一入口）
   */
  private invalidateStatistics(userId: string): void {
    try {
      this.statisticsService.invalidateUserCache(userId);
    } catch (e: any) {
      this.logger.warn(`统计缓存失效调用失败: userId=${userId}, err=${e?.message || e}`);
    }
  }

}
