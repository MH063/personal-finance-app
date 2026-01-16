import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import * as natural from 'natural';
import * as ss from 'simple-statistics';
import * as fs from 'fs';
import * as path from 'path';
import { Transaction } from '../entities/transaction.entity';
import { Category } from '../entities/category.entity';
import { Debt, DebtStatus } from '../entities/debt.entity';

@Injectable()
export class AiService implements OnModuleInit {
  private readonly logger = new Logger(AiService.name);
  private classifier: natural.BayesClassifier;
  private readonly MODEL_DIR = path.join(process.cwd(), 'storage', 'ai-models');
  private readonly MODEL_FILE = path.join(this.MODEL_DIR, 'classifier.json');
  private readonly META_FILE = path.join(this.MODEL_DIR, 'metadata.json');
  private readonly RETRAIN_THRESHOLD = 10; // 新增多少条数据触发重训

  constructor(
    @InjectRepository(Transaction)
    private readonly transactionRepository: Repository<Transaction>,
    @InjectRepository(Category)
    private readonly categoryRepository: Repository<Category>,
    @InjectRepository(Debt)
    private readonly debtRepository: Repository<Debt>,
  ) {
    this.classifier = new natural.BayesClassifier();
    this.ensureModelDir();
  }

  private ensureModelDir() {
    if (!fs.existsSync(this.MODEL_DIR)) {
      fs.mkdirSync(this.MODEL_DIR, { recursive: true });
    }
  }

  async onModuleInit() {
    this.logger.log('[AiService] 初始化中...');
    const loaded = await this.loadModel();
    if (loaded) {
      this.logger.log('[AiService] 已加载本地模型，检查增量更新...');
      await this.trainClassifier(loaded.count);
    } else {
      this.logger.log('[AiService] 无本地模型，开始全量训练...');
      await this.trainClassifier();
    }
    this.logger.log('[AiService] 初始化完成，分类器已就绪');
  }

  /**
   * 保存模型到本地
   */
  private async saveModel(count: number) {
    try {
      // natural.BayesClassifier 可以序列化为 JSON
      const data = JSON.stringify(this.classifier);
      await fs.promises.writeFile(this.MODEL_FILE, data, 'utf8');

      const meta = {
        lastTrainedAt: new Date(),
        transactionCount: count,
      };
      await fs.promises.writeFile(this.META_FILE, JSON.stringify(meta), 'utf8');
      this.logger.log(`[AiService] 模型已保存 (样本数: ${count})`);
    } catch (error) {
      this.logger.error('[AiService] 模型保存失败:', error);
    }
  }

  /**
   * 加载本地模型
   */
  private async loadModel(): Promise<{ count: number } | null> {
    try {
      if (fs.existsSync(this.MODEL_FILE) && fs.existsSync(this.META_FILE)) {
        const data = await fs.promises.readFile(this.MODEL_FILE, 'utf8');
        const metaRaw = await fs.promises.readFile(this.META_FILE, 'utf8');
        const meta = JSON.parse(metaRaw);

        // 恢复分类器
        this.classifier = natural.BayesClassifier.restore(JSON.parse(data));
        this.logger.log(`[AiService] 本地模型加载成功 (上次训练: ${meta.lastTrainedAt})`);
        return { count: meta.transactionCount || 0 };
      }
    } catch (error) {
      this.logger.error('[AiService] 模型加载失败:', error);
    }
    return null;
  }

  /**
   * 训练分类器
   * @param lastCount 上次训练时的样本数 (如果存在)
   */
  async trainClassifier(lastCount: number = 0) {
    try {
      const totalCount = await this.transactionRepository.count();

      // 如果数据量没有显著增加，且已有模型，则跳过训练
      if (lastCount > 0 && totalCount - lastCount < this.RETRAIN_THRESHOLD) {
        this.logger.log(
          `[AiService] 新增数据不足阈值 (${totalCount - lastCount} < ${this.RETRAIN_THRESHOLD})，跳过训练`,
        );
        return;
      }

      this.logger.log('[AiService] 开始训练分类器...');
      const transactions = await this.transactionRepository.find({
        relations: ['category'],
      });

      if (transactions.length < 5) {
        this.logger.warn('[AiService] 交易数据过少，跳过训练');
        return;
      }

      // 重新创建并训练
      this.classifier = new natural.BayesClassifier();

      for (const tx of transactions) {
        if (tx.description && tx.category) {
          this.classifier.addDocument(tx.description, tx.category.id);
        }
      }

      this.classifier.train();
      this.logger.log(`[AiService] 训练完成，样本数: ${transactions.length}`);

      // 保存模型
      await this.saveModel(transactions.length);
    } catch (error) {
      this.logger.error('[AiService] 训练失败:', error);
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
      where: { userId },
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
      where: { userId },
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
