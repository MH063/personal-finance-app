import {
  Injectable,
  NotFoundException,
  Logger,
  Inject,
  forwardRef,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, OptimisticLockVersionMismatchError, Not, IsNull, DataSource } from 'typeorm';
import { Cron, CronExpression } from '@nestjs/schedule';
import { Debt, DebtType, DebtStatus, RepaymentDayAdjustment } from '../entities/debt.entity';
import { DebtPayment, PaymentStatus } from '../entities/debt-payment.entity';
import { Transaction, PaymentMethod as TxPaymentMethod } from '../entities/transaction.entity';
import { TransactionLog, LogAction, EntityType } from '../entities/transaction-log.entity';
import { UserSetting } from '../entities/user-setting.entity';
import { NotificationsService } from '../notifications/notifications.service';
import { NotificationType, NotificationPriority } from '../entities/notification.entity';
import {
  CreateDebtDto,
  UpdateDebtDto,
  CreatePaymentDto,
  UpdatePaymentDto,
  DebtQueryDto,
} from './dto/debt.dto';
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
  totalAccruedInterest: number; // 累计已产生但未结清的利息
}

export interface DebtWithPayments extends Omit<Debt, 'calculateInterest'> {
  payments: DebtPayment[];
  paidPercentage: number;
  isOverdue: boolean;
  accumulatedInterest: number;
}

@Injectable()
export class DebtsService {
  private readonly logger = new Logger(DebtsService.name);

  constructor(
    @InjectRepository(Debt)
    private readonly debtRepository: Repository<Debt>,
    @InjectRepository(DebtPayment)
    private readonly paymentRepository: Repository<DebtPayment>,
    @InjectRepository(TransactionLog)
    private logRepository: Repository<TransactionLog>,
    @InjectRepository(UserSetting)
    private settingRepository: Repository<UserSetting>,
    private readonly notificationsService: NotificationsService,
    private readonly ledgerGateway: LedgerGateway,
    @Inject(forwardRef(() => TransactionsService))
    private readonly transactionsService: TransactionsService,
    private readonly categoriesService: CategoriesService,
    private readonly dataSource: DataSource,
  ) {}

