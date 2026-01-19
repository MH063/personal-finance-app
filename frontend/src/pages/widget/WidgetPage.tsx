import React, { useEffect, useState } from 'react';
import { Statistic, Row, Col, Button } from 'antd';
import { ArrowUpOutlined, ArrowDownOutlined, ExpandAltOutlined } from '@ant-design/icons';
import { transactionService } from '../../services/transactionService';
import dayjs from 'dayjs';

const WidgetPage: React.FC = () => {
  const [data, setData] = useState({ income: 0, expense: 0 });

  useEffect(() => {
    const fetchData = async () => {
      try {
        const today = dayjs().format('YYYY-MM-DD');
        const res = await transactionService.getTransactions({
          startDate: today,
          endDate: today,
          limit: 1000
        });

        let income = 0;
        let expense = 0;
        const list = Array.isArray(res) ? res : (Array.isArray(res?.data) ? res.data : []);

        list.forEach((t: any) => {
           if (t.type === 'income') income += Number(t.amount);
           if (t.type === 'expense') expense += Number(t.amount);
        });
        
        setData({ income, expense });
      } catch (e) {
        console.error(e);
      }
    };
    
    fetchData();
    const interval = setInterval(fetchData, 60000);
    return () => clearInterval(interval);
  }, []);

  const openMainApp = () => {
     if (window.electronAPI?.openMainWindow) {
         window.electronAPI.openMainWindow();
     } else {
         console.warn('Electron API not available');
     }
  };

  return (
    <div style={{ 
        padding: 16, 
        background: 'rgba(255, 255, 255, 0.95)', 
        height: '100vh', 
        borderRadius: 8,
        border: '1px solid #e5e7eb',
        WebkitAppRegion: 'drag',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center'
    } as any}>
      <div style={{ marginBottom: 8, fontSize: 12, color: '#666', textAlign: 'center' }}>
          {dayjs().format('MM月DD日')} 财务概览
      </div>
      <Row gutter={8}>
        <Col span={12}>
          <Statistic
            title="收入"
            value={data.income}
            precision={0}
            styles={{ content: { color: '#3f8600', fontSize: 18 } }}
            prefix={<ArrowUpOutlined />}
            suffix="¥"
          />
        </Col>
        <Col span={12}>
          <Statistic
            title="支出"
            value={data.expense}
            precision={0}
            styles={{ content: { color: '#cf1322', fontSize: 18 } }}
            prefix={<ArrowDownOutlined />}
            suffix="¥"
          />
        </Col>
      </Row>
      <div style={{ marginTop: 12, textAlign: 'center', WebkitAppRegion: 'no-drag' } as any}>
          <Button type="primary" size="small" icon={<ExpandAltOutlined />} onClick={openMainApp} style={{ borderRadius: 12 }}>
            打开主程序
          </Button>
      </div>
    </div>
  );
};

export default WidgetPage;
