import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, MoreThanOrEqual, LessThanOrEqual, TreeRepository } from 'typeorm';
import { Workbook } from 'exceljs';
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
import { Budget, BudgetStatus } from '../entities/budget.entity';
import { Category } from '../entities/category.entity';
import {
  StatisticsQueryDto,
  ChartQueryDto,
  OverviewData,
  MonthlyTrend,
  CategoryBreakdown,
  FinancialHealth,
} from './dto/statistics.dto';

@Injectable()
export class StatisticsService {
  private readonly logger = new Logger(StatisticsService.name);

  // Simple in-memory cache
  private cache = new Map<string, { data: any; timestamp: number }>();
  private readonly CACHE_TTL = 5 * 60 * 1000; // 5 minutes

  constructor(
    @InjectRepository(Transaction)
    private readonly transactionRepository: Repository<Transaction>,
    @InjectRepository(Debt)
    private readonly debtRepository: Repository<Debt>,
    @InjectRepository(Budget)
    private readonly budgetRepository: Repository<Budget>,
    @InjectRepository(Category)
    private readonly categoryRepository: TreeRepository<Category>,
  ) {}

  /**
   * Helper to get/set cache
   */
  private async getCached<T>(key: string, fetcher: () => Promise<T>): Promise<T> {
    const cached = this.cache.get(key);
    if (cached && Date.now() - cached.timestamp < this.CACHE_TTL) {
      return cached.data;
    }
    const data = await fetcher();
    this.cache.set(key, { data, timestamp: Date.now() });
    return data;
  }

  /**
   * 失效指定用户的统计缓存
   */
  public invalidateUserCache(userId: string): void {
    try {
      let removed = 0;
      const prefixes = [`overview:${userId}:`, `chart:${userId}:`];
      for (const key of Array.from(this.cache.keys())) {
        if (prefixes.some((p) => key.startsWith(p))) {
          this.cache.delete(key);
          removed++;
        }
      }
      this.logger.log(`[Cache] 已清理用户统计缓存: userId=${userId}, keys=${removed}`);
    } catch (e: any) {
      this.logger.warn(`[Cache] 清理用户统计缓存失败: userId=${userId}, err=${e?.message || e}`);
    }
  }

