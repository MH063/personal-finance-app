import { Injectable, NotFoundException, BadRequestException, Logger, Inject, forwardRef } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, LessThan, MoreThan, IsNull, In, OptimisticLockVersionMismatchError } from 'typeorm';
import { Cron, CronExpression } from '@nestjs/schedule';
import { Debt, DebtType, DebtStatus } from '../entities/debt.entity';
import { DebtPayment } from '../entities/debt-payment.entity';
import { NotificationsService } from '../notifications/notifications.service';
import { NotificationType, NotificationPriority } from '../entities/notification.entity';
import { CreateDebtDto, UpdateDebtDto, CreatePaymentDto, DebtQueryDto } from './dto/debt.dto';
import { LedgerGateway } from '../ledgers/ledger.gateway';
import { TransactionsService } from '../transactions/transactions.service';
import { CategoriesService } from '../categories/categories.service';
import { TransactionType, PaymentMethod } from '../entities/transaction.entity';
import { CategoryType } from '../entities/category.entity';

export interface DebtStatistics {
  totalDebts: number;
  totalBorrowed: number;
  totalLent: number;
  pendingDebts: number;
  overdueDebts: number;
  dueSoonDebts: number;
  totalPendingAmount: number;
  totalOverdueAmount: number;
}

export interface DebtWithPayments extends Debt {
  payments: DebtPayment[];
  paidPercentage: number;
  isOverdue: boolean;
}

@Injectable()
export class DebtsService {
  private readonly logger = new Logger(DebtsService.name);

  constructor(
    @InjectRepository(Debt)
    private readonly debtRepository: Repository<Debt>,
    @InjectRepository(DebtPayment)
    private readonly paymentRepository: Repository<DebtPayment>,
    private readonly notificationsService: NotificationsService,
    private readonly ledgerGateway: LedgerGateway,
    @Inject(forwardRef(() => TransactionsService))
    private readonly transactionsService: TransactionsService,
    private readonly categoriesService: CategoriesService,
  ) {}

  /**
   * 获取或创建债务专项分类
   */
  private async getOrCreateDebtCategory(userId: string, debtType: DebtType) {
    const categoryName = debtType === DebtType.BORROW ? '借入款' : '借出款';
    const categoryType = debtType === DebtType.BORROW ? CategoryType.INCOME : CategoryType.EXPENSE;

    const categories = await this.categoriesService.findAll(userId, { type: categoryType });
    let category = categories.find(c => c.name === categoryName);

    if (!category) {
      this.logger.log(`为用户 ${userId} 创建缺失的债务分类: ${categoryName}`);
      const color = debtType === DebtType.BORROW ? '#FAAD14' : '#722ED1';
      const icon = debtType === DebtType.BORROW ? 'borrow' : 'lend';
      
      try {
        category = await this.categoriesService.create(userId, {
          name: categoryName,
          type: categoryType,
          color,
          icon,
          sortOrder: 99 // 放在后面
        });
      } catch (err: any) {
        this.logger.error(`创建分类失败: ${err.message}`);
        category = categories.find(c => c.name.includes('其他')) || categories[0];
      }
    }

    return category;
  }

  /**
   * 创建债务记录
   */
  async create(userId: string, createDto: CreateDebtDto): Promise<Debt> {
    this.logger.log(
      `用户 ${userId} 创建债务: ${createDto.debtorName} - ${createDto.originalAmount}`,
    );

    const debt = this.debtRepository.create({
      ...createDto,
      id: createDto.id, // 如果前端提供了 ID (离线同步场景)，则使用提供的 ID
      userId,
      originalAmount: createDto.originalAmount,
      remainingAmount: createDto.originalAmount,
      status: DebtStatus.PENDING,
    });

    const savedDebt = await this.debtRepository.save(debt);
    this.logger.log(`债务创建成功: ${savedDebt.id}`);

    // --- 联动交易流水 ---
    try {
      const category = await this.getOrCreateDebtCategory(userId, createDto.debtType);
      const txType = createDto.debtType === DebtType.BORROW ? TransactionType.INCOME : TransactionType.EXPENSE;
      
      await this.transactionsService.create(userId, {
        amount: createDto.originalAmount,
        type: txType,
        categoryId: category?.id,
        transactionDate: new Date().toISOString(),
        description: `[债务关联] ${createDto.debtType === DebtType.BORROW ? '借入' : '借出'}：${createDto.debtorName}${createDto.description ? ' - ' + createDto.description : ''}`,
        paymentMethod: PaymentMethod.OTHER,
        metadata: {
          debtId: savedDebt.id,
          isDebtLink: true
        }
      });
      this.logger.log(`已自动生成债务关联交易流水: DebtID=${savedDebt.id}`);
    } catch (txError: any) {
      this.logger.error(`生成债务关联交易流水失败: ${txError.message}`);
      // 联动失败不应影响债务主记录的创建，仅记录日志
    }

    // 发送实时更新通知
    this.ledgerGateway.notifyUpdate(null, 'DEBT_CREATED', savedDebt, userId);

    return savedDebt;
  }

