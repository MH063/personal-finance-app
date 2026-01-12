import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Between, MoreThanOrEqual, LessThanOrEqual } from 'typeorm';
import {
  subDays,
  subMonths,
  startOfMonth,
  endOfMonth,
  format,
  startOfQuarter,
  endOfQuarter,
  startOfYear,
  endOfYear,
  eachMonthOfInterval,
} from 'date-fns';
import { Transaction, TransactionType } from '../entities/transaction.entity';
import { Debt, DebtType, DebtStatus } from '../entities/debt.entity';
import { Budget } from '../entities/budget.entity';
import {
  StatisticsQueryDto,
  ChartQueryDto,
  HealthQueryDto,
  ExportReportDto,
  OverviewData,
  MonthlyTrend,
  CategoryBreakdown,
  FinancialHealth,
} from './dto/statistics.dto';

@Injectable()
export class StatisticsService {
  private readonly logger = new Logger(StatisticsService.name);

  constructor(
    @InjectRepository(Transaction)
    private readonly transactionRepository: Repository<Transaction>,
    @InjectRepository(Debt)
    private readonly debtRepository: Repository<Debt>,
    @InjectRepository(Budget)
    private readonly budgetRepository: Repository<Budget>,
  ) {}

  /**
   * 获取财务概览数据
   */
  async getOverview(userId: string, query: StatisticsQueryDto): Promise<OverviewData> {
    const range = await this.resolveDateRange(userId, query);
    const { startDate, endDate } = range;
    const type = (query as any).type;
    const categoryId = (query as any).categoryId;

    this.logger.log(`获取概览数据: ${userId}, ${startDate} - ${endDate}`);

    const whereConditions: any = {
      userId,
      isDeleted: false,
      transactionDate: Between(startDate, endDate),
    };

    if (type) {
      whereConditions.type = type;
    }

    if (categoryId) {
      whereConditions.categoryId = categoryId;
    }

    const transactions = await this.transactionRepository.find({
      where: whereConditions,
      relations: ['category'],
      order: { transactionDate: 'ASC' },
    });

    let totalIncome = 0;
    let totalExpense = 0;
    let incomeCount = 0;
    let expenseCount = 0;
    const categoryMap = new Map<
      string,
      { amount: number; count: number; color: string; name: string; type: TransactionType }
    >();
    const monthlyData = new Map<string, { income: number; expense: number; count: number }>();

    // 初始化日期范围内的所有月份，确保趋势图完整
    const allMonths = eachMonthOfInterval({ start: startDate, end: endDate });
    allMonths.forEach(date => {
      const monthKey = format(date, 'yyyy-MM');
      monthlyData.set(monthKey, { income: 0, expense: 0, count: 0 });
    });

    for (const transaction of transactions) {
      if (transaction.type === TransactionType.INCOME) {
        totalIncome += Number(transaction.amount);
        incomeCount++;
      } else {
        totalExpense += Number(transaction.amount);
        expenseCount++;
      }

      const monthKey = format(new Date(transaction.transactionDate), 'yyyy-MM');
      if (!monthlyData.has(monthKey)) {
        monthlyData.set(monthKey, { income: 0, expense: 0, count: 0 });
      }
      const monthData = monthlyData.get(monthKey)!;
      monthData.count++;

      if (transaction.type === TransactionType.INCOME) {
        monthData.income += Number(transaction.amount);
      } else {
        monthData.expense += Number(transaction.amount);
      }

      if (transaction.categoryId) {
        const existing = categoryMap.get(transaction.categoryId) || {
          amount: 0,
          count: 0,
          color: '#8C8C8C',
          name: '未分类',
          type: transaction.type,
        };
        existing.amount += Number(transaction.amount);
        existing.count++;
        if (transaction.category) {
          existing.color = transaction.category.color;
          existing.name = transaction.category.name;
        }
        categoryMap.set(transaction.categoryId, existing);
      }
    }

    const totalAmount = totalIncome + totalExpense;
    const categoryBreakdown: CategoryBreakdown[] = Array.from(categoryMap.entries())
      .map(([id, data]) => ({
        categoryId: id,
        categoryName: data.name,
        categoryColor: data.color,
        amount: data.amount,
        percentage: totalAmount > 0 ? Number(((data.amount / totalAmount) * 100).toFixed(2)) : 0,
        transactionCount: data.count,
        trend: 0,
      }))
      .sort((a, b) => b.amount - a.amount);

    // 计算主要收入源
    const incomeCategories = Array.from(categoryMap.values())
      .filter(c => c.type === TransactionType.INCOME)
      .sort((a, b) => b.amount - a.amount);
    
    const topIncomeCategory = incomeCategories.length > 0 ? incomeCategories[0].name : '无';
    const topIncomeCategoryPercentage = (totalIncome > 0 && incomeCategories.length > 0) 
      ? Number(((incomeCategories[0].amount / totalIncome) * 100).toFixed(2)) 
      : 0;

    // 计算最大开支项
    const expenseCategories = Array.from(categoryMap.values())
      .filter(c => c.type === TransactionType.EXPENSE)
      .sort((a, b) => b.amount - a.amount);
    
    const topExpenseCategory = expenseCategories.length > 0 ? expenseCategories[0].name : '无';
    const topExpenseCategoryPercentage = (totalExpense > 0 && expenseCategories.length > 0) 
      ? Number(((expenseCategories[0].amount / totalExpense) * 100).toFixed(2)) 
      : 0;

    const monthlyTrends: MonthlyTrend[] = Array.from(monthlyData.entries())
      .map(([month, data]) => ({
        month,
        income: data.income,
        expense: data.expense,
        netIncome: data.income - data.expense,
        transactionCount: data.count,
      }))
      .sort((a, b) => a.month.localeCompare(b.month));

    const days = Math.ceil(
      (new Date(endDate).getTime() - new Date(startDate).getTime()) / (1000 * 60 * 60 * 24),
    );
    const averageDaily = days > 0 ? totalExpense / days : 0;

    // --- 计算同比数据 ---
    const rangeDuration = new Date(endDate).getTime() - new Date(startDate).getTime();
    const prevStartDate = new Date(new Date(startDate).getTime() - rangeDuration - 86400000); // 减去时长和一天
    const prevEndDate = new Date(new Date(startDate).getTime() - 86400000);

    const prevTransactions = await this.transactionRepository.find({
      where: {
        userId,
        isDeleted: false,
        transactionDate: Between(prevStartDate, prevEndDate),
      },
    });

    let prevTotalIncome = 0;
    let prevTotalExpense = 0;
    for (const t of prevTransactions) {
      if (t.type === TransactionType.INCOME) prevTotalIncome += Number(t.amount);
      else prevTotalExpense += Number(t.amount);
    }

    const incomeComparison = prevTotalIncome > 0 
      ? Number((((totalIncome - prevTotalIncome) / prevTotalIncome) * 100).toFixed(2))
      : totalIncome > 0 ? 100 : 0;
    
    const expenseComparison = prevTotalExpense > 0 
      ? Number((((totalExpense - prevTotalExpense) / prevTotalExpense) * 100).toFixed(2))
      : totalExpense > 0 ? 100 : 0;

    // --- 获取预算信息 ---
    const budgets = await this.budgetRepository.find({
      where: {
        userId,
        startDate: LessThanOrEqual(endDate),
        endDate: MoreThanOrEqual(startDate),
      },
    });

    let budgetInfo = null;
    if (budgets.length > 0) {
      const totalBudget = budgets.reduce((sum, b) => sum + Number(b.amount), 0);
      // 这里简化处理：预算使用额通常在前端通过分类匹配计算更准，
      // 但在概览中，我们计算本期内这些预算对应分类的总支出
      const budgetCategoryIds = budgets.map(b => b.categoryId).filter(id => !!id);
      
      let usedBudget = 0;
      if (budgetCategoryIds.length > 0) {
        usedBudget = transactions
          .filter(t => t.type === TransactionType.EXPENSE && budgetCategoryIds.includes(t.categoryId))
          .reduce((sum, t) => sum + Number(t.amount), 0);
      } else {
        // 如果没有指定分类，则视为总支出预算
        usedBudget = totalExpense;
      }

      budgetInfo = {
        totalBudget,
        usedBudget,
        remainingBudget: Math.max(0, totalBudget - usedBudget),
        usagePercentage: totalBudget > 0 ? Number(((usedBudget / totalBudget) * 100).toFixed(2)) : 0,
      };
    }

    return {
      totalIncome,
      totalExpense,
      netIncome: totalIncome - totalExpense,
      transactionCount: transactions.length,
      averageDaily,
      categoryBreakdown,
      monthlyTrends,
      incomeComparison,
      expenseComparison,
      incomeCount,
      expenseCount,
      topIncomeCategory,
      topIncomeCategoryPercentage,
      topExpenseCategory,
      topExpenseCategoryPercentage,
      budgetInfo,
    };
  }

