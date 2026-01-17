import React, { useState } from 'react';
import { Card, Tabs } from 'antd';
import TransactionManager from '../../components/business/TransactionManager';
import './TransactionsPage.css';

const { TabPane } = Tabs as any;

const TransactionsPage: React.FC = () => {
  const [activeKey, setActiveKey] = useState<'income' | 'expense'>('expense');

  return (
    <div className="page-container">
      <Card
        title="交易管理"
        variant="borderless"
        className="transactions-card"
        extra={
          <Tabs
            activeKey={activeKey}
            onChange={(key) => setActiveKey(key as 'income' | 'expense')}
          >
            <TabPane tab="支出" key="expense" />
            <TabPane tab="收入" key="income" />
          </Tabs>
        }
      >
        {activeKey === 'expense' && (
          <TransactionManager
            type="expense"
            title="支出"
            themeColor="#ef4444"
            showHeader
          />
        )}
        {activeKey === 'income' && (
          <TransactionManager
            type="income"
            title="收入"
            themeColor="#22c55e"
            showHeader
          />
        )}
      </Card>
    </div>
  );
};

export default TransactionsPage;
