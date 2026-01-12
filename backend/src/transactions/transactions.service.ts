import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Between, Like, FindOptionsWhere, In, Not } from 'typeorm';
import { Transaction, TransactionType } from '../entities/transaction.entity';
import { Category } from '../entities/category.entity';
import { Ledger, LedgerMember } from '../entities/ledger.entity';
import { TransactionLog, LogAction, EntityType } from '../entities/transaction-log.entity';
import { LedgerGateway } from '../ledgers/ledger.gateway';
import {
  CreateTransactionDto,
  UpdateTransactionDto,
  TransactionQueryDto,
  BatchDeleteDto,
  BatchUpdateCategoryDto,
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
   * 创建交易记录
   */
  async create(userId: string, createDto: CreateTransactionDto): Promise<Transaction> {
    this.logger.log(`用户 ${userId} 创建交易记录: ${createDto.amount} ${createDto.type}`);

    if (createDto.categoryId) {
      await this.validateCategory(userId, createDto.categoryId, createDto.type);
    }

    let ledgerId = createDto.ledgerId;
    if (!ledgerId) {
      // 获取用户的默认私有账本
      const defaultLedger = await this.ledgerRepository.findOne({
        where: { ownerId: userId, isDefault: true },
      });
      if (!defaultLedger) {
        throw new NotFoundException('未找到用户的默认账本');
      }
      ledgerId = defaultLedger.id;
    } else {
      // 验证用户是否有权限在该账本中创建交易
      const membership = await this.ledgerMemberRepository.findOne({
        where: { ledgerId, userId },
      });
      if (!membership) {
        throw new ForbiddenException('您没有权限在该账本中创建交易');
      }
    }

    const transaction = this.transactionRepository.create({
      ...createDto,
      userId,
      ledgerId,
      categoryId: createDto.categoryId || undefined,
      transactionDate: new Date(createDto.transactionDate),
    });

    const result = await this.transactionRepository.save(transaction);
    const savedTransaction = Array.isArray(result) ? result[0] : result;

    // 发送实时更新通知
    this.ledgerGateway.notifyUpdate(ledgerId, 'TRANSACTION_CREATED', savedTransaction, userId);

    await this.logRepository.save({
      action: LogAction.CREATE,
      entityType: EntityType.TRANSACTION,
      entityId: savedTransaction.id,
      newData: this.sanitizeTransactionData(savedTransaction),
      userId,
    });

    this.logger.log(`交易记录创建成功: ${savedTransaction.id}`);
    return this.findOne(userId, savedTransaction.id);
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
    } = query;

    const where: FindOptionsWhere<Transaction> = { isDeleted: false };

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

    if (minAmount !== undefined && maxAmount !== undefined) {
      where.amount = Between(minAmount, maxAmount);
    } else if (minAmount !== undefined) {
      where.amount = Between(minAmount, 1000000000);
    } else if (maxAmount !== undefined) {
      where.amount = Between(0, maxAmount);
    }

    const [data, total] = await this.transactionRepository.findAndCount({
      where,
      relations: ['category'],
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
      where: { id, isDeleted: false },
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

    const changedFields: string[] = [];
    Object.keys(updateDto).forEach((key) => {
      if (
        updateDto[key as keyof UpdateTransactionDto] !== undefined &&
        updateDto[key as keyof UpdateTransactionDto] !== (transaction as any)[key]
      ) {
        changedFields.push(key);
      }
    });

    Object.assign(transaction, updateDto);

    if (updateDto.transactionDate) {
      transaction.transactionDate = new Date(updateDto.transactionDate);
    }

    const updatedTransaction = await this.transactionRepository.save(transaction);

    // 发送实时更新通知
    this.ledgerGateway.notifyUpdate(transaction.ledgerId, 'TRANSACTION_UPDATED', updatedTransaction, userId);

    await this.logRepository.save({
      action: LogAction.UPDATE,
      entityType: EntityType.TRANSACTION,
      entityId: id,
      oldData: this.sanitizeTransactionData(oldData),
      newData: this.sanitizeTransactionData(transaction),
      changedFields,
      userId,
    });

    return this.findOne(userId, id);
  }

  /**
   * 删除交易记录（软删除）
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

    transaction.isDeleted = true;
    transaction.deletedAt = new Date();
    await this.transactionRepository.save(transaction);

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
  }

  /**
   * 批量删除交易记录
   */
  async batchRemove(userId: string, dto: BatchDeleteDto): Promise<{ deletedCount: number }> {
    this.logger.log(`用户 ${userId} 批量删除交易记录: ${dto.ids.length}条`);

    const result = await this.transactionRepository.update(
      { id: In(dto.ids), userId, isDeleted: false },
      { isDeleted: true, deletedAt: new Date() },
    );

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
        isDeleted: false,
      },
    });

    if (incompatibleTransactions > 0) {
      throw new BadRequestException('部分选中的交易类型与新分类不匹配');
    }

    const result = await this.transactionRepository.update(
      { id: In(dto.ids), userId, isDeleted: false },
      { categoryId: dto.categoryId },
    );

    // 触发更新通知
    this.ledgerGateway.notifyUpdate(null, 'TRANSACTION_BATCH_UPDATED', { ids: dto.ids, categoryId: dto.categoryId }, userId);

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

    return { updatedCount: result.affected || 0 };
  }

  /**
   * 获取交易记录变更历史
   */
  async getHistory(userId: string, transactionId: string): Promise<TransactionLog[]> {
    const transaction = await this.findOne(userId, transactionId);

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
    const { user, ...data } = transaction;
    return data;
  }
}