  /**
   * 获取债务列表
   */
  async findAll(userId: string, query: DebtQueryDto): Promise<Debt[]> {
    const { debtType, status, withReminder, overdue } = query;

    const queryBuilder = this.debtRepository
      .createQueryBuilder('debt')
      .where('debt.userId = :userId', { userId });

    if (debtType) {
      queryBuilder.andWhere('debt.debtType = :debtType', { debtType });
    }

    if (status) {
      queryBuilder.andWhere('debt.status = :status', { status });
    }

    if (withReminder) {
      queryBuilder
        .andWhere('debt.isReminderEnabled = :enabled', { enabled: true })
        .andWhere('debt.status != :status', { status: DebtStatus.PAID });
    }

    if (overdue) {
      queryBuilder
        .andWhere('debt.status != :status', { status: DebtStatus.PAID })
        .andWhere('debt.dueDate < :today', { today: new Date() });
    }

    queryBuilder.orderBy('debt.createdAt', 'DESC');

    return queryBuilder.getMany();
  }

  /**
   * 获取单个债务详情（包含还款记录）
   */
  async findOne(userId: string, id: string): Promise<DebtWithPayments> {
    const debt = await this.debtRepository.findOne({
      where: { id, userId },
      relations: ['payments'],
    });

    if (!debt) {
      throw new NotFoundException('债务记录不存在');
    }

    const payments = await this.paymentRepository.find({
      where: { debtId: id },
      order: { paymentDate: 'ASC' },
    });

    return {
      ...debt,
      payments,
      paidPercentage: this.calculatePaidPercentage(debt),
      isOverdue: this.isOverdue(debt),
    };
  }

  /**
   * 更新债务记录
   */
  async update(userId: string, id: string, updateDto: UpdateDebtDto): Promise<Debt> {
    this.logger.log(`用户 ${userId} 更新债务: ${id}`);

    const debt = await this.debtRepository.findOne({
      where: { id, userId },
    });

    if (!debt) {
      throw new NotFoundException('债务记录不存在');
    }

    if (updateDto.status && updateDto.status === DebtStatus.PAID) {
      (updateDto as any).remainingAmount = 0;
      (updateDto as any).paidDate = new Date();
    }

    // 乐观锁校验
    if (updateDto.version !== undefined && debt.version !== updateDto.version) {
      throw new OptimisticLockVersionMismatchError('Debt', updateDto.version, debt.version);
    }

    // 移除 version，防止 Object.assign 覆盖实体中的 version，让 TypeORM 自动管理
    const { version, ...updateData } = updateDto;
    Object.assign(debt, updateData);
    const updatedDebt = await this.debtRepository.save(debt);

    // 发送实时更新通知
    this.ledgerGateway.notifyUpdate(null, 'DEBT_UPDATED', updatedDebt, userId);

    return updatedDebt;
  }

  /**
   * 删除债务记录
   */
  async remove(userId: string, id: string): Promise<void> {
    this.logger.log(`用户 ${userId} 删除债务: ${id}`);

    const debt = await this.debtRepository.findOne({
      where: { id, userId },
    });

    if (!debt) {
      throw new NotFoundException('债务记录不存在');
    }

    await this.debtRepository.remove(debt);
    this.logger.log(`债务删除成功: ${id}`);

    // --- 联动删除交易流水 ---
    try {
      await this.transactionsService.removeLinkedTransactions(userId, { debtId: id });
    } catch (txError: any) {
      this.logger.error(`删除关联交易流水失败: ${txError.message}`);
    }

    // 发送实时更新通知
    this.ledgerGateway.notifyUpdate(null, 'DEBT_DELETED', { id }, userId);
  }

