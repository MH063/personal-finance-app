import { describe, it, expect } from 'vitest';
import { formatAiDebugMarkdown } from './aiDebugFormatter';

describe('aiDebugFormatter', () => {
  it('最近7天支出明细生成表格', () => {
    const raw = [
      { transaction_date: new Date().toISOString(), amount: 12.34, category: '餐饮', payment_method: 'wechat' },
      { transaction_date: new Date().toISOString(), amount: 56.78, category: '交通', payment_method: 'alipay' }
    ];
    const md = formatAiDebugMarkdown(raw);
    expect(md).toContain('金额(元)');
    expect(md).toContain('餐饮');
    expect(md).toContain('交通');
    expect(md).toContain('微信');
    expect(md).toContain('支付宝');
  });

  it('本月餐饮支出明细生成表格', () => {
    const raw = [
      { transaction_date: new Date().toISOString(), amount: 99.99, category: '餐饮', payment_method: 'cash' }
    ];
    const md = formatAiDebugMarkdown(raw);
    expect(md).toContain('餐饮');
    expect(md).toContain('现金');
    expect(md).toMatch(/\|\s+\d{4}-\d{2}-\d{2}\s+\|/);
  });

  it('上季度收入明细生成表格并包含未分类提示', () => {
    const raw = [
      { transaction_date: new Date().toISOString(), amount: 1200, category: '', payment_method: 'bank_card' },
      { transaction_date: new Date().toISOString(), amount: 500, category: '工资', payment_method: 'bank_card' }
    ];
    const md = formatAiDebugMarkdown(raw);
    expect(md).toContain('存在未分类记录');
    expect(md).toContain('银行卡');
  });

  it('下半年收入明细生成表格并包含支付方式缺失提示', () => {
    const raw = [
      { transaction_date: new Date().toISOString(), amount: 300, category: '奖金' },
      { transaction_date: new Date().toISOString(), amount: 200, category: '兼职', payment_method: 'credit_card' }
    ];
    const md = formatAiDebugMarkdown(raw);
    expect(md).toContain('存在支付方式缺失记录');
    expect(md).toContain('信用卡');
  });
});
