import React from 'react';
import { Typography, Button } from 'antd';
import { PlusOutlined } from '@ant-design/icons';
import TransactionManager from '@components/business/TransactionManager';
import './IncomePage.css';

const { Title, Text } = Typography;

/**
 * 收入管理页面
 */
const IncomePage: React.FC = () => {
  const transactionManagerRef = React.useRef<any>(null);

  const handleAdd = () => {
    if (transactionManagerRef.current) {
      transactionManagerRef.current.handleAdd();
    }
  };

  return (
    <div className="income-page">
      <div className="page-header-section">
        <div className="header-left">
          <Title level={2} className="page-title">收入管理</Title>
          <Text type="secondary">追踪您的收入来源，管理资产增长</Text>
        </div>
        <div className="header-actions">
          <Button 
            type="primary" 
            icon={<PlusOutlined />} 
            onClick={handleAdd}
            size="large"
            className="add-btn income"
          >
            记一笔收入
          </Button>
        </div>
      </div>

      <TransactionManager 
        ref={transactionManagerRef}
        type="income" 
        title="收入明细" 
        themeColor="#10b981" 
        showHeader={false}
      />
    </div>
  );
};

export default IncomePage;
