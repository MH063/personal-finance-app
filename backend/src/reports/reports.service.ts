import { Injectable } from '@nestjs/common';
import { TransactionsService } from '../transactions/transactions.service';
import PDFDocument from 'pdfkit';
import { Response } from 'express';
import dayjs from 'dayjs';
import * as fs from 'fs';

@Injectable()
export class ReportsService {
  constructor(private readonly transactionsService: TransactionsService) {}

  async generatePdfReport(
    userId: string,
    ledgerId: string | undefined,
    startDate: string,
    endDate: string,
    res: Response,
  ) {
    const query: any = {
      startDate,
      endDate,
      ledgerId,
      limit: 10000, // 获取所有记录
    };

    const result = await this.transactionsService.findAll(userId, query);
    // 修复：transactionsService.findAll 返回的是 { data: [], total: ... }
    const transactions = result.data || [];

    // 计算统计数据
    let totalIncome = 0;
    let totalExpense = 0;
    transactions.forEach((t) => {
      if (t.type === 'income') totalIncome += Number(t.amount);
      if (t.type === 'expense') totalExpense += Number(t.amount);
    });

    const doc = new PDFDocument({ margin: 50 });

    // 设置响应头
    const filename = `report-${startDate}-to-${endDate}.pdf`;
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

    doc.pipe(res);

    // 注册中文字体
    const fontPath = 'C:/Windows/Fonts/simhei.ttf';
    if (fs.existsSync(fontPath)) {
      doc.font(fontPath);
    } else {
      console.warn(
        'SimHei font not found, using default font. Chinese characters may not display correctly.',
      );
      // Fallback or try another font if needed
    }

    // Header
    doc.fontSize(20).text('家庭财务报告', { align: 'center' });
    doc.moveDown();
    doc.fontSize(12).text(`统计周期: ${startDate} 至 ${endDate}`, { align: 'center' });
    doc.moveDown(2);

    // Summary
    doc.fontSize(16).text('收支概览');
    doc.moveDown(0.5);
    doc.fontSize(12).text(`总收入: ¥${totalIncome.toFixed(2)}`);
    doc.text(`总支出: ¥${totalExpense.toFixed(2)}`);
    doc.text(`净储蓄: ¥${(totalIncome - totalExpense).toFixed(2)}`);
    doc.moveDown(2);

    // Transactions Table Header
    const tableTop = 250;
    let y = tableTop;

    doc.fontSize(10);
    // Draw table headers
    doc.text('日期', 50, y);
    doc.text('分类', 150, y);
    doc.text('类型', 300, y);
    doc.text('金额', 400, y);

    // Draw underline
    doc
      .moveTo(50, y + 15)
      .lineTo(550, y + 15)
      .stroke();

    y += 30;

    // Transactions Rows
    transactions.forEach((t) => {
      if (y > 700) {
        doc.addPage();
        // Reset font for new page
        if (fs.existsSync(fontPath)) {
          doc.font(fontPath);
        }
        y = 50;

        // Header for new page
        doc.fontSize(10);
        doc.text('日期', 50, y);
        doc.text('分类', 150, y);
        doc.text('类型', 300, y);
        doc.text('金额', 400, y);
        doc
          .moveTo(50, y + 15)
          .lineTo(550, y + 15)
          .stroke();
        y += 30;
      }

      const date = dayjs(t.transactionDate).format('YYYY-MM-DD');
      const category = t.category?.name || '未分类';
      const type = t.type === 'income' ? '收入' : t.type === 'expense' ? '支出' : '转账';

      doc.text(date, 50, y);
      doc.text(category, 150, y);
      doc.text(type, 300, y);

      const amountColor = t.type === 'income' ? 'green' : 'red';
      doc.fillColor(amountColor).text(`¥${Number(t.amount).toFixed(2)}`, 400, y);
      doc.fillColor('black'); // Reset color

      y += 20;
    });

    doc.end();
  }
}
