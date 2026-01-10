import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Between } from 'typeorm';
import { Budget, BudgetStatus } from '../entities/budget.entity';
import { Transaction, TransactionType } from '../entities/transaction.entity';
import { CreateBudgetDto, UpdateBudgetDto } from './dto/budget.dto';

@Injectable()
export class BudgetsService {
  private readonly logger = new Logger(BudgetsService.name);

  constructor(
    @InjectRepository(Budget)
    private readonly budgetRepository: Repository<Budget>,
    @InjectRepository(Transaction)
    private readonly transactionRepository: Repository<Transaction>,
  ) {}

  async create(userId: string, createBudgetDto: CreateBudgetDto): Promise<Budget> {
    this.logger.log(`用户 ${userId} 正在创建预算: ${JSON.stringify(createBudgetDto)}`);
    const { startDate, endDate } = createBudgetDto;

    if (new Date(startDate) > new Date(endDate)) {
      this.logger.warn(`创建预算失败：开始日期 ${startDate} 晚于结束日期 ${endDate}`);
      throw new BadRequestException('开始日期不能晚于结束日期');
    }

    const budget = this.budgetRepository.create({
      ...createBudgetDto,
      userId,
    });

    const savedBudget = await this.budgetRepository.save(budget);
    this.logger.log(`预算创建成功: ${savedBudget.id}`);
    return savedBudget;
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

  async update(
    userId: string,
    id: string,
    updateBudgetDto: UpdateBudgetDto,
  ): Promise<Budget> {
    this.logger.log(`用户 ${userId} 正在更新预算 ${id}: ${JSON.stringify(updateBudgetDto)}`);
    const budget = await this.findOne(userId, id);

    if (
      updateBudgetDto.startDate &&
      updateBudgetDto.endDate &&
      new Date(updateBudgetDto.startDate) > new Date(updateBudgetDto.endDate)
    ) {
      this.logger.warn(`更新预算失败：开始日期 ${updateBudgetDto.startDate} 晚于结束日期 ${updateBudgetDto.endDate}`);
      throw new BadRequestException('开始日期不能晚于结束日期');
    }

    Object.assign(budget, updateBudgetDto);
    const updatedBudget = await this.budgetRepository.save(budget);
    this.logger.log(`预算 ${id} 更新成功`);
    return updatedBudget;
  }

  async remove(userId: string, id: string): Promise<void> {
    this.logger.log(`用户 ${userId} 正在删除预算 ${id}`);
    const budget = await this.findOne(userId, id);
    await this.budgetRepository.remove(budget);
    this.logger.log(`预算 ${id} 删除成功`);
  }

  /**
   * 计算预算使用情况
   */
  private async calculateUsage(budget: Budget) {
    const transactions = await this.transactionRepository.find({
      where: {
        userId: budget.userId,
        categoryId: budget.categoryId,
        type: TransactionType.EXPENSE,
        transactionDate: Between(budget.startDate, budget.endDate),
      },
    });

    const usedAmount = transactions.reduce(
      (sum, t) => sum + Number(t.amount),
      0,
    );
    const remainingAmount = Math.max(0, budget.amount - usedAmount);
    const usagePercentage =
      budget.amount > 0 ? (usedAmount / budget.amount) * 100 : 0;

    return {
      usedAmount,
      remainingAmount,
      usagePercentage: Math.round(usagePercentage * 100) / 100,
    };
  }
}