  /**
   * 添加还款记录
   */
  async addPayment(
    userId: string,
    debtId: string,
    paymentDto: CreatePaymentDto,
  ): Promise<DebtPayment> {
    this.logger.log(`用户 ${userId} 为债务 ${debtId} 添加还款: ${paymentDto.amount}`);

    const debt = await this.debtRepository.findOne({
      where: { id: debtId, userId },
    });

    if (!debt) {
      throw new NotFoundException('债务记录不存在');
    }

    const payment = this.paymentRepository.create({
      ...paymentDto,
      userId,
      debtId,
      paymentDate: new Date(paymentDto.paymentDate),
    });

    const savedPayment = await this.paymentRepository.save(payment);

    const newRemaining = Number(debt.remainingAmount) - paymentDto.amount;

    if (newRemaining <= 0) {
      debt.status = DebtStatus.PAID;
      debt.remainingAmount = 0;
      debt.paidDate = new Date();
    } else {
      debt.status = DebtStatus.PARTIAL;
      debt.remainingAmount = newRemaining;
    }

    debt.totalPaid = Number(debt.totalPaid) + paymentDto.amount;
    debt.paymentCount = (debt.paymentCount || 0) + 1;
    await this.debtRepository.save(debt);

    this.logger.log(`还款记录添加成功: ${savedPayment.id}`);

    // --- 联动交易流水 ---
    try {
      // 还款时的交易类型与借入/借出相反
      // 借入(BORROW)还款 -> 支出(EXPENSE)
      // 借出(LEND)收款 -> 收入(INCOME)
      const oppositeType = debt.debtType === DebtType.BORROW ? DebtType.LEND : DebtType.BORROW;
      const category = await this.getOrCreateDebtCategory(userId, oppositeType);
      const txType = debt.debtType === DebtType.BORROW ? TransactionType.EXPENSE : TransactionType.INCOME;

      await this.transactionsService.create(userId, {
        amount: paymentDto.amount,
        type: txType,
        categoryId: category?.id,
        transactionDate: new Date(paymentDto.paymentDate).toISOString(),
        description: `[债务关联] ${debt.debtType === DebtType.BORROW ? '偿还' : '收回'}债务：${debt.debtorName}${paymentDto.note ? ' - ' + paymentDto.note : ''}`,
        paymentMethod: PaymentMethod.OTHER,
        metadata: {
          debtId: debt.id,
          paymentId: savedPayment.id,
          isDebtLink: true
        }
      });
      this.logger.log(`已自动生成债务还款关联交易流水: PaymentID=${savedPayment.id}`);
    } catch (txError: any) {
      this.logger.error(`生成债务还款关联交易流水失败: ${txError.message}`);
    }

    // 发送实时更新通知
    this.ledgerGateway.notifyUpdate(null, 'DEBT_PAYMENT_ADDED', { debtId, payment: savedPayment }, userId);

    return savedPayment;
  }

  /**
   * 删除还款记录
   */
  async removePayment(userId: string, debtId: string, paymentId: string): Promise<void> {
    const payment = await this.paymentRepository.findOne({
      where: { id: paymentId, debtId, userId },
    });

    if (!payment) {
      throw new NotFoundException('还款记录不存在');
    }

    const debt = await this.debtRepository.findOne({
      where: { id: debtId, userId },
    });

    if (debt) {
      debt.remainingAmount = Number(debt.remainingAmount) + payment.amount;
      debt.totalPaid = Number(debt.totalPaid) - payment.amount;
      debt.paymentCount = Math.max(0, (debt.paymentCount || 0) - 1);

      if (debt.status === DebtStatus.PAID) {
        debt.status = DebtStatus.PARTIAL;
        debt.paidDate = null as any;
      }

      if (debt.remainingAmount >= debt.originalAmount) {
        debt.status = DebtStatus.PENDING;
        debt.remainingAmount = debt.originalAmount;
      }

      await this.debtRepository.save(debt);
    }

    await this.paymentRepository.remove(payment);
    this.logger.log(`还款记录删除成功: ${paymentId}`);

    // --- 联动删除关联交易流水 ---
    try {
      await this.transactionsService.removeLinkedTransactions(userId, { paymentId });
    } catch (txError: any) {
      this.logger.error(`删除还款关联交易流水失败: ${txError.message}`);
    }

    // 发送实时更新通知
    this.ledgerGateway.notifyUpdate(null, 'DEBT_PAYMENT_DELETED', { debtId, paymentId }, userId);
  }

