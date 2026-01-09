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
import { TransactionLog, LogAction, EntityType } from '../entities/transaction-log.entity';
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
    @InjectRepository(TransactionLog)
    private readonly logRepository: Repository<TransactionLog>,
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

    const transaction = this.transactionRepository.create({
      ...createDto,
      userId,
      categoryId: createDto.categoryId || undefined,
      transactionDate: new Date(createDto.transactionDate),
    });

    const result = await this.transactionRepository.save(transaction);
    const savedTransaction = Array.isArray(result) ? result[0] : result;

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
      minAmount,
      maxAmount,
      paymentMethod,
      keyword,
      sortBy = 'transactionDate',
      sortOrder = 'desc',
    } = query;

    const where: FindOptionsWhere<Transaction> = {
      userId,
      isDeleted: false,
    };

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

    if (keyword) {
      const filteredData = data.filter(
        (t) =>
          t.description?.toLowerCase().includes(keyword.toLowerCase()) ||
          t.merchant?.toLowerCase().includes(keyword.toLowerCase()),
      );
      return {
        data: filteredData,
        total: filteredData.length,
        page,
        limit,
        totalPages: Math.ceil(filteredData.length / limit),
      };
    }

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
      where: { id, userId, isDeleted: false },
      relations: ['category'],
    });

    if (!transaction) {
      throw new NotFoundException('交易记录不存在');
    }

    return transaction;
  }

  /**
   * 更新交易记录
   */
  async update(userId: string, id: string, updateDto: UpdateTransactionDto): Promise<Transaction> {
    this.logger.log(`用户 ${userId} 更新交易记录: ${id}`);

    const transaction = await this.findOne(userId, id);
    const oldData = { ...transaction };

    if (updateDto.categoryId) {
      await this.validateCategory(
        userId,
        updateDto.categoryId,
        updateDto.type || (transaction.type as TransactionType),
      );
    }

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

    await this.transactionRepository.save(transaction);

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

    transaction.isDeleted = true;
    transaction.deletedAt = new Date();
    await this.transactionRepository.save(transaction);

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

    await this.logRepository.save({
      action: LogAction.DELETE,
      entityType: EntityType.TRANSACTION,
      entityId: dto.ids.join(','),
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

    if (result.affected === 0) {
      throw new NotFoundException('未找到要更新的交易记录');
    }

    await this.logRepository.save({
      action: LogAction.UPDATE,
      entityType: EntityType.TRANSACTION,
      entityId: dto.ids.join(','),
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
