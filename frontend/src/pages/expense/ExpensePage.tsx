import React from 'react';
import { Typography, Button } from 'antd';
import { PlusOutlined } from '@ant-design/icons';
import TransactionManager from '@components/business/TransactionManager';
import './ExpensePage.css';

const { Title, Text } = Typography;

/**
 * 支出管理页面
 */
const ExpensePage: React.FC = () => {
  const transactionManagerRef = React.useRef<any>(null);

  const handleAdd = () => {
    if (transactionManagerRef.current) {
      transactionManagerRef.current.handleAdd();
    }
  };

  return (
    <div className="expense-page">
      <div className="page-header-section">
        <div className="header-left">
          <Title level={2} className="page-title">支出管理</Title>
          <Text type="secondary">记录和管理您的日常支出，分析消费习惯</Text>
        </div>
        <div className="header-actions">
          <Button 
            type="primary" 
            icon={<PlusOutlined />} 
            onClick={handleAdd}
            size="large"
            className="add-btn expense"
          >
            记一笔支出
          </Button>
        </div>
      </div>

      <TransactionManager 
        ref={transactionManagerRef}
        type="expense" 
        title="支出明细" 
        themeColor="#ef4444" 
        showHeader={false}
      />
    </div>
  );
};

export default ExpensePage;