  /**
   * 获取图表数据
   */
  async getChartData(userId: string, query: ChartQueryDto) {
    const { startDate, endDate } = await this.resolveDateRange(userId, query);

    const transactions = await this.transactionRepository.find({
      where: {
        userId,
        isDeleted: false,
        transactionDate: Between(startDate, endDate),
      },
      relations: ['category'],
      order: { transactionDate: 'ASC' },
    });

    const incomeData: { date: string; value: number }[] = [];
    const expenseData: { date: string; value: number }[] = [];
    const pieData: { name: string; value: number; color: string }[] = [];

    const categoryMap = new Map<string, number>();

    for (const transaction of transactions) {
      const date = format(new Date(transaction.transactionDate), 'yyyy-MM-dd');

      if (transaction.type === TransactionType.INCOME) {
        const existing = incomeData.find((d) => d.date === date);
        if (existing) {
          existing.value += Number(transaction.amount);
        } else {
          incomeData.push({ date, value: Number(transaction.amount) });
        }
      } else {
        const existing = expenseData.find((d) => d.date === date);
        if (existing) {
          existing.value += Number(transaction.amount);
        } else {
          expenseData.push({ date, value: Number(transaction.amount) });
        }
      }

      if (transaction.type === TransactionType.EXPENSE) {
        const categoryName = transaction.category?.name || '未分类';
        const current = categoryMap.get(categoryName) || 0;
        categoryMap.set(categoryName, current + Number(transaction.amount));
      }
    }

    categoryMap.forEach((value, name) => {
      pieData.push({ name, value, color: '#FF6B6B' });
    });

    return {
      lineChart: {
        income: incomeData.sort((a, b) => a.date.localeCompare(b.date)),
        expense: expenseData.sort((a, b) => a.date.localeCompare(b.date)),
      },
      pieChart: pieData,
    };
  }

