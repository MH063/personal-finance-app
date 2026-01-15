import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import * as natural from 'natural';
import * as ss from 'simple-statistics';
import { Transaction } from '../entities/transaction.entity';
import { Category } from '../entities/category.entity';
import { Debt, DebtStatus } from '../entities/debt.entity';

@Injectable()
export class AiService implements OnModuleInit {
  private readonly logger = new Logger(AiService.name);
  private classifier: natural.BayesClassifier;

  constructor(
    @InjectRepository(Transaction)
    private readonly transactionRepository: Repository<Transaction>,
    @InjectRepository(Category)
    private readonly categoryRepository: Repository<Category>,
    @InjectRepository(Debt)
    private readonly debtRepository: Repository<Debt>,
  ) {
    this.classifier = new natural.BayesClassifier();
  }

  async onModuleInit() {
    console.log('[AiService] 初始化中...');
    await this.trainClassifier();
    console.log('[AiService] 初始化完成，分类器已就绪');
  }

  /**
   * 训练分类器
   */
  async trainClassifier() {
    try {
      console.log('[AiService] 开始训练分类器...');
      const transactions = await this.transactionRepository.find({
        where: { isDeleted: false },
        relations: ['category'],
      });

      if (transactions.length < 5) {
        console.warn('[AiService] 交易数据过少，跳过训练');
        return;
      }

      this.classifier = new natural.BayesClassifier();

      for (const tx of transactions) {
        if (tx.description && tx.category) {
          this.classifier.addDocument(tx.description, tx.category.id);
        }
      }

      this.classifier.train();
      console.log(`[AiService] 训练完成，样本数: ${transactions.length}`);
    } catch (error) {
      console.error('[AiService] 训练失败:', error);
    }
  }

  /**
   * 预测分类
   */
  async predictCategory(description: string): Promise<string | null> {
    if (!this.classifier || !description) return null;
    try {
      const result = this.classifier.classify(description);
      console.log(`[AiService] 描述: "${description}" -> 预测分类 ID: ${result}`);
      return result;
    } catch (error) {
      console.error('[AiService] 预测失败:', error);
      return null;
    }
  }

  /**
   * 综合财务健康度分析
   * 结合收支比、债务比、储蓄率
   */
  async getHealthAnalysis(userId: string) {
    const transactions = await this.transactionRepository.find({
      where: { userId, isDeleted: false },
    });

    const debts = await this.debtRepository.find({
      where: { userId, status: In([DebtStatus.PENDING, DebtStatus.PARTIAL, DebtStatus.OVERDUE]) },
    });

    if (transactions.length === 0) return null;

    let totalIncome = 0;
    let totalExpense = 0;
    for (const tx of transactions) {
      if (tx.type === 'income') totalIncome += Number(tx.amount);
      else totalExpense += Number(tx.amount);
    }

    const totalDebt = debts.reduce((sum: number, d: Debt) => sum + Number(d.remainingAmount), 0);

    const savingsRate = totalIncome > 0 ? ((totalIncome - totalExpense) / totalIncome) * 100 : 0;
    const debtToIncomeRatio = totalIncome > 0 ? (totalDebt / (totalIncome * 12)) * 100 : 0; // 以年收入为基准

    let score = 60;
    const insights = [];

    if (savingsRate > 20) {
      score += 20;
      insights.push('您的储蓄率表现优秀，建议继续保持。');
    } else if (savingsRate > 0) {
      score += 5;
      insights.push('您的储蓄率略低，建议减少非必要支出以提高抗风险能力。');
    } else {
      score -= 10;
      insights.push('本月处于入不敷出状态，请务必检查大额支出。');
    }

    if (debtToIncomeRatio < 30) {
      score += 20;
    } else if (debtToIncomeRatio > 50) {
      score -= 20;
      insights.push('债务负担较重，建议优先偿还高息债务。');
    }

    return {
      score: Math.min(100, Math.max(0, score)),
      savingsRate: savingsRate.toFixed(1),
      debtToIncomeRatio: debtToIncomeRatio.toFixed(1),
      insights,
    };
  }

  /**
   * 获取收支预测
   */
  async getForecast(userId: string) {
    // 获取过去 6 个月的月度数据
    const transactions = await this.transactionRepository.find({
      where: { userId, isDeleted: false },
      order: { transactionDate: 'ASC' },
    });

    const monthlyMap = new Map<string, number>();
    transactions.forEach((tx) => {
      if (tx.type === 'expense') {
        const month = tx.transactionDate.toISOString().substring(0, 7);
        monthlyMap.set(month, (monthlyMap.get(month) || 0) + Number(tx.amount));
      }
    });

    const data = Array.from(monthlyMap.entries())
      .map(([month, amount]) => ({ month, amount }))
      .sort((a, b) => a.month.localeCompare(b.month));

    if (data.length < 2) return null;

    const regressionData = data.map((d, i) => [i, d.amount]);
    const regression = ss.linearRegression(regressionData);
    const line = ss.linearRegressionLine(regression);

    const forecast = [];
    const lastIndex = data.length - 1;
    for (let i = 1; i <= 3; i++) {
      forecast.push({
        month: `下月 ${i}`,
        amount: Math.max(0, line(lastIndex + i)),
      });
    }

    return forecast;
  }
}