  /**
   * 获取财务概览数据 (Optimized)
   */
  async getOverview(userId: string, query: StatisticsQueryDto): Promise<OverviewData> {
    const cacheKey = `overview:${userId}:${JSON.stringify(query)}`;

    return this.getCached(cacheKey, async () => {
      const range = await this.resolveDateRange(userId, query);
      const { startDate, endDate } = range;
      const startDateStr = format(startDate, 'yyyy-MM-dd HH:mm:ss');
      const endDateStr = format(endDate, 'yyyy-MM-dd HH:mm:ss');

      this.logger.log(`获取概览数据 (Optimized): ${userId}, ${startDateStr} - ${endDateStr}`);

      // 1. Aggregate Totals
      const totalsQuery = this.transactionRepository
        .createQueryBuilder('t')
        .select('SUM(CASE WHEN t.type = :income THEN t.amount ELSE 0 END)', 'totalIncome')
        .addSelect('SUM(CASE WHEN t.type = :expense THEN t.amount ELSE 0 END)', 'totalExpense')
        .addSelect('COUNT(CASE WHEN t.type = :income THEN 1 END)', 'incomeCount')
        .addSelect('COUNT(CASE WHEN t.type = :expense THEN 1 END)', 'expenseCount')
        .addSelect('COUNT(t.id)', 'transactionCount')
        .where('t.userId = :userId', { userId })
        .andWhere('t.transactionDate BETWEEN :startDate AND :endDate', { startDate, endDate })
        .setParameters({ income: TransactionType.INCOME, expense: TransactionType.EXPENSE });

      if (query.type) {
        totalsQuery.andWhere('t.type = :type', { type: query.type });
      }
      if (query.categoryId) {
        totalsQuery.andWhere('t.categoryId = :categoryId', { categoryId: query.categoryId });
      }

      const totals = await totalsQuery.getRawOne();
      const totalIncome = Number(totals.totalIncome || 0);
      const totalExpense = Number(totals.totalExpense || 0);
      const incomeCount = Number(totals.incomeCount || 0);
      const expenseCount = Number(totals.expenseCount || 0);
      const transactionCount = Number(totals.transactionCount || 0);
      const totalAmount = totalIncome + totalExpense;

      // 2. Category Breakdown
      const categoryQuery = this.transactionRepository
        .createQueryBuilder('t')
        .leftJoin('t.category', 'c')
        .select('t.category_id', 'categoryId')
        .addSelect('c.name', 'categoryName')
        .addSelect('c.color', 'categoryColor')
        .addSelect('t.type', 'type')
        .addSelect('SUM(t.amount)', 'amount')
        .addSelect('COUNT(t.id)', 'count')
        .where('t.userId = :userId', { userId })
        .andWhere('t.transactionDate BETWEEN :startDate AND :endDate', { startDate, endDate })
        .groupBy('t.category_id')
        .addGroupBy('c.name')
        .addGroupBy('c.color')
        .addGroupBy('t.type');

      if (query.type) {
        categoryQuery.andWhere('t.type = :type', { type: query.type });
      }
      if (query.categoryId) {
        categoryQuery.andWhere('t.category_id = :categoryId', { categoryId: query.categoryId });
      }

      const categoryRows = await categoryQuery.getRawMany();

      const categoryBreakdown: CategoryBreakdown[] = categoryRows
        .map((row) => ({
          categoryId: row.categoryId || 'uncategorized',
          categoryName: row.categoryName || '未分类',
          categoryColor: row.categoryColor || '#8C8C8C',
          amount: Number(row.amount),
          percentage:
            totalAmount > 0 ? Number(((Number(row.amount) / totalAmount) * 100).toFixed(2)) : 0,
          transactionCount: Number(row.count),
          trend: 0,
          type: row.type,
        }))
        .sort((a, b) => b.amount - a.amount);

      // Top Categories
      const incomeCategories = categoryBreakdown.filter((c) => c.type === TransactionType.INCOME);
      const expenseCategories = categoryBreakdown.filter((c) => c.type === TransactionType.EXPENSE);

      const topIncomeCategory =
        incomeCategories.length > 0 ? incomeCategories[0].categoryName : '无';
      const topIncomeCategoryPercentage =
        totalIncome > 0 && incomeCategories.length > 0
          ? Number(((incomeCategories[0].amount / totalIncome) * 100).toFixed(2))
          : 0;

      const topExpenseCategory =
        expenseCategories.length > 0 ? expenseCategories[0].categoryName : '无';
      const topExpenseCategoryPercentage =
        totalExpense > 0 && expenseCategories.length > 0
          ? Number(((expenseCategories[0].amount / totalExpense) * 100).toFixed(2))
          : 0;

      // 3. Monthly Trends
      // Use SQL date_trunc or to_char depending on DB. Assuming Postgres based on to_char usage in original code.
      const monthlyQuery = this.transactionRepository
        .createQueryBuilder('t')
        .select("to_char(t.transaction_date, 'YYYY-MM')", 'month')
        .addSelect('SUM(CASE WHEN t.type = :income THEN t.amount ELSE 0 END)', 'income')
        .addSelect('SUM(CASE WHEN t.type = :expense THEN t.amount ELSE 0 END)', 'expense')
        .addSelect('COUNT(t.id)', 'count')
        .where('t.user_id = :userId', { userId })
        .andWhere('t.transaction_date BETWEEN :startDate AND :endDate', { startDate, endDate })
        .groupBy("to_char(t.transaction_date, 'YYYY-MM')")
        .orderBy('month', 'ASC')
        .setParameters({ income: TransactionType.INCOME, expense: TransactionType.EXPENSE });

      if (query.type) {
        monthlyQuery.andWhere('t.type = :type', { type: query.type });
      }
      if (query.categoryId) {
        monthlyQuery.andWhere('t.category_id = :categoryId', { categoryId: query.categoryId });
      }

      const monthlyRows = await monthlyQuery.getRawMany();
      const monthlyDataMap = new Map(monthlyRows.map((r) => [r.month, r]));

      // Fill in all months
      const allMonths = eachMonthOfInterval({ start: startDate, end: endDate });
      const monthlyTrends: MonthlyTrend[] = allMonths.map((date) => {
        const monthKey = format(date, 'yyyy-MM');
        const data = monthlyDataMap.get(monthKey) || { income: 0, expense: 0, count: 0 };
        const income = Number(data.income);
        const expense = Number(data.expense);
        return {
          month: monthKey,
          income,
          expense,
          netIncome: income - expense,
          transactionCount: Number(data.count),
        };
      });

      // 4. Comparison with Previous Period
      const duration = endDate.getTime() - startDate.getTime();
      const prevStartDate = new Date(startDate.getTime() - duration - 86400000);
      const prevEndDate = new Date(startDate.getTime() - 86400000);

      const prevTotals = await this.transactionRepository
        .createQueryBuilder('t')
        .select('SUM(CASE WHEN t.type = :income THEN t.amount ELSE 0 END)', 'totalIncome')
        .addSelect('SUM(CASE WHEN t.type = :expense THEN t.amount ELSE 0 END)', 'totalExpense')
        .where('t.user_id = :userId', { userId })
        .andWhere('t.transaction_date BETWEEN :prevStartDate AND :prevEndDate', {
          prevStartDate,
          prevEndDate,
        })
        .setParameters({ income: TransactionType.INCOME, expense: TransactionType.EXPENSE })
        .getRawOne();

      const prevTotalIncome = Number(prevTotals.totalIncome || 0);
      const prevTotalExpense = Number(prevTotals.totalExpense || 0);

      const incomeComparison =
        prevTotalIncome > 0
          ? Number((((totalIncome - prevTotalIncome) / prevTotalIncome) * 100).toFixed(2))
          : totalIncome > 0
            ? 100
            : 0;

      const expenseComparison =
        prevTotalExpense > 0
          ? Number((((totalExpense - prevTotalExpense) / prevTotalExpense) * 100).toFixed(2))
          : totalExpense > 0
            ? 100
            : 0;

      // 5. Budget Info (Optimized)
      const budgetInfo = await this.getBudgetAnalysis(
        userId,
        startDateStr,
        endDateStr,
        totalExpense,
        prevTotalExpense,
        prevStartDate,
        prevEndDate,
      );

      const days = Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));
      const averageDaily = days > 0 ? totalExpense / days : 0;

      return {
        totalIncome,
        totalExpense,
        netIncome: totalIncome - totalExpense,
        transactionCount,
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
    });
  }

  /**
   * Optimized Budget Analysis
   */
  private async getBudgetAnalysis(
    userId: string,
    startDateStr: string,
    endDateStr: string,
    currentTotalExpense: number,
    prevTotalExpense: number,
    prevStartDate: Date,
    prevEndDate: Date,
  ) {
    const budgets = await this.budgetRepository.find({
      where: {
        userId,
        startDate: LessThanOrEqual(endDateStr) as any,
        endDate: MoreThanOrEqual(startDateStr) as any,
        status: BudgetStatus.ACTIVE,
      },
    });

    if (budgets.length === 0) return null;

    // Get all relevant category stats for the period
    // We already calculated categoryBreakdown, but that was for the whole query range.
    // Budgets might have specific start/end dates, but typically we align budget checking with the query range for "Monthly Budget".
    // Assuming the user wants to see how they are doing against budgets in this period.

    // To be precise, we should query expenses grouped by category for the exact period.
    // We can reuse the previous categoryQuery logic but we need to ensure we have data for all subcategories.

    // Optimization: Fetch all expenses grouped by category_id for the period
    const categoryExpensesRaw = await this.transactionRepository
      .createQueryBuilder('t')
      .select('t.category_id', 'categoryId')
      .addSelect('SUM(t.amount)', 'amount')
      .where('t.userId = :userId', { userId })
      .andWhere('t.type = :type', { type: TransactionType.EXPENSE })
      .andWhere('t.transactionDate BETWEEN :startDate AND :endDate', {
        startDate: startDateStr,
        endDate: endDateStr,
      })
      .groupBy('t.category_id')
      .getRawMany();

    const categoryExpenseMap = new Map<string, number>();
    categoryExpensesRaw.forEach((r) => categoryExpenseMap.set(r.categoryId, Number(r.amount)));

    const activeBudgets = await Promise.all(
      budgets.map(async (budget) => {
        try {
          const category = await this.categoryRepository.findOne({
            where: { id: budget.categoryId },
          });
          if (!category) return null;

          // Get descendants to sum up their expenses too
          const descendants = await this.categoryRepository.findDescendants(category);
          const categoryIds = [category.id, ...descendants.map((d) => d.id)];

          let usedAmount = 0;
          categoryIds.forEach((id) => {
            usedAmount += categoryExpenseMap.get(id) || 0;
          });

          const budgetAmount = Number(budget.amount);

          return {
            id: budget.id,
            categoryId: budget.categoryId,
            categoryName: category.name,
            categoryColor: category.color || '#1890ff',
            amount: budgetAmount,
            usedAmount,
            remainingAmount: Math.max(0, budgetAmount - usedAmount),
            usagePercentage:
              budgetAmount > 0 ? Math.min(100, (usedAmount / budgetAmount) * 100) : 0,
            startDate: format(new Date(budget.startDate), 'yyyy-MM-dd'),
            endDate: format(new Date(budget.endDate), 'yyyy-MM-dd'),
          };
        } catch (err) {
          this.logger.error(`Budget analysis failed for budget ${budget.id}`, err);
          return null;
        }
      }),
    );

    const validBudgets = activeBudgets.filter((b) => b !== null);
    if (validBudgets.length === 0) return null;

    const totalBudget = validBudgets.reduce((sum, b) => sum + b!.amount, 0);
    const usedBudget = validBudgets.reduce((sum, b) => sum + b!.usedAmount, 0);
    const usagePercentage = totalBudget > 0 ? (usedBudget / totalBudget) * 100 : 0;

    // Previous period usage (simplified as per original code)
    const prevBudgets = await this.budgetRepository.find({
      where: {
        userId,
        startDate: LessThanOrEqual(format(prevEndDate, 'yyyy-MM-dd')) as any,
        endDate: MoreThanOrEqual(format(prevStartDate, 'yyyy-MM-dd')) as any,
        status: BudgetStatus.ACTIVE,
      },
    });

    let prevUsagePercentage = 0;
    if (prevBudgets.length > 0) {
      const prevTotalBudget = prevBudgets.reduce((sum, b) => sum + Number(b.amount), 0);
      prevUsagePercentage = prevTotalBudget > 0 ? (prevTotalExpense / prevTotalBudget) * 100 : 0;
    }

    return {
      totalBudget,
      usedBudget,
      remainingBudget: Math.max(0, totalBudget - usedBudget),
      usagePercentage: Math.min(100, usagePercentage),
      budgetUsageComparison:
        prevUsagePercentage > 0 ? Number((usagePercentage - prevUsagePercentage).toFixed(2)) : 0,
      budgets: validBudgets.sort((a, b) => (b?.usagePercentage || 0) - (a?.usagePercentage || 0)),
    };
  }

  /**
   * 导出概览报表为 Excel
   */
  async exportOverviewExcel(userId: string, query: any): Promise<Buffer> {
    this.logger.log(`[Export] 开始生成Excel报表, user=${userId}`);
    const { startDate, endDate } = await this.resolveDateRange(userId, query);
    const startDateStr = format(startDate, 'yyyy-MM-dd');
    const endDateStr = format(endDate, 'yyyy-MM-dd');

    const overview = await this.getOverview(userId, {
      timeRange: query?.timeRange || 'month',
      startDate: startDateStr,
      endDate: endDateStr,
      type: query?.type,
      categoryId: query?.categoryId,
    } as any);

    const wb = new Workbook();
    wb.creator = 'Personal Finance App';
    wb.created = new Date();
    wb.modified = new Date();

    // 概览
    const sheetOverview = wb.addWorksheet('概览');
    sheetOverview.addRow(['财务统计报表']).font = { size: 16, bold: true };
    sheetOverview.addRow([]);
    sheetOverview.addRow(['统计周期', `${startDateStr} 至 ${endDateStr}`]);
    sheetOverview.addRow(['本期总收入', overview.totalIncome]);
    sheetOverview.addRow(['本期总支出', overview.totalExpense]);
    sheetOverview.addRow(['本期结余', overview.netIncome]);
    sheetOverview.addRow(['交易笔数', overview.transactionCount]);
    sheetOverview.addRow(['平均每日', overview.averageDaily]);
    sheetOverview.addRow(['收入较上期(%)', overview.incomeComparison]);
    sheetOverview.addRow(['支出较上期(%)', overview.expenseComparison]);

    if (overview.budgetInfo) {
      sheetOverview.addRow([]);
      sheetOverview.addRow(['预算信息']).font = { bold: true };
      sheetOverview.addRow(['总预算', overview.budgetInfo.totalBudget]);
      sheetOverview.addRow(['已使用', overview.budgetInfo.usedBudget]);
      sheetOverview.addRow(['剩余', overview.budgetInfo.remainingBudget]);
      sheetOverview.addRow(['使用率(%)', overview.budgetInfo.usagePercentage]);
      if (typeof overview.budgetInfo.budgetUsageComparison === 'number') {
        sheetOverview.addRow(['与上期对比(%)', overview.budgetInfo.budgetUsageComparison]);
      }
    }

    // 分类占比
    const sheetCategory = wb.addWorksheet('分类占比');
    sheetCategory.addRow(['分类名称', '金额', '占比(%)', '笔数', '趋势', '颜色']);
    (overview.categoryBreakdown || []).forEach((c: any) => {
      sheetCategory.addRow([
        c.categoryName,
        c.amount,
        c.percentage,
        c.transactionCount,
        c.trend,
        c.categoryColor,
      ]);
    });

    // 月度趋势
    const sheetTrend = wb.addWorksheet('月度趋势');
    sheetTrend.addRow(['月份', '收入', '支出', '净收入', '交易笔数']);
    (overview.monthlyTrends || []).forEach((m: any) => {
      sheetTrend.addRow([m.month, m.income, m.expense, m.netIncome, m.transactionCount]);
    });

    const raw = await wb.xlsx.writeBuffer();
    return Buffer.isBuffer(raw) ? raw : Buffer.from(raw as ArrayBuffer);
  }

  /**
   * 获取图表数据 (Optimized)
   */
  async getChartData(userId: string, query: ChartQueryDto) {
    const cacheKey = `chart:${userId}:${JSON.stringify(query)}`;

    return this.getCached(cacheKey, async () => {
      const { startDate, endDate } = await this.resolveDateRange(userId, query);

      // Daily Trends for Line Chart
      const dailyStats = await this.transactionRepository
        .createQueryBuilder('t')
        .select("to_char(t.transaction_date, 'YYYY-MM-DD')", 'date')
        .addSelect('SUM(CASE WHEN t.type = :income THEN t.amount ELSE 0 END)', 'income')
        .addSelect('SUM(CASE WHEN t.type = :expense THEN t.amount ELSE 0 END)', 'expense')
        .where('t.userId = :userId', { userId })
        .andWhere('t.transactionDate BETWEEN :startDate AND :endDate', { startDate, endDate })
        .groupBy("to_char(t.transaction_date, 'YYYY-MM-DD')")
        .orderBy('date', 'ASC')
        .setParameters({ income: TransactionType.INCOME, expense: TransactionType.EXPENSE })
        .getRawMany();

      const incomeData = dailyStats.map((s) => ({ date: s.date, value: Number(s.income) }));
      const expenseData = dailyStats.map((s) => ({ date: s.date, value: Number(s.expense) }));

      // Category Data for Pie Chart (Expense Only)
      const categoryStats = await this.transactionRepository
        .createQueryBuilder('t')
        .leftJoin('t.category', 'c')
        .select('c.name', 'name')
        .addSelect('SUM(t.amount)', 'value')
        .where('t.userId = :userId', { userId })
        .andWhere('t.type = :expense', { expense: TransactionType.EXPENSE })
        .andWhere('t.transactionDate BETWEEN :startDate AND :endDate', { startDate, endDate })
        .groupBy('c.name')
        .getRawMany();

      const pieData = categoryStats.map((s) => ({
        name: s.name || '未分类',
        value: Number(s.value),
        color: '#FF6B6B', // Frontend should probably assign colors, but keeping legacy behavior
      }));

      return {
        lineChart: {
          income: incomeData,
          expense: expenseData,
        },
        pieChart: pieData,
      };
    });
  }

  /**
   * 获取财务健康指标 (Optimized)
   */
  async getFinancialHealth(userId: string, period: string = 'month'): Promise<FinancialHealth> {
    const currentPeriod = this.getPeriodRange(period, new Date());
    const previousPeriod = this.getPreviousPeriod(period, new Date());

    const getPeriodStats = async (start: Date, end: Date) => {
      const stats = await this.transactionRepository
        .createQueryBuilder('t')
        .select('SUM(CASE WHEN t.type = :income THEN t.amount ELSE 0 END)', 'income')
        .addSelect('SUM(CASE WHEN t.type = :expense THEN t.amount ELSE 0 END)', 'expense')
        .where('t.userId = :userId', { userId })
        .andWhere('t.transactionDate BETWEEN :start AND :end', { start, end })
        .setParameters({ income: TransactionType.INCOME, expense: TransactionType.EXPENSE })
        .getRawOne();
      return {
        income: Number(stats.income || 0),
        expense: Number(stats.expense || 0),
      };
    };

    const [current, previous] = await Promise.all([
      getPeriodStats(currentPeriod.start, currentPeriod.end),
      getPeriodStats(previousPeriod.start, previousPeriod.end),
    ]);

    const savingsRate =
      current.income > 0
        ? Number((((current.income - current.expense) / current.income) * 100).toFixed(2))
        : 0;

    const expenseRatio =
      current.income > 0 ? Number(((current.expense / current.income) * 100).toFixed(2)) : 0;

    const incomeGrowth =
      previous.income > 0
        ? Number((((current.income - previous.income) / previous.income) * 100).toFixed(2))
        : 0;

    const expenseGrowth =
      previous.expense > 0
        ? Number((((current.expense - previous.expense) / previous.expense) * 100).toFixed(2))
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
   * 获取债务概览 (Optimized)
   */
  async getDebtOverview(userId: string) {
    const stats = await this.debtRepository
      .createQueryBuilder('d')
      .select(
        'SUM(CASE WHEN d.debt_type = :borrow THEN d.remaining_amount ELSE 0 END)',
        'totalBorrowed',
      )
      .addSelect(
        'SUM(CASE WHEN d.debt_type = :lend THEN d.remaining_amount ELSE 0 END)',
        'totalLent',
      )
      .addSelect('COUNT(CASE WHEN d.debt_type = :borrow THEN 1 END)', 'borrowedCount')
      .addSelect('COUNT(CASE WHEN d.debt_type = :lend THEN 1 END)', 'lentCount')
      .addSelect('COUNT(CASE WHEN d.status != :paid THEN 1 END)', 'pendingCount')
      .addSelect(
        'COUNT(CASE WHEN d.status != :paid AND d.due_date < :now THEN 1 END)',
        'overdueCount',
      )
      .where('d.userId = :userId', { userId })
      .setParameters({
        borrow: DebtType.BORROW,
        lend: DebtType.LEND,
        paid: DebtStatus.PAID,
        now: new Date(),
      })
      .getRawOne();

    const totalBorrowed = Number(stats.totalBorrowed || 0);
    const totalLent = Number(stats.totalLent || 0);

    return {
      totalBorrowed,
      totalLent,
      netDebt: totalBorrowed - totalLent,
      pendingCount: Number(stats.pendingCount || 0),
      overdueCount: Number(stats.overdueCount || 0),
      borrowedCount: Number(stats.borrowedCount || 0),
      lentCount: Number(stats.lentCount || 0),
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