  /**
   * 同步所有债务及还款记录到交易流水
   */
  async syncAllToTransactions(userId: string): Promise<{ debtsSynced: number; paymentsSynced: number }> {
    this.logger.log(`用户 ${userId} 触发全量债务交易同步`);
    
    const debts = await this.debtRepository.find({
      where: { userId },
      relations: ['payments']
    });

    let debtsSynced = 0;
    let paymentsSynced = 0;

    for (const debt of debts) {
      // 1. 同步债务本身
      const debtExists = await this.transactionsService.existsLinkedTransaction(userId, { debtId: debt.id });
      if (!debtExists) {
        try {
          const category = await this.getOrCreateDebtCategory(userId, debt.debtType);
          const txType = debt.debtType === DebtType.BORROW ? TransactionType.INCOME : TransactionType.EXPENSE;
          
          await this.transactionsService.create(userId, {
            amount: Number(debt.originalAmount),
            type: txType,
            categoryId: category?.id,
            transactionDate: debt.createdAt.toISOString(),
            description: `[债务同步] ${debt.debtType === DebtType.BORROW ? '借入' : '借出'}：${debt.debtorName}${debt.description ? ' - ' + debt.description : ''}`,
            paymentMethod: PaymentMethod.OTHER,
            metadata: {
              debtId: debt.id,
              isDebtLink: true
            }
          });
          debtsSynced++;
        } catch (err: any) {
          this.logger.error(`同步债务 ${debt.id} 失败: ${err.message}`);
        }
      }

      // 2. 同步还款记录
      if (debt.payments && debt.payments.length > 0) {
        for (const payment of debt.payments) {
          const paymentExists = await this.transactionsService.existsLinkedTransaction(userId, { paymentId: payment.id });
          if (!paymentExists) {
            try {
              const oppositeType = debt.debtType === DebtType.BORROW ? DebtType.LEND : DebtType.BORROW;
              const category = await this.getOrCreateDebtCategory(userId, oppositeType);
              const txType = debt.debtType === DebtType.BORROW ? TransactionType.EXPENSE : TransactionType.INCOME;

              await this.transactionsService.create(userId, {
                amount: Number(payment.amount),
                type: txType,
                categoryId: category?.id,
                transactionDate: payment.paymentDate.toISOString(),
                description: `[还款同步] ${debt.debtType === DebtType.BORROW ? '偿还' : '收回'}债务：${debt.debtorName}${payment.note ? ' - ' + payment.note : ''}`,
                paymentMethod: PaymentMethod.OTHER,
                metadata: {
                  debtId: debt.id,
                  paymentId: payment.id,
                  isDebtLink: true
                }
              });
              paymentsSynced++;
            } catch (err: any) {
              this.logger.error(`同步还款 ${payment.id} 失败: ${err.message}`);
            }
          }
        }
      }
    }

    this.logger.log(`同步完成: 债务=${debtsSynced}, 还款=${paymentsSynced}`);
    return { debtsSynced, paymentsSynced };
  }

