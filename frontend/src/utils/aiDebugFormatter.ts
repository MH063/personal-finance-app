export function formatAiDebugMarkdown(rawResult: any[]): string {
  const mapPayment = (pm: string) => {
    if (!pm) return '未提供';
    switch (pm) {
      case 'cash':
        return '现金';
      case 'bank_card':
        return '银行卡';
      case 'credit_card':
        return '信用卡';
      case 'wechat':
        return '微信';
      case 'alipay':
        return '支付宝';
      default:
        return String(pm);
    }
  };
  const rows = (rawResult || []).map((d: any) => {
    const t = d?.transaction_date || d?.transactionDate;
    const dt = t ? new Date(t) : null;
    const y = dt ? dt.getFullYear() : '';
    const m = dt ? String(dt.getMonth() + 1).padStart(2, '0') : '';
    const day = dt ? String(dt.getDate()).padStart(2, '0') : '';
    const cat = d?.category || '未分类';
    const amt = typeof d?.amount === 'number' ? d.amount : Number(d?.amount || 0);
    const pm = d?.payment_method || d?.paymentMethod || '';
    return { date: `${y}-${m}-${day}`, amount: amt.toFixed(2), category: cat, payment: mapPayment(pm) };
  });
  const headers = ['日期', '金额(元)', '收入来源分类', '支付方式'];
  const headerMd = `| **${headers[0]}** | **${headers[1]}** | **${headers[2]}** | **${headers[3]}** |\n| :--- | :--- | :--- | :--- |`;
  const dataMd = rows.map((r) => `| ${r.date} | ${r.amount} | ${r.category} | ${r.payment} |`).join('\n');
  const anomalies: string[] = [];
  if ((rawResult || []).some((d: any) => !d?.category)) anomalies.push('存在未分类记录');
  if ((rawResult || []).some((d: any) => !(d?.payment_method || d?.paymentMethod))) anomalies.push('存在支付方式缺失记录');
  const extra = anomalies.length ? `\n\n异常说明：${anomalies.join('；')}。` : '';
  return `${headerMd}\n${dataMd}${extra}`;
}
