import { Injectable, NotFoundException, BadRequestException, Logger, Inject } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import {
  Repository,
  Between,
  In,
  TreeRepository,
  OptimisticLockVersionMismatchError,
} from 'typeorm';
import { format } from 'date-fns';
import { Budget } from '../entities/budget.entity';
import { Transaction, TransactionType } from '../entities/transaction.entity';
import { Category } from '../entities/category.entity';
import { CreateBudgetDto, UpdateBudgetDto } from './dto/budget.dto';
import { BudgetPeriod } from './dto/budget.dto';
import { LedgerGateway } from '../ledgers/ledger.gateway';
import { StatisticsService } from '../statistics/statistics.service';
import Redis from 'ioredis';
import { TransactionLog, LogAction, EntityType } from '../entities/transaction-log.entity';

@Injectable()
export class BudgetsService {
  private readonly logger = new Logger(BudgetsService.name);

  constructor(
    @InjectRepository(Budget)
    private readonly budgetRepository: Repository<Budget>,
    @InjectRepository(Transaction)
    private readonly transactionRepository: Repository<Transaction>,
    @InjectRepository(Category)
    private readonly categoryRepository: TreeRepository<Category>,
    @InjectRepository(TransactionLog)
    private readonly logRepository: Repository<TransactionLog>,
    private readonly ledgerGateway: LedgerGateway,
    private readonly statisticsService: StatisticsService,
    @Inject('REDIS_CLIENT')
    private readonly redis: Redis,
  ) {}

  async create(userId: string, createBudgetDto: CreateBudgetDto): Promise<Budget> {
    this.logger.log(`用户 ${userId} 正在创建预算: ${JSON.stringify(createBudgetDto)}`);
    const { startDate, endDate } = createBudgetDto;

    if (new Date(startDate) > new Date(endDate)) {
      this.logger.warn(`创建预算失败：开始日期 ${startDate} 晚于结束日期 ${endDate}`);
      throw new BadRequestException('开始日期不能晚于结束日期');
    }
    // 校验周期边界
    if (!this.validatePeriodBoundary(createBudgetDto.period, startDate, endDate)) {
      throw new BadRequestException('预算周期与起止日期不匹配（需对齐月/季/年自然边界）');
    }

    const budget = this.budgetRepository.create({
      ...createBudgetDto,
      userId,
    });

    const savedBudget = await this.budgetRepository.save(budget);
    this.logger.log(`预算创建成功: ${savedBudget.id}`);
    await this.logRepository.save({
      action: LogAction.CREATE,
      entityType: EntityType.BUDGET,
      entityId: savedBudget.id,
      newData: savedBudget as any,
      userId,
    });

    // 发送实时更新通知
    this.ledgerGateway.notifyUpdate(null, 'BUDGET_CREATED', savedBudget, userId);
    // 失效统计缓存，确保概览预算信息实时更新
    this.invalidateStatistics(userId);
    this.bumpNlqVersion(userId);

    return savedBudget;
  }

  /**
   * 校验预算周期边界
   */
  private validatePeriodBoundary(
    period: BudgetPeriod,
    startDate: string,
    endDate: string,
  ): boolean {
    try {
      const s = new Date(startDate);
      const e = new Date(endDate);
      s.setHours(0, 0, 0, 0);
      e.setHours(0, 0, 0, 0);
      if (period === BudgetPeriod.MONTH) {
        const monthStart = new Date(s.getFullYear(), s.getMonth(), 1);
        const monthEnd = new Date(s.getFullYear(), s.getMonth() + 1, 0);
        return s.getTime() === monthStart.getTime() && e.getTime() === monthEnd.getTime();
      }
      if (period === BudgetPeriod.QUARTER) {
        const q = Math.floor(s.getMonth() / 3);
        const quarterStart = new Date(s.getFullYear(), q * 3, 1);
        const quarterEnd = new Date(s.getFullYear(), q * 3 + 3, 0);
        return s.getTime() === quarterStart.getTime() && e.getTime() === quarterEnd.getTime();
      }
      if (period === BudgetPeriod.YEAR) {
        const yearStart = new Date(s.getFullYear(), 0, 1);
        const yearEnd = new Date(s.getFullYear(), 12, 0);
        return s.getTime() === yearStart.getTime() && e.getTime() === yearEnd.getTime();
      }
      return false;
    } catch {
      return false;
    }
  }

  async findAll(userId: string): Promise<any[]> {
    this.logger.log(`获取用户 ${userId} 的所有预算列表`);
    const budgets = await this.budgetRepository.find({
      where: { userId },
      relations: ['category'],
      order: { startDate: 'DESC' },
    });

    // 计算每个预算的使用情况
    return await Promise.all(
      budgets.map(async (budget) => {
        const usage = await this.calculateUsage(budget);
        return {
          ...budget,
          ...usage,
        };
      }),
    );
  }

  async findOne(userId: string, id: string): Promise<any> {
    const budget = await this.budgetRepository.findOne({
      where: { id, userId },
      relations: ['category'],
    });

    if (!budget) {
      throw new NotFoundException('未找到该预算记录');
    }

    const usage = await this.calculateUsage(budget);
    return {
      ...budget,
      ...usage,
    };
  }

