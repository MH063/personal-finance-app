import { Injectable, Logger } from '@nestjs/common';
import { TransactionsService } from '../transactions/transactions.service';
import { TransactionType } from '../entities/transaction.entity';
import dayjs from 'dayjs';
import * as fs from 'fs';

@Injectable()
export class AiDiagnosisService {
  private readonly logger = new Logger(AiDiagnosisService.name);
  // 备用模型路径检测
  private readonly AI_MODEL_DIR = 'D:\\MH\\ai-models';

  constructor(private readonly transactionsService: TransactionsService) {}

  async diagnose(userId: string): Promise<{ advice: string; analysis: any }> {
    // 1. 获取本周期（最近30天）数据
    const endDate = dayjs();
    const startDate = endDate.subtract(30, 'day');

    // 2. 获取上周期（再前30天）数据用于环比
    const prevEndDate = startDate.subtract(1, 'day');
    const prevStartDate = prevEndDate.subtract(30, 'day');

    const [currentResult, prevResult] = await Promise.all([
      this.transactionsService.findAll(userId, {
        startDate: startDate.format('YYYY-MM-DD'),
        endDate: endDate.format('YYYY-MM-DD'),
        limit: 10000,
      }),
      this.transactionsService.findAll(userId, {
        startDate: prevStartDate.format('YYYY-MM-DD'),
        endDate: prevEndDate.format('YYYY-MM-DD'),
        limit: 10000,
      }),
    ]);

    const currentTx = currentResult.data;
    const prevTx = prevResult.data;

    // 3. 统计分析
    const analysis = this.analyze(currentTx, prevTx);

    // 4. 生成建议 (规则引擎)
    // 检查是否有本地 AI 模型可用（虽然无法直接运行，但可以检测文件存在作为提示）
    const hasLocalModel = this.checkLocalModel();
    let advice = '';

    if (hasLocalModel) {
      // 如果有模型文件但我们无法运行（因为缺少环境），我们仍然使用规则引擎，
      // 但可以在日志里记录一下，或者未来扩展。
      // 目前完全依赖高级规则引擎。
      advice = this.generateRuleBasedAdvice(analysis);
    } else {
      advice = this.generateRuleBasedAdvice(analysis);
    }

    return {
      advice,
      analysis: {
        totalExpense: analysis.totalExpense,
        totalIncome: analysis.totalIncome,
        savingsRate: analysis.savingsRate,
        topCategories: analysis.topCategories,
        expenseGrowth: analysis.expenseGrowth,
        period: '最近30天',
      },
    };
  }

  private checkLocalModel(): boolean {
    try {
      if (fs.existsSync(this.AI_MODEL_DIR)) {
        const files = fs.readdirSync(this.AI_MODEL_DIR);
        return files.some((f) => f.endsWith('.gguf') || f.endsWith('.onnx'));
      }
    } catch (_e) {
      return false;
    }
    return false;
  }

  private analyze(currentTx: any[], prevTx: any[]) {
    // 基础统计
    const calcTotal = (txs: any[], type: string) =>
      txs.filter((t) => t.type === type).reduce((sum, t) => sum + Number(t.amount), 0);

    const totalExpense = calcTotal(currentTx, TransactionType.EXPENSE);
    const totalIncome = calcTotal(currentTx, TransactionType.INCOME);
    const prevTotalExpense = calcTotal(prevTx, TransactionType.EXPENSE);

    // 环比增长
    let expenseGrowth = 0;
    if (prevTotalExpense > 0) {
      expenseGrowth = ((totalExpense - prevTotalExpense) / prevTotalExpense) * 100;
    }

    // 储蓄率
    let savingsRate = 0;
    if (totalIncome > 0) {
      savingsRate = ((totalIncome - totalExpense) / totalIncome) * 100;
    }

    // 分类分析
    const categoryMap = new Map<string, number>();
    currentTx
      .filter((t) => t.type === TransactionType.EXPENSE)
      .forEach((t) => {
        const name = t.category?.name || '未分类';
        categoryMap.set(name, (categoryMap.get(name) || 0) + Number(t.amount));
      });

    const topCategories = Array.from(categoryMap.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([name, amount]) => ({ name, amount, percent: (amount / totalExpense) * 100 }));

    return {
      totalExpense,
      totalIncome,
      prevTotalExpense,
      expenseGrowth,
      savingsRate,
      topCategories,
      txCount: currentTx.length,
    };
  }

  private generateRuleBasedAdvice(analysis: any): string {
    const parts: string[] = [];

    // 1. 总支出与趋势评价
    if (analysis.expenseGrowth > 20) {
      parts.push(
        `本月支出较上月显著增长了 ${analysis.expenseGrowth.toFixed(1)}%，建议您关注资金流向。`,
      );
    } else if (analysis.expenseGrowth < -20) {
      parts.push(
        `本月支出控制得当，较上月减少了 ${Math.abs(analysis.expenseGrowth).toFixed(1)}%，请继续保持！`,
      );
    } else {
      parts.push(`本月支出相对平稳，波动在正常范围内。`);
    }

    // 2. 储蓄建议
    if (analysis.totalIncome > 0) {
      if (analysis.savingsRate < 10) {
        parts.push(
          `目前的储蓄率仅为 ${analysis.savingsRate.toFixed(1)}%，略低于建议的 20% 安全线。建议优先支付自己，即工资到账后先存下一笔固定金额。`,
        );
      } else if (analysis.savingsRate > 40) {
        parts.push(
          `您的储蓄率高达 ${analysis.savingsRate.toFixed(1)}%，非常优秀！可以考虑将部分储蓄投入长期理财目标。`,
        );
      }
    }

    // 3. 分类建议 (Category Specific)
    const foodCategory = analysis.topCategories.find(
      (c: any) => c.name.includes('餐饮') || c.name.includes('食品') || c.name.includes('外卖'),
    );
    if (foodCategory && foodCategory.percent > 40) {
      parts.push(
        `餐饮支出占到了总支出的 ${foodCategory.percent.toFixed(1)}%，恩格尔系数较高。适当减少外出就餐可能是一个有效的省钱途径。`,
      );
    }

    const shoppingCategory = analysis.topCategories.find(
      (c: any) => c.name.includes('购物') || c.name.includes('服饰'),
    );
    if (shoppingCategory && shoppingCategory.percent > 30) {
      parts.push(
        `购物类支出占比较高（${shoppingCategory.percent.toFixed(1)}%），建议在消费前列出清单，避免冲动消费。`,
      );
    }

    // 4. 通用结语
    if (parts.length < 3) {
      parts.push('建议定期复盘账单，通过设定预算功能来更好地管理财务。');
    }

    return parts.join('\n');
  }
}
