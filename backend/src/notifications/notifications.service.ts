import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Transaction } from '../entities/transaction.entity';
import { Budget, BudgetStatus } from '../entities/budget.entity';
import {
  Notification,
  NotificationPriority,
  NotificationType,
} from '../entities/notification.entity';
import { LedgerGateway } from '../ledgers/ledger.gateway';
import dayjs from 'dayjs';

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(
    @InjectRepository(Transaction)
    private transactionRepository: Repository<Transaction>,
    @InjectRepository(Budget)
    private budgetRepository: Repository<Budget>,
    @InjectRepository(Notification)
    private notificationRepository: Repository<Notification>,
    private ledgerGateway: LedgerGateway,
  ) {}

  @Cron(CronExpression.EVERY_DAY_AT_9AM)
  async checkWarrantyExpirations() {
    this.logger.log('Checking warranty expirations...');
    const now = dayjs();
    const nextMonth = now.add(30, 'day');
    const todayStr = now.format('YYYY-MM-DD');
    const nextMonthStr = nextMonth.format('YYYY-MM-DD');

    // Check metadata->>'warrantyEndDate'
    const expiringTransactions = await this.transactionRepository
      .createQueryBuilder('transaction')
      .leftJoinAndSelect('transaction.user', 'user')
      .where("transaction.metadata->>'warrantyEndDate' >= :today", { today: todayStr })
      .andWhere("transaction.metadata->>'warrantyEndDate' <= :nextMonth", {
        nextMonth: nextMonthStr,
      })
      .getMany();

    for (const tx of expiringTransactions) {
      const warrantyDate = tx.metadata['warrantyEndDate'];
      const message = `您的消费 "${tx.amount}元" (日期: ${dayjs(tx.transactionDate).format('YYYY-MM-DD')}) 的保修期将于 ${warrantyDate} 到期。`;

      // Push to user's personal room
      if (tx.userId) {
        this.ledgerGateway.server.to(`user_${tx.userId}`).emit('notification', {
          type: 'warranty',
          title: '保修到期提醒',
          message,
          data: tx,
        });
        this.logger.log(`Sent warranty notification to user ${tx.userId}`);
      }
    }
  }

  async checkBudgetExceeded(userId: string, ledgerId?: string) {
    if (!userId) return;

    const now = dayjs();
    const startOfMonth = now.startOf('month').toDate();
    const endOfMonth = now.endOf('month').toDate();

    const budgets = await this.budgetRepository.find({
      where: { userId, status: BudgetStatus.ACTIVE },
    });

    if (!budgets.length) return;

    const qb = this.transactionRepository
      .createQueryBuilder('transaction')
      .select('SUM(transaction.amount)', 'totalExpense')
      .where('transaction.userId = :userId', { userId })
      .andWhere('transaction.type = :type', { type: 'expense' })
      .andWhere('transaction.transactionDate BETWEEN :start AND :end', {
        start: startOfMonth,
        end: endOfMonth,
      });
    if (ledgerId) {
      qb.andWhere('transaction.ledgerId = :ledgerId', { ledgerId });
    }
    const { totalExpense } = await qb.getRawOne();

    const expense = Number(totalExpense || 0);

    const totalBudgetAmount = budgets.reduce((sum, b) => sum + Number(b.amount || 0), 0);
    if (totalBudgetAmount > 0) {
      const threshold = totalBudgetAmount * 0.9; // 90%
      if (expense >= threshold) {
        const percent = ((expense / totalBudgetAmount) * 100).toFixed(1);
        const payload = {
          type: 'budget',
          title: '预算预警',
          message: `本月总支出已达到预算总额的 ${percent}%`,
          data: { ledgerId, expense, budget: totalBudgetAmount },
        };
        if (ledgerId) {
          this.ledgerGateway.server.to(`ledger_${ledgerId}`).emit('notification', payload);
        }
        this.ledgerGateway.server.to(`user_${userId}`).emit('notification', payload);
      }
    }
  }

  async createNotification(
    userId: string,
    dto: {
      title: string;
      content: string;
      type: NotificationType;
      priority?: NotificationPriority;
      link?: string;
    },
  ): Promise<Notification> {
    const notif = this.notificationRepository.create({
      userId,
      title: dto.title,
      content: dto.content,
      type: dto.type,
      priority: dto.priority ?? NotificationPriority.MEDIUM,
      link: dto.link,
      isRead: false,
    });
    const saved = await this.notificationRepository.save(notif);
    this.ledgerGateway.server.to(`user_${userId}`).emit('notification', {
      type: 'system',
      title: saved.title,
      message: saved.content,
      data: saved,
    });
    return saved;
  }

  async getNotifications(
    userId: string,
    query: { isRead?: boolean; limit?: number; offset?: number },
  ): Promise<{ data: Notification[]; total: number }> {
    const qb = this.notificationRepository
      .createQueryBuilder('n')
      .where('n.userId = :userId', { userId })
      .orderBy('n.createdAt', 'DESC');
    if (typeof query.isRead === 'boolean') {
      qb.andWhere('n.isRead = :isRead', { isRead: query.isRead });
    }
    const total = await qb.getCount();
    const data = await qb
      .take(query.limit ?? 20)
      .skip(query.offset ?? 0)
      .getMany();
    return { data, total };
  }

  async markAsRead(userId: string, id: string): Promise<{ updated: boolean }> {
    const result = await this.notificationRepository.update({ id, userId }, { isRead: true });
    return { updated: (result.affected || 0) > 0 };
  }

  async markAllAsRead(userId: string): Promise<{ updated: number }> {
    const result = await this.notificationRepository
      .createQueryBuilder()
      .update(Notification)
      .set({ isRead: true })
      .where('userId = :userId', { userId })
      .andWhere('isRead = false')
      .execute();
    return { updated: result.affected || 0 };
  }

  async deleteNotification(userId: string, id: string): Promise<{ deleted: boolean }> {
    const result = await this.notificationRepository.delete({ id, userId });
    return { deleted: (result.affected || 0) > 0 };
  }

  async clearReadNotifications(userId: string): Promise<{ deleted: number }> {
    const result = await this.notificationRepository
      .createQueryBuilder()
      .delete()
      .from(Notification)
      .where('userId = :userId', { userId })
      .andWhere('isRead = true')
      .execute();
    return { deleted: result.affected || 0 };
  }
}
