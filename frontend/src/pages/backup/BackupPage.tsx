import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { Card, Button, Table, Space, Tag, Modal, Form, Upload, App as AntdApp, Row, Col, Typography, Popconfirm, Statistic, Select, Switch } from 'antd';
import { DatabaseOutlined, UploadOutlined, DownloadOutlined, DeleteOutlined, PlusOutlined, CheckCircleOutlined, CloseCircleOutlined } from '@ant-design/icons';
import backupService from '../../services/backupService';
import { collaborativeService } from '../../services/collaborativeService';
import './BackupPage.css';

const { Title, Text } = Typography;
const { Option } = Select;

const BackupPage: React.FC = () => {
  const { message } = AntdApp.useApp();
  const [loading, setLoading] = useState(false);
  const [restoreLoading, setRestoreLoading] = useState(false);
  const [downloadLoading, setDownloadLoading] = useState<string | null>(null);
  const [deleteLoading, setDeleteLoading] = useState<string | null>(null);
  const [backupHistory, setBackupHistory] = useState<any[]>([]);
  const [createModalVisible, setCreateModalVisible] = useState(false);
  const [restoreModalVisible, setRestoreModalVisible] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [form] = Form.useForm();


  const loadBackupHistory = useCallback(async () => {
    try {
      const data = await backupService.getBackupHistory();
      setBackupHistory(data);
    } catch (error: any) {
      message.error(typeof error === 'string' ? error : (error?.message || '获取备份历史失败'));
    }
  }, [message]);

  useEffect(() => {
    loadBackupHistory();
  }, [loadBackupHistory]);

  const handleCreateBackup = useCallback(async (values: any) => {
    setLoading(true);
    try {
      await backupService.createBackup(values);
      message.success('备份创建成功');
      setCreateModalVisible(false);
      form.resetFields();
      loadBackupHistory();
    } catch (error: any) {
      message.error(typeof error === 'string' ? error : (error?.message || '备份创建失败'));
    } finally {
      setLoading(false);
    }
  }, [form, loadBackupHistory, message]);

  const handleDownload = useCallback(async (backupId: string, fileName: string) => {
    if (downloadLoading) return;
    setDownloadLoading(backupId);
    try {
      const response = await backupService.downloadBackup(backupId);
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', fileName);
      document.body.appendChild(link);
      link.click();
      link.remove();
    } catch (error: any) {
      message.error(typeof error === 'string' ? error : (error?.message || '下载失败'));
    } finally {
      setDownloadLoading(null);
    }
  }, [downloadLoading, message]);

  const handleDeleteBackup = useCallback(async (backupId: string) => {
    if (deleteLoading) return;
    setDeleteLoading(backupId);
    try {
      await backupService.deleteBackup(backupId);
      message.success('备份已删除');
      loadBackupHistory();
    } catch (error: any) {
      message.error(typeof error === 'string' ? error : (error?.message || '删除失败'));
    } finally {
      setDeleteLoading(null);
    }
  }, [deleteLoading, loadBackupHistory, message]);

  const handleRestore = useCallback(async (values: any) => {
    if (!selectedFile) {
      message.error('请选择备份文件');
      return;
    }

    setRestoreLoading(true);
    try {
      await backupService.uploadAndRestore(selectedFile, values.password);
      message.success('数据恢复成功');
      // 发送全局更新通知，因为恢复数据会影响所有模块
      collaborativeService.emit('globalUpdate', { type: 'restore' });
      setRestoreModalVisible(false);
      setSelectedFile(null);
    } catch (error: any) {
      message.error(typeof error === 'string' ? error : (error?.message || '数据恢复失败'));
    } finally {
      setRestoreLoading(false);
    }
  }, [message, selectedFile]);

  const handleFileChange = useCallback((info: any) => {
    if (info.fileList.length > 0) {
      setSelectedFile(info.fileList[0].originFileObj);
    }
  }, []);

  const formatFileSize = useCallback((bytes: number) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }, []);

  const columns = useMemo(() => [
    { title: '备份类型', dataIndex: 'backupType', key: 'type', render: (type: string) => <Tag>{type === 'full' ? '完整备份' : type === 'transactions' ? '交易记录' : type === 'categories' ? '分类数据' : type === 'debts' ? '债务数据' : '设置'}</Tag> },
    { title: '文件名', dataIndex: 'fileName', key: 'fileName', ellipsis: true },
    { title: '大小', dataIndex: 'fileSize', key: 'size', render: (size: number) => formatFileSize(size || 0) },
    { title: '记录数', dataIndex: 'recordCount', key: 'records' },
    { title: '状态', dataIndex: 'isSuccess', key: 'success', render: (success: boolean) => success ? <Tag color="green" icon={<CheckCircleOutlined />}>成功</Tag> : <Tag color="red" icon={<CloseCircleOutlined />}>失败</Tag> },
    { title: '创建时间', dataIndex: 'createdAt', key: 'createdAt', render: (date: string) => new Date(date).toLocaleString() },
    {
      title: '操作',
      key: 'actions',
      render: (_: any, record: any) => (
        <Space>
          <Button 
            type="link" 
            icon={<DownloadOutlined />} 
            onClick={() => handleDownload(record.id, record.fileName)}
            loading={downloadLoading === record.id}
          >
            下载
          </Button>
          <Popconfirm title="确定删除此备份？" onConfirm={() => handleDeleteBackup(record.id)}>
            <Button 
              type="link" 
              danger 
              icon={<DeleteOutlined />} 
              loading={deleteLoading === record.id}
            >
              删除
            </Button>
          </Popconfirm>
        </Space>
      ),
    },
  ], [deleteLoading, downloadLoading, formatFileSize, handleDeleteBackup, handleDownload]);

  const successfulBackups = backupHistory.filter((b) => b.isSuccess).length;
  const totalSize = backupHistory.reduce((sum, b) => sum + (b.fileSize || 0), 0);

  return (
    <div className="backup-page">
      <div className="page-header-section">
        <div className="header-left">
          <Title level={2} className="page-title">数据备份与恢复</Title>
          <Text type="secondary">定期备份您的财务数据，确保资产信息安全且可追溯</Text>
        </div>
        <div className="header-actions">
          <Space size="middle">
            <Button 
              icon={<UploadOutlined />} 
              onClick={() => setRestoreModalVisible(true)}
              size="large"
            >
              恢复数据
            </Button>
            <Button 
              type="primary" 
              icon={<PlusOutlined />} 
              onClick={() => setCreateModalVisible(true)}
              size="large"
            >
              创建备份
            </Button>
          </Space>
        </div>
      </div>

      <Row gutter={[24, 24]} className="stats-row">
        <Col xs={24} sm={8}>
          <Card className="stat-card glass-card" variant="borderless">
            <Statistic 
              title="备份总数" 
              value={backupHistory.length} 
              prefix={<DatabaseOutlined style={{ color: 'var(--primary-500)' }} />} 
            />
          </Card>
        </Col>
        <Col xs={24} sm={8}>
          <Card className="stat-card glass-card" variant="borderless">
            <Statistic 
              title="成功备份" 
              value={successfulBackups} 
              valueStyle={{ color: 'var(--success)' }} 
              prefix={<CheckCircleOutlined />}
            />
          </Card>
        </Col>
        <Col xs={24} sm={8}>
          <Card className="stat-card glass-card" variant="borderless">
            <Statistic 
              title="占用空间" 
              value={formatFileSize(totalSize)} 
              prefix={<DownloadOutlined style={{ color: 'var(--info)' }} />}
            />
          </Card>
        </Col>
      </Row>

      <Card 
        className="history-card glass-card" 
        variant="borderless"
        title={
          <div className="card-header-title">
            <div className="title-dot" style={{ backgroundColor: 'var(--primary-500)' }}></div>
            <span>备份历史记录</span>
          </div>
        }
      >
        <Table 
          columns={columns} 
          dataSource={backupHistory} 
          rowKey="id" 
          pagination={{ pageSize: 10, showSizeChanger: true }} 
          className="glass-table"
        />
      </Card>

      <Modal 
        title="创建备份" 
        open={createModalVisible} 
        onCancel={() => setCreateModalVisible(false)} 
        footer={null} 
        width={500} 
        destroyOnHidden
        className="custom-modal"
      >
        <Form form={form} layout="vertical" onFinish={handleCreateBackup} initialValues={{ backupType: 'full', encrypt: true }}>
          <Form.Item name="backupType" label="备份类型" rules={[{ required: true }]}>
            <Select placeholder="选择备份类型" size="large">
              <Option value="full">完整备份（包含所有数据）</Option>
              <Option value="transactions">仅交易记录</Option>
              <Option value="categories">仅分类数据</Option>
              <Option value="debts">仅债务数据</Option>
            </Select>
          </Form.Item>
          <Form.Item name="encrypt" label="加密备份" valuePropName="checked">
            <Switch defaultChecked />
          </Form.Item>
          <Form.Item className="save-btn-container">
            <Space style={{ width: '100%', justifyContent: 'flex-end' }}>
              <Button onClick={() => setCreateModalVisible(false)} size="large">取消</Button>
              <Button type="primary" htmlType="submit" loading={loading} size="large" className="save-btn">创建备份</Button>
            </Space>
          </Form.Item>
        </Form>
      </Modal>

      <Modal 
        title="恢复数据" 
        open={restoreModalVisible} 
        onCancel={() => setRestoreModalVisible(false)} 
        footer={null} 
        width={500} 
        destroyOnHidden
        className="custom-modal"
      >
        <div className="restore-warning">
          <Text type="warning" strong>⚠️ 警告：</Text>
          <Text type="warning">恢复数据将覆盖现有数据，此操作不可撤销，请确保已创建最新备份。</Text>
        </div>
        <Upload.Dragger 
          name="file" 
          beforeUpload={() => false} 
          maxCount={1} 
          onChange={handleFileChange} 
          accept=".json"
          style={{ borderRadius: '16px', overflow: 'hidden' }}
        >
          <p className="ant-upload-drag-icon"><UploadOutlined style={{ color: 'var(--primary-500)' }} /></p>
          <p className="ant-upload-text">点击或拖拽文件到此区域上传</p>
          <p className="ant-upload-hint">支持JSON格式的备份文件</p>
        </Upload.Dragger>
        <div style={{ marginTop: 32, textAlign: 'right' }}>
          <Space size="middle">
            <Button onClick={() => setRestoreModalVisible(false)} size="large">取消</Button>
            <Button type="primary" onClick={handleRestore} loading={restoreLoading} size="large" className="save-btn">开始恢复</Button>
          </Space>
        </div>
      </Modal>
    </div>
  );
};

export default BackupPage;
