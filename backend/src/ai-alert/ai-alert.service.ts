import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Not, LessThanOrEqual, MoreThanOrEqual } from 'typeorm';
import * as ss from 'simple-statistics';
import { Transaction, TransactionType } from '../entities/transaction.entity';
import { Budget, BudgetStatus } from '../entities/budget.entity';
import { NotificationsService } from '../notifications/notifications.service';
import { LedgerGateway } from '../ledgers/ledger.gateway';
import { NotificationType, NotificationPriority } from '../entities/notification.entity';

@Injectable()
export class AiAlertService {
  private readonly logger = new Logger(AiAlertService.name);

  constructor(
    @InjectRepository(Transaction)
    private readonly transactionRepository: Repository<Transaction>,
    @InjectRepository(Budget)
    private readonly budgetRepository: Repository<Budget>,
    private readonly notificationsService: NotificationsService,
    private readonly ledgerGateway: LedgerGateway,
  ) {}

  /**
   * 检查交易是否异常，如果异常则发送通知
   */
  async checkAndAlert(userId: string, transaction: Transaction) {
    // 仅针对支出进行预警
    if (transaction.type !== TransactionType.EXPENSE) {
      return;
    }

    try {
      await Promise.all([
        this.checkSingleTransactionAnomaly(userId, transaction),
        this.checkMonthlyCategoryAnomaly(userId, transaction),
        this.checkBudgetOverrunPrediction(userId, transaction),
      ]);
    } catch (error) {
      this.logger.error(
        `Failed to check spending anomaly for transaction ${transaction.id}`,
        error,
      );
    }
  }

  /**
   * 检查单笔交易是否异常
   * 规则：当前交易金额 > 历史均值 + 2 * 标准差
   */
  private async checkSingleTransactionAnomaly(userId: string, currentTx: Transaction) {
    if (!currentTx.categoryId) return;

    // 获取最近 100 笔该分类支出
    const history = await this.transactionRepository.find({
      where: {
        userId,
        categoryId: currentTx.categoryId,
        type: TransactionType.EXPENSE,
        id: Not(currentTx.id),
      },
      order: { transactionDate: 'DESC' },
      take: 100,
      select: ['amount'],
    });

    if (history.length < 5) return;

    const amounts = history.map((t) => Number(t.amount));
    const mean = ss.mean(amounts);
    const stdDev = ss.standardDeviation(amounts);

    if (stdDev === 0) return;

    const threshold = mean + 2 * stdDev;
    const currentAmount = Number(currentTx.amount);

    if (currentAmount > threshold) {
      const message = `检测到一笔异常的大额支出：${currentAmount.toFixed(2)}。该分类历史均值为 ${mean.toFixed(2)}，标准差为 ${stdDev.toFixed(2)}。`;
      await this.sendNotification(
        userId,
        '大额消费预警',
        message,
        NotificationPriority.HIGH,
        currentTx.id,
      );
    }
  }

  /**
   * 检查月度累计支出是否异常
   * 规则：本月累计支出 > 历史月均值 + 2 * 标准差
   */
  private async checkMonthlyCategoryAnomaly(userId: string, currentTx: Transaction) {
    if (!currentTx.categoryId) return;

    const currentDate = new Date(currentTx.transactionDate);
    // 本月起止时间
    const startOfMonth = new Date(Date.UTC(currentDate.getFullYear(), currentDate.getMonth(), 1));
    const endOfMonth = new Date(
      Date.UTC(currentDate.getFullYear(), currentDate.getMonth() + 1, 0, 23, 59, 59, 999),
    );

    // 计算本月总支出
    const currentMonthStats = await this.transactionRepository
      .createQueryBuilder('t')
      .select('SUM(t.amount)', 'total')
      .where('t.user_id = :userId', { userId })
      .andWhere('t.category_id = :categoryId', { categoryId: currentTx.categoryId })
      .andWhere('t.type = :type', { type: TransactionType.EXPENSE })
      .andWhere('t.transaction_date BETWEEN :start AND :end', {
        start: startOfMonth,
        end: endOfMonth,
      })
      .getRawOne();

    const currentMonthTotal = Number(currentMonthStats?.total || 0);

    // 获取过去 12 个月的月度总支出 (不含本月)
    const twelveMonthsAgo = new Date(currentDate);
    twelveMonthsAgo.setMonth(twelveMonthsAgo.getMonth() - 12);

    const historyStats = await this.transactionRepository
      .createQueryBuilder('t')
      .select("TO_CHAR(t.transaction_date, 'YYYY-MM')", 'month')
      .addSelect('SUM(t.amount)', 'total')
      .where('t.user_id = :userId', { userId })
      .andWhere('t.category_id = :categoryId', { categoryId: currentTx.categoryId })
      .andWhere('t.type = :type', { type: TransactionType.EXPENSE })
      .andWhere('t.transaction_date < :startOfMonth', { startOfMonth })
      .andWhere('t.transaction_date >= :twelveMonthsAgo', { twelveMonthsAgo })
      .groupBy('month')
      .getRawMany();

    if (historyStats.length < 3) return;

    const monthlyTotals = historyStats.map((s) => Number(s.total));
    const mean = ss.mean(monthlyTotals);
    const stdDev = ss.standardDeviation(monthlyTotals);

    if (stdDev === 0) return;

    const threshold = mean + 2 * stdDev;

    // 只有当这笔交易导致越过阈值时才报警（去重策略）
    // 逻辑：(CurrentTotal - CurrentTxAmount) <= Threshold AND CurrentTotal > Threshold

    const previousTotal = currentMonthTotal - Number(currentTx.amount);

    if (currentMonthTotal > threshold && previousTotal <= threshold) {
      const message = `本月该分类累计支出 ${currentMonthTotal.toFixed(2)} 已显著超过历史平均水平 (${mean.toFixed(2)} + 2σ: ${threshold.toFixed(2)})。请注意控制开支。`;
      await this.sendNotification(
        userId,
        '消费趋势异常',
        message,
        NotificationPriority.MEDIUM,
        currentTx.id,
      );
    }
  }

