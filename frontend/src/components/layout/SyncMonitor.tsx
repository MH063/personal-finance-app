import React, { useState, useEffect } from 'react';
import { Drawer, List, Tag, Typography, Badge, Button, Space, Alert, Empty, Row, Col } from 'antd';
import { SyncOutlined, CheckCircleOutlined, ExclamationCircleOutlined, CloudSyncOutlined } from '@ant-design/icons';
import { collaborativeService } from '../../services/collaborativeService';

const { Text, Title } = Typography;

interface SyncLog {
  id: string;
  type: string;
  timestamp: string;
  status: 'success' | 'failure' | 'syncing';
  data?: any;
}

/**
 * 实时同步监控面板组件
 * 显示最近的数据同步记录和系统同步状态
 */
const SyncMonitor: React.FC<{ visible: boolean; onClose: () => void }> = ({ visible, onClose }) => {
  const [logs, setLogs] = useState<SyncLog[]>([]);
  const [syncInfo, setSyncInfo] = useState(collaborativeService.getSyncInfo());

  useEffect(() => {
    const handleUpdate = (data: any) => {
      console.log('[SyncMonitor] 收到更新通知:', data);
      const newLog: SyncLog = {
        id: Math.random().toString(36).substring(7),
        type: data.type || 'DATA_UPDATE',
        timestamp: new Date().toLocaleTimeString(),
        status: data.status || 'success',
        data: data.data || data,
      };
      setLogs(prev => [newLog, ...prev].slice(0, 50));
      setSyncInfo(collaborativeService.getSyncInfo());
    };

    const handleConnect = () => {
      setSyncInfo(collaborativeService.getSyncInfo());
      // 记录连接日志
      const connectLog: SyncLog = {
        id: Math.random().toString(36).substring(7),
        type: 'SYSTEM_CONNECTED',
        timestamp: new Date().toLocaleTimeString(),
        status: 'success',
      };
      setLogs(prev => [connectLog, ...prev].slice(0, 50));
    };

    const handleDisconnect = () => {
      setSyncInfo(collaborativeService.getSyncInfo());
      // 记录断开日志
      const disconnectLog: SyncLog = {
        id: Math.random().toString(36).substring(7),
        type: 'SYSTEM_DISCONNECTED',
        timestamp: new Date().toLocaleTimeString(),
        status: 'failure',
      };
      setLogs(prev => [disconnectLog, ...prev].slice(0, 50));
    };

    collaborativeService.on('ledgerUpdate', handleUpdate);
    collaborativeService.on('globalUpdate', handleUpdate);
    collaborativeService.on('settingsUpdate', handleUpdate);
    collaborativeService.on('connect', handleConnect);
    collaborativeService.on('disconnect', handleDisconnect);

    const timer = setInterval(() => {
      setSyncInfo(collaborativeService.getSyncInfo());
    }, 5000);

    return () => {
      collaborativeService.off('ledgerUpdate', handleUpdate);
      collaborativeService.off('globalUpdate', handleUpdate);
      collaborativeService.off('settingsUpdate', handleUpdate);
      collaborativeService.off('connect', handleConnect);
      collaborativeService.off('disconnect', handleDisconnect);
      clearInterval(timer);
    };
  }, []);

  const handleForceSync = async () => {
    try {
      await collaborativeService.forceSync();
    } catch (err) {
      console.error('[SyncMonitor] 强制同步失败:', err);
    }
  };

  return (
    <Drawer
      title={
        <Space>
          <SyncOutlined spin={syncInfo.isConnected} style={{ color: syncInfo.isConnected ? '#52c41a' : '#f5222d' }} />
          <span>系统数据同步监控</span>
        </Space>
      }
      placement="right"
      onClose={onClose}
      open={visible}
      width={450}
      extra={
        <Space>
          <Button size="small" icon={<CloudSyncOutlined />} onClick={handleForceSync}>
            强制同步
          </Button>
          <Button size="small" onClick={() => setLogs([])}>清除日志</Button>
        </Space>
      }
    >
      <div style={{ marginBottom: 24 }}>
        <Title level={5}>同步状态概览</Title>
        <div style={{ background: 'rgba(255,255,255,0.05)', padding: 16, borderRadius: 8, border: '1px solid rgba(255,255,255,0.1)' }}>
          <Row gutter={[16, 16]}>
            <Col span={12}>
              <Text type="secondary">连接状态</Text>
              <div><Badge status={syncInfo.isConnected ? 'success' : 'error'} text={syncInfo.isConnected ? '已连接' : '已断开'} /></div>
            </Col>
            <Col span={12}>
              <Text type="secondary">最近同步时间</Text>
              <div><Text strong>{syncInfo.lastSyncTime ? syncInfo.lastSyncTime.toLocaleTimeString() : '从未同步'}</Text></div>
            </Col>
            <Col span={24}>
              <Text type="secondary">客户端 ID</Text>
              <div><Text code style={{ fontSize: 11 }}>{syncInfo.socketId || 'N/A'}</Text></div>
            </Col>
          </Row>
        </div>
      </div>

      {syncInfo.errors.length > 0 && (
        <div style={{ marginBottom: 24 }}>
          <Title level={5} type="danger">异常告警</Title>
          {syncInfo.errors.map((err, idx) => (
            <Alert
              key={idx}
              message={err}
              type="error"
              showIcon
              style={{ marginBottom: 8 }}
            />
          ))}
        </div>
      )}

      <Title level={5}>实时同步流水 ({logs.length})</Title>
      <List
        dataSource={logs}
        renderItem={item => (
          <List.Item>
            <List.Item.Meta
              avatar={
                item.type === 'RECONNECTED_SYNC' ? 
                <CloudSyncOutlined style={{ color: '#1890ff' }} /> :
                item.status === 'success' ? 
                <CheckCircleOutlined style={{ color: '#52c41a' }} /> : 
                <ExclamationCircleOutlined style={{ color: '#f5222d' }} />
              }
              title={
                <Space>
                  <Text strong>{item.type}</Text>
                  {item.type === 'RECONNECTED_SYNC' && <Tag color="blue">数据补偿</Tag>}
                  {item.type === 'MANUAL_FORCE_SYNC' && <Tag color="purple">强制刷新</Tag>}
                </Space>
              }
              description={
                <Space direction="vertical" size={0} style={{ width: '100%' }}>
                  <Text type="secondary" style={{ fontSize: 12 }}>时间: {item.timestamp}</Text>
                  {item.data && <Text type="secondary" style={{ fontSize: 11, display: 'block' }}>ID: {item.data.id || 'N/A'}</Text>}
                  <Tag size="small" color={item.type.includes('SYNC') ? 'processing' : 'green'}>
                    {item.type.includes('SYNC') ? '全量刷新成功' : '增量更新成功'}
                  </Tag>
                </Space>
              }
            />
          </List.Item>
        )}
        locale={{ emptyText: <Empty description="暂无同步记录" /> }}
      />
    </Drawer>
  );
};

export default SyncMonitor;