  /**
   * 获取债务统计信息
   */
  async getStatistics(userId: string, includePaid: boolean = false): Promise<DebtStatistics> {
    const queryBuilder = this.debtRepository
      .createQueryBuilder('debt')
      .where('debt.userId = :userId', { userId });

    if (!includePaid) {
      queryBuilder.andWhere('debt.status != :status', { status: DebtStatus.PAID });
    }

    const debts = await queryBuilder.getMany();
    const today = new Date();
    const threeDaysLater = new Date(today.getTime() + 3 * 24 * 60 * 60 * 1000);

    let totalBorrowed = 0;
    let totalLent = 0;
    let pendingDebts = 0;
    let overdueDebts = 0;
    let dueSoonDebts = 0;
    let totalPendingAmount = 0;
    let totalOverdueAmount = 0;

    for (const debt of debts) {
      if (debt.debtType === DebtType.BORROW) {
        totalBorrowed += Number(debt.remainingAmount);
      } else {
        totalLent += Number(debt.remainingAmount);
      }

      if (debt.status !== DebtStatus.PAID) {
        pendingDebts++;
        totalPendingAmount += Number(debt.remainingAmount);

        if (this.isOverdue(debt)) {
          overdueDebts++;
          totalOverdueAmount += Number(debt.remainingAmount);
        }

        if (
          debt.dueDate &&
          new Date(debt.dueDate) <= threeDaysLater &&
          new Date(debt.dueDate) >= today
        ) {
          dueSoonDebts++;
        }
      }
    }

    return {
      totalDebts: debts.length,
      totalBorrowed,
      totalLent,
      pendingDebts,
      overdueDebts,
      dueSoonDebts,
      totalPendingAmount,
      totalOverdueAmount,
    };
  }

  /**
   * 获取需要提醒的债务列表
   */
  async getReminders(userId: string): Promise<Debt[]> {
    const today = new Date();
    const sevenDaysLater = new Date(today.getTime() + 7 * 24 * 60 * 60 * 1000);

    return this.debtRepository
      .createQueryBuilder('debt')
      .where('debt.userId = :userId', { userId })
      .andWhere('debt.isReminderEnabled = :enabled', { enabled: true })
      .andWhere('debt.status != :status', { status: DebtStatus.PAID })
      .andWhere('debt.isNotified = :notified', { notified: false })
      .andWhere('debt.reminderDate <= :sevenDaysLater', { sevenDaysLater })
      .getMany();
  }

  /**
   * 标记债务已通知
   */
  async markAsNotified(debtId: string): Promise<void> {
    await this.debtRepository.update(debtId, { isNotified: true });
  }

  /**
   * 每日任务：检查逾期债务
   */
  @Cron(CronExpression.EVERY_DAY_AT_8AM)
  async checkOverdueDebts(): Promise<void> {
    this.logger.log('开始检查逾期债务...');

    const today = new Date();

    // 查找即将逾期或已逾期的债务
    const pendingDebts = await this.debtRepository.find({
      where: {
        status: In([DebtStatus.PENDING, DebtStatus.OVERDUE]),
      },
    });

    for (const debt of pendingDebts) {
      if (debt.dueDate && new Date(debt.dueDate) < today && debt.status !== DebtStatus.OVERDUE) {
        // 更新状态为逾期
        debt.status = DebtStatus.OVERDUE;
        await this.debtRepository.save(debt);

        // 创建通知
        await this.notificationsService.createNotification(debt.userId, {
          title: '债务逾期提醒',
          content: `您与 ${debt.debtorName} 的债务已逾期，请及时处理。`,
          type: NotificationType.DEBT_REMINDER,
          priority: NotificationPriority.HIGH,
          link: '/debt',
        });
      } else if (
        debt.dueDate &&
        debt.isReminderEnabled &&
        !debt.isNotified &&
        debt.reminderDate &&
        new Date(debt.reminderDate) <= today
      ) {
        // 到达提醒时间
        await this.notificationsService.createNotification(debt.userId, {
          title: '债务即将到期提醒',
          content: `与 ${debt.debtorName} 的债务将于 ${new Date(debt.dueDate).toLocaleDateString()} 到期，请注意。`,
          type: NotificationType.DEBT_REMINDER,
          priority: NotificationPriority.MEDIUM,
          link: '/debt',
        });

        // 标记为已通知，避免重复通知
        debt.isNotified = true;
        await this.debtRepository.save(debt);
      }
    }

    this.logger.log('逾期债务检查完成');
  }

  /**
   * 计算已还款百分比
   */
  private calculatePaidPercentage(debt: Debt): number {
    if (Number(debt.originalAmount) === 0) return 100;
    return Number(((Number(debt.totalPaid) / Number(debt.originalAmount)) * 100).toFixed(2));
  }

  /**
   * 判断是否逾期
   */
  private isOverdue(debt: Debt): boolean {
    if (debt.status === DebtStatus.PAID) return false;
    if (!debt.dueDate) return false;
    return new Date(debt.dueDate) < new Date();
  }
}