  /**
   * 获取财务健康指标
   */
  async getFinancialHealth(userId: string, period: string = 'month'): Promise<FinancialHealth> {
    const currentPeriod = this.getPeriodRange(period, new Date());
    const previousPeriod = this.getPreviousPeriod(period, new Date());

    const [currentTransactions, previousTransactions] = await Promise.all([
      this.transactionRepository.find({
        where: {
          userId,
          isDeleted: false,
          transactionDate: Between(currentPeriod.start, currentPeriod.end),
        },
      }),
      this.transactionRepository.find({
        where: {
          userId,
          isDeleted: false,
          transactionDate: Between(previousPeriod.start, previousPeriod.end),
        },
      }),
    ]);

    let currentIncome = 0;
    let currentExpense = 0;
    let previousIncome = 0;
    let previousExpense = 0;

    for (const t of currentTransactions) {
      if (t.type === TransactionType.INCOME) {
        currentIncome += Number(t.amount);
      } else {
        currentExpense += Number(t.amount);
      }
    }

    for (const t of previousTransactions) {
      if (t.type === TransactionType.INCOME) {
        previousIncome += Number(t.amount);
      } else {
        previousExpense += Number(t.amount);
      }
    }

    const savingsRate =
      currentIncome > 0
        ? Number((((currentIncome - currentExpense) / currentIncome) * 100).toFixed(2))
        : 0;
    const expenseRatio =
      currentIncome > 0 ? Number(((currentExpense / currentIncome) * 100).toFixed(2)) : 0;
    const incomeGrowth =
      previousIncome > 0
        ? Number((((currentIncome - previousIncome) / previousIncome) * 100).toFixed(2))
        : 0;
    const expenseGrowth =
      previousExpense > 0
        ? Number((((currentExpense - previousExpense) / previousExpense) * 100).toFixed(2))
        : 0;

    let healthScore = 50;
    const recommendations: string[] = [];

    if (savingsRate >= 20) {
      healthScore += 20;
    } else if (savingsRate >= 10) {
      healthScore += 10;
      recommendations.push('建议提高储蓄率至20%以上');
    } else {
      recommendations.push('建议控制支出，增加储蓄');
    }

    if (expenseRatio <= 80) {
      healthScore += 15;
    } else {
      recommendations.push('支出占收入比例过高，建议优化消费结构');
    }

    if (incomeGrowth >= 0) {
      healthScore += 10;
    } else {
      recommendations.push('收入呈下降趋势，建议拓展收入来源');
    }

    if (expenseGrowth <= 5) {
      healthScore += 5;
    } else {
      recommendations.push('支出增长过快，请关注消费习惯');
    }

    let healthLevel = '一般';
    if (healthScore >= 80) {
      healthLevel = '优秀';
    } else if (healthScore >= 60) {
      healthLevel = '良好';
    } else if (healthScore < 40) {
      healthLevel = '需改善';
    }

    return {
      savingsRate,
      expenseRatio,
      incomeGrowth,
      expenseGrowth,
      healthScore: Math.min(healthScore, 100),
      healthLevel,
      recommendations,
    };
  }