  @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT)
  async checkDailyTasks() {
    this.logger.log('执行每日债务任务检查...');
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // 1. 查找所有未结清且设置了每月还款日的债务
    const activeDebts = await this.debtRepository.find({
      where: [
        { status: DebtStatus.PENDING, repaymentDay: Not(IsNull()) },
        { status: DebtStatus.PARTIAL, repaymentDay: Not(IsNull()) },
      ],
      relations: ['user', 'user.settings'],
    });

    for (const debt of activeDebts) {
      if (!debt.repaymentDay) continue;

      // 获取用户通知配置
      const userSettings = debt.user?.settings?.[0];
      const notifSettings = userSettings?.notificationSettings;
      const globalReminderEnabled = notifSettings?.debtReminder ?? true; // 默认开启
      const advanceDays = notifSettings?.reminderAdvanceDays ?? 3; // 默认提前3天

      const monthAnchors = [
        new Date(today.getFullYear(), today.getMonth(), 1),
        new Date(today.getFullYear(), today.getMonth() - 1, 1),
      ];

      const repaymentDatesMap = new Map<string, Date>();
      for (const anchor of monthAnchors) {
        const repaymentDate = this.getRepaymentDateForMonth(
          anchor,
          debt.repaymentDay,
          debt.repaymentDayAdjustment,
        );
        repaymentDatesMap.set(this.getDateKey(repaymentDate), repaymentDate);
      }

      for (const repaymentDate of repaymentDatesMap.values()) {
        if (this.isSameDay(today, repaymentDate)) {
          await this.createPendingPayment(debt, repaymentDate);
        }

        const reminderDate = new Date(repaymentDate);
        reminderDate.setDate(repaymentDate.getDate() - advanceDays);
        reminderDate.setHours(0, 0, 0, 0);

        if (this.isSameDay(today, reminderDate)) {
          // 检查全局开关和债务单独开关
          if (globalReminderEnabled) {
            await this.sendRepaymentReminder(debt, repaymentDate);
          }
        }
      }
    }
  }

  private getDateKey(date: Date): string {
    return `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}`;
  }

  private getRepaymentDateForMonth(
    targetMonthDate: Date,
    day: number,
    adjustment: RepaymentDayAdjustment,
  ): Date {
    const year = targetMonthDate.getFullYear();
    const month = targetMonthDate.getMonth(); // 0-11

    // 1. 确定基准日期 (处理月末)
    const lastDayOfMonth = new Date(year, month + 1, 0).getDate();
    const targetDay = Math.min(day, lastDayOfMonth);

    const targetDate = new Date(year, month, targetDay);
    targetDate.setHours(0, 0, 0, 0);

    // 2. 处理非工作日顺延
    if (adjustment === RepaymentDayAdjustment.WORKDAY) {
      // 0 = Sunday, 6 = Saturday
      while (targetDate.getDay() === 0 || targetDate.getDay() === 6) {
        targetDate.setDate(targetDate.getDate() + 1);
      }
      targetDate.setHours(0, 0, 0, 0);
    }

    return targetDate;
  }

  private isSameDay(d1: Date, d2: Date): boolean {
    return (
      d1.getFullYear() === d2.getFullYear() &&
      d1.getMonth() === d2.getMonth() &&
      d1.getDate() === d2.getDate()
    );
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

  private assertPaymentDateNotFuture(userId: string, debtId: string, input: unknown): void {
    const paymentDate = this.toLocalDateOnly(input);
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    if (paymentDate.getTime() > today.getTime()) {
      this.logger.warn(
        `拒绝未来还款日期: userId=${userId}, debtId=${debtId}, paymentDate=${paymentDate.toISOString()}`,
      );
      throw new BadRequestException('还款日期不能超过当前时间');
    }
  }

  private async createPendingPayment(debt: Debt, date: Date) {
    // 检查是否已存在同日期的记录 (避免重复生成)
    const start = new Date(date);
    start.setHours(0, 0, 0, 0);
    const end = new Date(start);
    end.setDate(start.getDate() + 1);

    const existing = await this.paymentRepository
      .createQueryBuilder('payment')
      .where('payment.debtId = :debtId', { debtId: debt.id })
      .andWhere('payment.userId = :userId', { userId: debt.userId })
      .andWhere('payment.paymentDate >= :start AND payment.paymentDate < :end', { start, end })
      .getOne();

    if (existing) return;

    // 估算还款金额
    // 这里简单处理，如果有智能计算逻辑，可以复用。
    // 暂时默认填入0或者剩余金额的一小部分，或者如果有分期计划，填入分期金额。
    // 由于后端目前没有存储分期计划详情，这里暂时设为 0 或 剩余金额
    // 改进：如果 Debt 实体有 monthlyPayment 字段最好，但目前没有。
    // 我们可以尝试根据 repaymentType 做简单估算，或者留空让用户填。
    // Requirement says: "generate pending repayment record".

    // 如果是分期还款，尝试计算
    if (['equal_loan_payments', 'equal_principal_payments'].includes(debt.repaymentType)) {
      // 暂时无法精确计算，因为缺少期数状态。
      // 设为 0，由用户确认时填写
    }

    const payment = this.paymentRepository.create({
      debtId: debt.id,
      userId: debt.userId,
      amount: 0, // 待确认金额
      paymentDate: date,
      status: PaymentStatus.PENDING,
      paymentMethod: PaymentMethod.OTHER,
      note: '系统自动生成待还款记录',
    });

    await this.paymentRepository.save(payment);
    this.logger.log(`自动生成待还款记录: Debt=${debt.id}, Date=${date.toISOString()}`);

    // 通知前端更新
    this.ledgerGateway.notifyUpdate(
      null,
      'DEBT_PAYMENT_ADDED',
      { debtId: debt.id, payment },
      debt.userId,
    );
  }

  private async sendRepaymentReminder(debt: Debt, date: Date) {
    if (!debt.isReminderEnabled) return;

    const amountText = Number(debt.remainingAmount || 0).toFixed(2);
    const message =
      '您的债务“' +
      debt.debtorName +
      '”即将到期。待还金额：' +
      amountText +
      '，截止日期：' +
      date.toLocaleDateString() +
      '，请及时处理。';

    await this.notificationsService.createNotification(debt.userId, {
      title: '债务还款提醒',
      content: message,
      type: NotificationType.DEBT_REMINDER,
      priority: NotificationPriority.HIGH,
      link: '/debt',
    });

    // 也可以推送到 Socket
    // this.ledgerGateway.sendNotification(...) // If implemented
  }

  /**
   * 获取或创建债务专项分类
   */
  private async getOrCreateDebtCategory(userId: string, debtType: DebtType) {
    const categoryName = debtType === DebtType.BORROW ? '借入款' : '借出款';
    const categoryType = debtType === DebtType.BORROW ? CategoryType.INCOME : CategoryType.EXPENSE;

    const categories = await this.categoriesService.findAll(userId, { type: categoryType });
    let category = categories.find((c) => c.name === categoryName);

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
          sortOrder: 99, // 放在后面
        });
      } catch (err: any) {
        this.logger.error(`创建分类失败: ${err.message}`);
        category = categories.find((c) => c.name.includes('其他')) || categories[0];
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

    // 验证借款日期不能晚于当前日期
    if (createDto.loanDate && new Date(createDto.loanDate) > new Date()) {
      throw new BadRequestException('借款日期不能晚于当前日期');
    }

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

    // 记录操作日志
    await this.logRepository.save({
      action: LogAction.CREATE,
      entityType: EntityType.DEBT,
      entityId: savedDebt.id,
      newData: savedDebt,
      userId,
    });

    // --- 联动交易流水 ---
    try {
      const category = await this.getOrCreateDebtCategory(userId, createDto.debtType);
      const txType =
        createDto.debtType === DebtType.BORROW ? TransactionType.INCOME : TransactionType.EXPENSE;

      await this.transactionsService.create(userId, {
        amount: createDto.originalAmount,
        type: txType,
        categoryId: category?.id,
        transactionDate: createDto.loanDate
          ? new Date(createDto.loanDate).toISOString()
          : new Date().toISOString(),
        description: `[债务关联] ${createDto.debtType === DebtType.BORROW ? '借入' : '借出'}：${createDto.debtorName}${createDto.description ? ' - ' + createDto.description : ''}`,
        paymentMethod: createDto.paymentMethod || PaymentMethod.OTHER,
        metadata: {
          debtId: savedDebt.id,
          isDebtLink: true,
        },
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
  async findAll(userId: string, query: DebtQueryDto): Promise<any[]> {
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

    const debts = await queryBuilder.getMany();

    return debts.map((debt) => ({
      ...debt,
      paidPercentage: this.calculatePaidPercentage(debt),
      isOverdue: this.isOverdue(debt),
      accumulatedInterest: this.calculateAccumulatedInterest(debt),
    }));
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
      accumulatedInterest: this.calculateAccumulatedInterest(debt),
    };
  }

  /**
   * 计算累积利息
   */
  private calculateAccumulatedInterest(debt: Debt): number {
    if (!debt.interestRate || Number(debt.interestRate) <= 0) return 0;
    if (debt.status === DebtStatus.PAID) return 0; // 已还清则不再计算利息（或显示为0）

    // 使用借款日期计算利息，如果不存在则退而求其次使用创建日期
    const baseDate = debt.loanDate || debt.createdAt;
    if (!baseDate) return 0;

    // 将起始日期和当前日期都标准化为当天 00:00:00 进行计算，排除时分秒干扰
    const now = new Date();
    now.setHours(0, 0, 0, 0);

    const startDate = new Date(baseDate);
    startDate.setHours(0, 0, 0, 0);

    // 计算天数差异：只有日期跨度达到 24 小时的整数倍才算一天
    const diffTime = now.getTime() - startDate.getTime();
    const diffDays = Math.max(0, Math.floor(diffTime / (1000 * 60 * 60 * 24)));

    // 简单利息计算：剩余本金 * 年利率 * (天数/365)
    // interestRate 是百分比，所以要除以 100
    const interest =
      Number(debt.remainingAmount) * (Number(debt.interestRate) / 100) * (diffDays / 365);

    return Number(interest.toFixed(2));
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

    // 记录旧数据用于日志
    const oldData = { ...debt };

    if (updateDto.originalAmount !== undefined) {
      const newOriginalAmount = Number(updateDto.originalAmount);
      const totalPaid = Number(debt.totalPaid || 0);

      this.logger.log(
        `债务金额更新请求: id=${id}, oldOriginal=${Number(debt.originalAmount)}, newOriginal=${newOriginalAmount}, totalPaid=${totalPaid}`,
      );

      if (Number.isNaN(newOriginalAmount) || newOriginalAmount <= 0) {
        throw new BadRequestException('原始金额无效');
      }

      if (newOriginalAmount < totalPaid) {
        throw new BadRequestException('原始金额不能小于已还金额');
      }

      (updateDto as any).originalAmount = newOriginalAmount;
      (updateDto as any).remainingAmount = Math.max(0, newOriginalAmount - totalPaid);

      const remaining = Number((updateDto as any).remainingAmount);
      if (remaining === 0) {
        (updateDto as any).status = DebtStatus.PAID;
        (updateDto as any).paidDate = new Date();
      } else if (!updateDto.status) {
        (updateDto as any).status = totalPaid > 0 ? DebtStatus.PARTIAL : DebtStatus.PENDING;
        (updateDto as any).paidDate = null;
      }

      this.logger.log(
        `债务金额已重算: id=${id}, remaining=${Number((updateDto as any).remainingAmount)}, status=${(updateDto as any).status}`,
      );
    }

    if (updateDto.status && updateDto.status === DebtStatus.PAID) {
      (updateDto as any).remainingAmount = 0;
      (updateDto as any).paidDate = new Date();
    }

    // 乐观锁校验
    if (updateDto.version !== undefined && debt.version !== updateDto.version) {
      throw new OptimisticLockVersionMismatchError('Debt', updateDto.version, debt.version);
    }

    // 记录是否更改了借款日期（用于联动交易日期）
    let loanDateChanged = false;
    if (updateDto.loanDate !== undefined) {
      try {
        const nextLoanDate = new Date(updateDto.loanDate);
        const prevLoanDate = debt.loanDate ? new Date(debt.loanDate) : null;
        if (!Number.isNaN(nextLoanDate.getTime())) {
          if (!prevLoanDate || !this.isSameDay(nextLoanDate, prevLoanDate)) {
            loanDateChanged = true;
          }
        }
      } catch {}
    }

    // 移除 version，防止 Object.assign 覆盖实体中的 version，让 TypeORM 自动管理
    const { version: _version, ...updateData } = updateDto;

    // 使用事务保证一致性：更新债务 + 联动更新交易日期
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();
    let updatedDebt: Debt;
    try {
      Object.assign(debt, updateData);
      updatedDebt = await queryRunner.manager.getRepository(Debt).save(debt);

      const shouldSyncLinkedTx =
        updateDto.originalAmount !== undefined ||
        updateDto.debtorName !== undefined ||
        updateDto.description !== undefined ||
        updateDto.paymentMethod !== undefined ||
        loanDateChanged;

      if (shouldSyncLinkedTx) {
        const txRepo = queryRunner.manager.getRepository(Transaction);
        const linkedTxs = await txRepo.find({
          where: {
            userId,
            // metadata 包含 debtId 且不包含 paymentId
            metadata: Not(IsNull()),
          },
        });
        for (const tx of linkedTxs) {
          const meta = tx.metadata || {};
          if (meta.debtId !== updatedDebt.id || meta.paymentId) continue;
          let changed = false;
          const debtLabel = updatedDebt.debtType === DebtType.BORROW ? '借入' : '借出';
          const nextDescription = `[债务关联] ${debtLabel}：${updatedDebt.debtorName}${updatedDebt.description ? ' - ' + updatedDebt.description : ''}`;
          if ((tx.description || '') !== nextDescription) {
            tx.description = nextDescription;
            changed = true;
          }
          const nextAmount = Number(updatedDebt.originalAmount);
          if (Number(tx.amount) !== nextAmount) {
            (tx as any).amount = nextAmount as any;
            changed = true;
          }
          const nextMethod = (updatedDebt.paymentMethod ||
            PaymentMethod.OTHER) as unknown as TxPaymentMethod;
          if (tx.paymentMethod !== nextMethod) {
            tx.paymentMethod = nextMethod;
            changed = true;
          }
          if (loanDateChanged && updatedDebt.loanDate) {
            const nextDate = new Date(updatedDebt.loanDate);
            if (!Number.isNaN(nextDate.getTime())) {
              const currentTime = tx.transactionDate ? new Date(tx.transactionDate).getTime() : 0;
              if (currentTime !== nextDate.getTime()) {
                tx.transactionDate = nextDate;
                changed = true;
              }
            }
          }
          if (changed) {
            const saved = await txRepo.save(tx);
            this.ledgerGateway.notifyUpdate(saved.ledgerId, 'TRANSACTION_UPDATED', saved, userId);
          }
        }
      }

      await queryRunner.commitTransaction();
    } catch (err) {
      await queryRunner.rollbackTransaction();
      throw err;
    } finally {
      await queryRunner.release();
    }

    // 记录操作日志
    await this.logRepository.save({
      action: LogAction.UPDATE,
      entityType: EntityType.DEBT,
      entityId: updatedDebt.id,
      oldData: oldData,
      newData: updatedDebt,
      changedFields: Object.keys(updateData),
      userId,
    });

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

    // 状态确认：仅允许删除已还清或已关闭的债务
    if (debt.status !== DebtStatus.PAID) {
      const remain = Number(debt.remainingAmount || 0);
      if (remain > 0) {
        throw new BadRequestException(
          '该债务尚未结清，无法删除。请先确认还款或将状态设置为已还清。',
        );
      }
    }

    await this.debtRepository.remove(debt);
    this.logger.log(`债务删除成功: ${id}`);

    // 记录操作日志
    await this.logRepository.save({
      action: LogAction.DELETE,
      entityType: EntityType.DEBT,
      entityId: id,
      oldData: debt,
      userId,
    });

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
   * 更新还款记录 (主要用于确认待还款)
   */
  async updatePayment(
    userId: string,
    debtId: string,
    paymentId: string,
    updateDto: UpdatePaymentDto,
  ): Promise<DebtPayment> {
    const payment = await this.paymentRepository.findOne({
      where: { id: paymentId, debtId, userId },
      relations: ['debt'],
    });

    if (!payment) {
      throw new NotFoundException('还款记录不存在');
    }

    const oldAmount = Number(payment.amount);
    const oldStatus = payment.status;
    const newAmount = updateDto.amount !== undefined ? Number(updateDto.amount) : oldAmount;
    const newStatus = updateDto.status || oldStatus;

    if (
      oldStatus === PaymentStatus.PENDING &&
      newStatus === PaymentStatus.CONFIRMED &&
      newAmount <= 0
    ) {
      throw new BadRequestException('确认还款时金额必须大于0');
    }

    if (updateDto.paymentDate) {
      this.assertPaymentDateNotFuture(userId, debtId, updateDto.paymentDate);
    }

    // 更新字段
    Object.assign(payment, updateDto);
    if (updateDto.paymentDate) {
      payment.paymentDate = new Date(updateDto.paymentDate);
    }
    payment.status = newStatus;

    // 如果状态从 PENDING 变为 CONFIRMED，需要更新债务余额
    if (oldStatus === PaymentStatus.PENDING && newStatus === PaymentStatus.CONFIRMED) {
      const debt = payment.debt;
      const amountToDeduct = newAmount; // 待还款记录原本金额可能是0，或者是预计金额。确认时以实际金额为准。

      const newRemaining = Number(debt.remainingAmount) - amountToDeduct;

      if (newRemaining <= 0) {
        debt.status = DebtStatus.PAID;
        debt.remainingAmount = 0;
        debt.paidDate = new Date();
      } else {
        debt.status = DebtStatus.PARTIAL;
        debt.remainingAmount = newRemaining;
      }

      debt.totalPaid = Number(debt.totalPaid) + amountToDeduct;
      debt.paymentCount = (debt.paymentCount || 0) + 1;

      await this.debtRepository.save(debt);

      // --- 联动交易流水 (仅在确认时生成) ---
      try {
        const oppositeType = debt.debtType === DebtType.BORROW ? DebtType.LEND : DebtType.BORROW;
        const category = await this.getOrCreateDebtCategory(userId, oppositeType);
        const txType =
          debt.debtType === DebtType.BORROW ? TransactionType.EXPENSE : TransactionType.INCOME;

        await this.transactionsService.create(userId, {
          amount: newAmount,
          type: txType,
          categoryId: category?.id,
          transactionDate: payment.paymentDate.toISOString(),
          description: `[债务关联] ${debt.debtType === DebtType.BORROW ? '偿还' : '收回'}债务：${debt.debtorName}${payment.note ? ' - ' + payment.note : ''}`,
          paymentMethod: payment.paymentMethod || PaymentMethod.OTHER,
          metadata: {
            debtId: debt.id,
            paymentId: payment.id,
            debtorName: debt.debtorName,
          },
        });
      } catch (e: any) {
        this.logger.error(`同步交易流水失败: ${e?.message || e}`);
      }
    }

    const savedPayment = await this.paymentRepository.save(payment);
    this.logger.log(`还款记录更新成功: ${payment.id}`);

    await this.logRepository.save({
      action: LogAction.UPDATE,
      entityType: EntityType.DEBT_PAYMENT,
      entityId: savedPayment.id,
      oldData: { amount: oldAmount, status: oldStatus },
      newData: savedPayment,
      changedFields: Object.keys(updateDto || {}),
      userId,
    });

    this.ledgerGateway.notifyUpdate(
      null,
      'DEBT_PAYMENT_UPDATED',
      { debtId, payment: savedPayment },
      userId,
    );

    return savedPayment;
  }

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

    this.assertPaymentDateNotFuture(userId, debtId, paymentDto.paymentDate);
    const paymentDate = new Date(paymentDto.paymentDate);

    const payment = this.paymentRepository.create({
      ...paymentDto,
      userId,
      debtId,
      paymentDate,
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

    // 记录操作日志
    await this.logRepository.save({
      action: LogAction.CREATE,
      entityType: EntityType.DEBT_PAYMENT,
      entityId: savedPayment.id,
      newData: savedPayment,
      userId,
    });

    // --- 联动交易流水 ---
    try {
      // 还款时的交易类型与借入/借出相反
      // 借入(BORROW)还款 -> 支出(EXPENSE)
      // 借出(LEND)收款 -> 收入(INCOME)
      const oppositeType = debt.debtType === DebtType.BORROW ? DebtType.LEND : DebtType.BORROW;
      const category = await this.getOrCreateDebtCategory(userId, oppositeType);
      const txType =
        debt.debtType === DebtType.BORROW ? TransactionType.EXPENSE : TransactionType.INCOME;

      await this.transactionsService.create(userId, {
        amount: paymentDto.amount,
        type: txType,
        categoryId: category?.id,
        transactionDate: paymentDate.toISOString(),
        description: `[债务关联] ${debt.debtType === DebtType.BORROW ? '偿还' : '收回'}债务：${debt.debtorName}${paymentDto.note ? ' - ' + paymentDto.note : ''}`,
        paymentMethod: paymentDto.paymentMethod || PaymentMethod.OTHER,
        metadata: {
          debtId: debt.id,
          paymentId: savedPayment.id,
          isDebtLink: true,
        },
      });
      this.logger.log(`已自动生成债务还款关联交易流水: PaymentID=${savedPayment.id}`);
    } catch (txError: any) {
      this.logger.error(`生成债务还款关联交易流水失败: ${txError.message}`);
    }

    // 发送实时更新通知
    this.ledgerGateway.notifyUpdate(
      null,
      'DEBT_PAYMENT_ADDED',
      { debtId, payment: savedPayment },
      userId,
    );

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

    // 记录操作日志
    await this.logRepository.save({
      action: LogAction.DELETE,
      entityType: EntityType.DEBT_PAYMENT,
      entityId: paymentId,
      oldData: payment,
      userId,
    });

    // --- 联动删除交易流水 ---
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
  async syncAllToTransactions(
    userId: string,
  ): Promise<{ debtsSynced: number; paymentsSynced: number }> {
    this.logger.log(`用户 ${userId} 触发全量债务交易同步`);

    const debts = await this.debtRepository.find({
      where: { userId },
      relations: ['payments'],
    });

    let debtsSynced = 0;
    let paymentsSynced = 0;

    for (const debt of debts) {
      // 1. 同步债务本身
      const debtExists = await this.transactionsService.existsLinkedTransaction(userId, {
        debtId: debt.id,
      });
      try {
        const debtLabel = debt.debtType === DebtType.BORROW ? '借入' : '借出';
        const canonicalDescription = `[债务关联] ${debtLabel}：${debt.debtorName}${debt.description ? ' - ' + debt.description : ''}`;
        const canonicalPaymentMethod = debt.paymentMethod || PaymentMethod.OTHER;

        if (!debtExists) {
          const category = await this.getOrCreateDebtCategory(userId, debt.debtType);
          const txType =
            debt.debtType === DebtType.BORROW ? TransactionType.INCOME : TransactionType.EXPENSE;

          await this.transactionsService.create(userId, {
            amount: Number(debt.originalAmount),
            type: txType,
            categoryId: category?.id,
            transactionDate: (debt.loanDate
              ? new Date(debt.loanDate)
              : debt.createdAt
            ).toISOString(),
            description: canonicalDescription,
            paymentMethod: canonicalPaymentMethod,
            metadata: {
              debtId: debt.id,
              isDebtLink: true,
            },
          });
          debtsSynced++;
        } else {
          const { updatedCount } = await this.transactionsService.updateLinkedDebtEntryTransaction(
            userId,
            debt.id,
            {
              amount: Number(debt.originalAmount),
              description: canonicalDescription,
              paymentMethod: canonicalPaymentMethod,
              transactionDate: (debt.loanDate
                ? new Date(debt.loanDate)
                : debt.createdAt
              ).toISOString(),
            },
          );
          debtsSynced += updatedCount;
        }
      } catch (err: any) {
        this.logger.error(`同步债务 ${debt.id} 失败: ${err.message}`);
      }

      // 2. 同步还款记录
      if (debt.payments && debt.payments.length > 0) {
        for (const payment of debt.payments) {
          const paymentExists = await this.transactionsService.existsLinkedTransaction(userId, {
            paymentId: payment.id,
          });
          try {
            const paymentLabel = debt.debtType === DebtType.BORROW ? '偿还' : '收回';
            const canonicalDescription = `[债务关联] ${paymentLabel}债务：${debt.debtorName}${payment.note ? ' - ' + payment.note : ''}`;
            const canonicalPaymentMethod = payment.paymentMethod || PaymentMethod.OTHER;
            const canonicalDate = payment.paymentDate.toISOString();

            if (!paymentExists) {
              const oppositeType =
                debt.debtType === DebtType.BORROW ? DebtType.LEND : DebtType.BORROW;
              const category = await this.getOrCreateDebtCategory(userId, oppositeType);
              const txType =
                debt.debtType === DebtType.BORROW
                  ? TransactionType.EXPENSE
                  : TransactionType.INCOME;

              await this.transactionsService.create(userId, {
                amount: Number(payment.amount),
                type: txType,
                categoryId: category?.id,
                transactionDate: canonicalDate,
                description: canonicalDescription,
                paymentMethod: canonicalPaymentMethod,
                metadata: {
                  debtId: debt.id,
                  paymentId: payment.id,
                  isDebtLink: true,
                },
              });
              paymentsSynced++;
            } else {
              const { updatedCount } =
                await this.transactionsService.updateLinkedPaymentTransactions(userId, payment.id, {
                  amount: Number(payment.amount),
                  description: canonicalDescription,
                  paymentMethod: canonicalPaymentMethod,
                  transactionDate: canonicalDate,
                });
              paymentsSynced += updatedCount;
            }
          } catch (err: any) {
            this.logger.error(`同步还款 ${payment.id} 失败: ${err.message}`);
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
    let totalAccruedInterest = 0;

    for (const debt of debts) {
      if (debt.debtType === DebtType.BORROW) {
        totalBorrowed += Number(debt.remainingAmount);
      } else {
        totalLent += Number(debt.remainingAmount);
      }

      if (debt.status !== DebtStatus.PAID) {
        pendingDebts++;
        totalPendingAmount += Number(debt.remainingAmount);

        // 累加未结清利息
        totalAccruedInterest += this.calculateAccumulatedInterest(debt);

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
      totalAccruedInterest,
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