  async update(userId: string, id: string, updateBudgetDto: UpdateBudgetDto): Promise<Budget> {
    this.logger.log(`用户 ${userId} 正在更新预算 ${id}: ${JSON.stringify(updateBudgetDto)}`);
    const budget = await this.findOne(userId, id);

    if (
      updateBudgetDto.startDate &&
      updateBudgetDto.endDate &&
      new Date(updateBudgetDto.startDate) > new Date(updateBudgetDto.endDate)
    ) {
      this.logger.warn(
        `更新预算失败：开始日期 ${updateBudgetDto.startDate} 晚于结束日期 ${updateBudgetDto.endDate}`,
      );
      throw new BadRequestException('开始日期不能晚于结束日期');
    }

    // 乐观锁校验
    if (updateBudgetDto.version !== undefined && budget.version !== updateBudgetDto.version) {
      throw new OptimisticLockVersionMismatchError(
        'Budget',
        updateBudgetDto.version,
        budget.version,
      );
    }

    // 移除 version，防止 Object.assign 覆盖实体中的 version，让 TypeORM 自动管理
    const updateData: Partial<UpdateBudgetDto> = { ...updateBudgetDto };
    delete (updateData as any).version;
    Object.assign(budget, updateData);
    const updatedBudget = await this.budgetRepository.save(budget);
    this.logger.log(`预算 ${id} 更新成功`);
    await this.logRepository.save({
      action: LogAction.UPDATE,
      entityType: EntityType.BUDGET,
      entityId: id,
      oldData: {} as any,
      newData: updatedBudget as any,
      changedFields: Object.keys(updateData),
      userId,
    });

    // 发送实时更新通知
    this.ledgerGateway.notifyUpdate(null, 'BUDGET_UPDATED', updatedBudget, userId);
    // 失效统计缓存，确保概览预算信息实时更新
    this.invalidateStatistics(userId);
    this.bumpNlqVersion(userId);

    return updatedBudget;
  }

  async remove(userId: string, id: string): Promise<void> {
    this.logger.log(`用户 ${userId} 正在删除预算 ${id}（保留历史记录，置为无效）`);
    const budget = await this.findOne(userId, id);
    // 逻辑删除：保留历史记录，仅将状态置为 INACTIVE
    budget.status = 'inactive' as any;
    const updated = await this.budgetRepository.save(budget);
    this.logger.log(`预算 ${id} 已置为无效（历史保留）`);
    await this.logRepository.save({
      action: LogAction.DELETE,
      entityType: EntityType.BUDGET,
      entityId: id,
      oldData: budget as any,
      newData: updated as any,
      userId,
    });

    // 发送实时更新通知
    this.ledgerGateway.notifyUpdate(null, 'BUDGET_DELETED', { id, inactive: true }, userId);
    // 失效统计缓存，确保概览预算信息实时更新
    this.invalidateStatistics(userId);
  }

  /**
   * 计算预算使用情况
   */
  private async calculateUsage(budget: Budget) {
    // 获取分类及其所有子分类的 ID
    const categoryIds = [budget.categoryId];
    try {
      const category = await this.categoryRepository.findOne({
        where: { id: budget.categoryId },
      });
      if (category) {
        const descendants = await this.categoryRepository.findDescendants(category);
        descendants.forEach((d) => {
          if (!categoryIds.includes(d.id)) {
            categoryIds.push(d.id);
          }
        });
      }
    } catch (err: any) {
      this.logger.warn(`获取分类 ${budget.categoryId} 的子分类失败: ${err?.message || '未知错误'}`);
    }

    // 将日期转换为当天开始和结束时间，以确保包含整天的数据
    // budget.startDate 和 budget.endDate 是 DATE 类型，通常为 'YYYY-MM-DD' 字符串或对应的 Date 对象
    const startDateStr =
      typeof budget.startDate === 'string'
        ? budget.startDate
        : format(budget.startDate, 'yyyy-MM-dd');
    const endDateStr =
      typeof budget.endDate === 'string' ? budget.endDate : format(budget.endDate, 'yyyy-MM-dd');

    const startOfDay = `${startDateStr} 00:00:00`;
    const endOfDay = `${endDateStr} 23:59:59.999`;

    const transactions = await this.transactionRepository.find({
      where: {
        userId: budget.userId,
        categoryId: In(categoryIds),
        type: TransactionType.EXPENSE,
        transactionDate: Between(startOfDay, endOfDay) as any,
      },
    });

    this.logger.debug(`找到 ${transactions.length} 笔相关交易`);

    const usedAmount = transactions.reduce((sum, t) => sum + Number(t.amount), 0);
    const remainingAmount = Math.max(0, budget.amount - usedAmount);
    const usagePercentage = budget.amount > 0 ? (usedAmount / budget.amount) * 100 : 0;

    return {
      usedAmount,
      remainingAmount,
      usagePercentage: Math.round(usagePercentage * 100) / 100,
    };
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