  /**
   * 获取债务概览
   */
  async getDebtOverview(userId: string) {
    const debts = await this.debtRepository.find({
      where: { userId },
    });

    let totalBorrowed = 0;
    let totalLent = 0;
    let pendingCount = 0;
    let overdueCount = 0;

    for (const debt of debts) {
      if (debt.debtType === DebtType.BORROW) {
        totalBorrowed += Number(debt.remainingAmount);
      } else {
        totalLent += Number(debt.remainingAmount);
      }

      if (debt.status !== DebtStatus.PAID) {
        pendingCount++;
        if (debt.dueDate && new Date(debt.dueDate) < new Date()) {
          overdueCount++;
        }
      }
    }

    return {
      totalBorrowed,
      totalLent,
      netDebt: totalBorrowed - totalLent,
      pendingCount,
      overdueCount,
      borrowedCount: debts.filter((d) => d.debtType === DebtType.BORROW).length,
      lentCount: debts.filter((d) => d.debtType === DebtType.LEND).length,
    };
  }

  /**
   * 解析日期范围
   */
  private async resolveDateRange(userId: string, query: StatisticsQueryDto) {
    const { timeRange = 'month', startDate, endDate } = query;

    let start: Date;
    let end: Date = new Date();

    switch (timeRange) {
      case 'week':
        start = subDays(end, 7);
        break;
      case 'month':
        start = startOfMonth(end);
        end = endOfMonth(end);
        break;
      case 'quarter':
        start = startOfQuarter(end);
        end = endOfQuarter(end);
        break;
      case 'year':
        start = startOfYear(end);
        end = endOfYear(end);
        break;
      case 'last6months':
        start = startOfMonth(subMonths(end, 5));
        end = endOfMonth(end);
        break;
      case 'last12months':
        start = startOfMonth(subMonths(end, 11));
        end = endOfMonth(end);
        break;
      case 'custom':
        if (!startDate || !endDate) {
          throw new BadRequestException('自定义时间范围必须提供开始和结束日期');
        }
        start = new Date(startDate);
        end = new Date(endDate);
        break;
      default:
        start = startOfMonth(end);
        end = endOfMonth(end);
    }

    return { startDate: start, endDate: end };
  }

  /**
   * 获取期间范围
   */
  private getPeriodRange(period: string, date: Date): { start: Date; end: Date } {
    switch (period) {
      case 'quarter':
        return { start: startOfQuarter(date), end: endOfQuarter(date) };
      case 'year':
        return { start: startOfYear(date), end: endOfYear(date) };
      default:
        return { start: startOfMonth(date), end: endOfMonth(date) };
    }
  }

  /**
   * 获取上一期间
   */
  private getPreviousPeriod(period: string, date: Date): { start: Date; end: Date } {
    const previousDate = subMonths(date, 1);
    return this.getPeriodRange(period, previousDate);
  }
}