  /**
   * 预算超支预测
   * 逻辑：根据当前时间进度推算月末支出，如果预计超支则预警
   */
  private async checkBudgetOverrunPrediction(userId: string, currentTx: Transaction) {
    if (!currentTx.categoryId) return;

    const txDateStr = new Date(currentTx.transactionDate).toISOString().split('T')[0];

    // 查找覆盖当前交易日期且匹配分类的活跃预算
    const budgets = await this.budgetRepository.find({
      where: {
        userId,
        categoryId: currentTx.categoryId,
        status: BudgetStatus.ACTIVE,
        startDate: LessThanOrEqual(txDateStr) as any,
        endDate: MoreThanOrEqual(txDateStr) as any,
      },
    });

    if (budgets.length === 0) return;

    for (const budget of budgets) {
      const startDate = new Date(budget.startDate);
      const endDate = new Date(budget.endDate);
      const now = new Date(); // 使用当前时间作为进度参考点，或者使用交易时间

      // 确保日期有效性
      if (startDate >= endDate) continue;

      // 计算总天数和已过天数
      const totalDuration = endDate.getTime() - startDate.getTime();
      const elapsedDuration = Math.min(
        Math.max(0, now.getTime() - startDate.getTime()),
        totalDuration,
      );

      const progress = elapsedDuration / totalDuration;

      // 仅在进度超过 20% 且不到 90% 时预测（太早预测不准，太晚预测意义不大）
      if (progress < 0.2 || progress > 0.9) continue;

      // 获取该预算周期内的已用金额
      const { sum } = await this.transactionRepository
        .createQueryBuilder('t')
        .select('SUM(t.amount)', 'sum')
        .where('t.user_id = :userId', { userId })
        .andWhere('t.category_id = :categoryId', { categoryId: budget.categoryId })
        .andWhere('t.type = :type', { type: TransactionType.EXPENSE })
        .andWhere('t.transaction_date BETWEEN :start AND :end', {
          start: new Date(startDate.setHours(0, 0, 0, 0)),
          end: new Date(endDate.setHours(23, 59, 59, 999)),
        })
        .getRawOne();

      const usedAmount = Number(sum || 0);
      const budgetAmount = Number(budget.amount);

      // 如果当前已经超支，则由常规逻辑处理（或已处理），此处不再预测
      if (usedAmount >= budgetAmount) continue;

      // 线性外推预测
      const predictedTotal = usedAmount / progress;

      // 如果预测金额超过预算 10%
      if (predictedTotal > budgetAmount * 1.1) {
        // 检查是否已经发过类似的预警（为了简化，这里暂不查重，而是依靠前端或用户自行忽略。
        // 实际生产中应该记录上次预警时间或状态，避免频繁打扰。
        // 这里采用一种简单的节流策略：只有当进度在 30%-35% 或 60%-65% 区间时才重点提醒？
        // 或者简单点：只要预测超支严重就提醒。为了体验，我们加上"预计超支金额"

        const overrunAmount = predictedTotal - budgetAmount;
        const message = `按照当前消费速度，本月该分类预计将超支 ${overrunAmount.toFixed(0)} 元 (预计总支出 ${predictedTotal.toFixed(0)} / 预算 ${budgetAmount})。建议提前规划支出。`;

        await this.sendNotification(
          userId,
          '预算超支预警',
          message,
          NotificationPriority.HIGH,
          budget.id,
        );
      }
    }
  }

  private async sendNotification(
    userId: string,
    title: string,
    content: string,
    priority: NotificationPriority,
    refId?: string,
  ) {
    const notification = await this.notificationsService.createNotification(userId, {
      title,
      content,
      type: NotificationType.BUDGET_ALERT,
      priority,
      link: refId ? `/transactions` : undefined,
    });

    this.logger.log(`发送 AI 预警通知: userId=${userId}, title=${title}`);

    // 推送新通知事件到前端
    this.ledgerGateway.notifyUpdate(null, 'NEW_NOTIFICATION', notification, userId);
  }
}
