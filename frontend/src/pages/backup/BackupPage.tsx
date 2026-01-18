import React, { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, Button, Table, Space, Tag, Modal, Form, Upload, App as AntdApp, Row, Col, Typography, Popconfirm, Statistic, Select, Switch, Input, Tooltip } from 'antd';
import { DatabaseOutlined, UploadOutlined, DownloadOutlined, DeleteOutlined, PlusOutlined, CheckCircleOutlined, CloseCircleOutlined, SyncOutlined, ClockCircleOutlined, SearchOutlined, ReloadOutlined, EyeOutlined } from '@ant-design/icons';
import backupService from '../../services/backupService';
import { collaborativeService } from '../../services/collaborativeService';
import { sha256 } from '../../utils/crypto';
import './BackupPage.css';

const { Title, Text } = Typography;
const { Option } = Select;

const BackupPage: React.FC = () => {
  const navigate = useNavigate();
  const { message, modal } = AntdApp.useApp();
  const [loading, setLoading] = useState(false);
  const [restoreLoading, setRestoreLoading] = useState(false);
  const [downloadLoading, setDownloadLoading] = useState<string | null>(null);
  const [downloadProgress, setDownloadProgress] = useState<Record<string, { 
    status: 'waiting' | 'downloading' | 'verifying' | 'completed' | 'failed' | 'retrying', 
    percent: number,
    error?: string,
    retryCount?: number
  }>>({});
  const [deleteLoading, setDeleteLoading] = useState<string | null>(null);
  const [restoreActionLoading, setRestoreActionLoading] = useState<string | null>(null);
  const [lastRestoredId, setLastRestoredId] = useState<string | null>(null);
  const [backupHistory, setBackupHistory] = useState<any[]>([]);
  const [searchText, setSearchText] = useState('');
  const [filterType, setFilterType] = useState('all');
  const [refreshing, setRefreshing] = useState(false);
  const isFetchingRef = useRef(false);
  const [createModalVisible, setCreateModalVisible] = useState(false);
  const [restoreModalVisible, setRestoreModalVisible] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [form] = Form.useForm();
  const [fileFingerprint, setFileFingerprint] = useState<string | null>(null);
  const [uploadedHashes, setUploadedHashes] = useState<Set<string>>(new Set());

  // 初始化上传过的文件指纹缓存
  useEffect(() => {
    const cached = localStorage.getItem('backup_uploaded_hashes');
    if (cached) {
      try {
        const data = JSON.parse(cached);
        // 如果是旧格式（数组），则转换并添加时间戳
        if (Array.isArray(data)) {
          setUploadedHashes(new Set(data));
          localStorage.setItem('backup_uploaded_hashes', JSON.stringify({
            hashes: data,
            timestamp: Date.now()
          }));
        } else if (data && data.hashes) {
          // 缓存有效期 24 小时
          if (Date.now() - data.timestamp < 24 * 60 * 60 * 1000) {
            setUploadedHashes(new Set(data.hashes));
          } else {
            localStorage.removeItem('backup_uploaded_hashes');
          }
        }
      } catch (e) {
        console.error('解析文件指纹缓存失败:', e);
      }
    }
  }, []);

  /**
   * 计算文件指纹 (SHA-256)
   * 性能要求: < 500ms
   */
  const calculateFingerprint = async (file: File): Promise<string> => {
    const start = performance.now();
    const arrayBuffer = await file.arrayBuffer();
    const hashHex = await sha256(arrayBuffer);
    const end = performance.now();
    console.log(`[Performance] 文件指纹计算耗时: ${(end - start).toFixed(2)}ms`);
    return hashHex;
  };

  const loadBackupHistory = useCallback(async (showSuccess = false) => {
    if (isFetchingRef.current) return;
    isFetchingRef.current = true;
    setRefreshing(true);
    try {
      const data = await backupService.getBackupHistory();
      setBackupHistory(data);
      if (showSuccess) {
        message.success('数据已更新');
      }
    } catch (error: any) {
      message.error(typeof error === 'string' ? error : (error?.message || '获取备份历史失败'));
    } finally {
      // 保持至少 300ms 的加载状态，提供视觉反馈并防抖
      setTimeout(() => {
        setRefreshing(false);
        isFetchingRef.current = false;
      }, 300);
    }
  }, [message]);

  useEffect(() => {
    loadBackupHistory(false);
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

  const handleDownload = useCallback(async (backupId: string, fileName: string, fileSize: number, expectedChecksum: string) => {
    if (downloadLoading === backupId) return;
    
    const MAX_RETRIES = 3;
    let currentRetry = 0;

    const executeDownload = async () => {
      // 初始化/更新状态
      setDownloadProgress(prev => ({
        ...prev,
        [backupId]: { 
          status: currentRetry > 0 ? 'retrying' : 'waiting', 
          percent: 0,
          retryCount: currentRetry
        }
      }));
      setDownloadLoading(backupId);

      try {
        console.log(`[Backup] 开始下载文件: ${fileName}, 预期大小: ${fileSize}, 预期校验和: ${expectedChecksum}`);
        
        const response = await backupService.downloadBackup(
          backupId, 
          (progressEvent) => {
            const percent = Math.round((progressEvent.loaded * 100) / (progressEvent.total || fileSize));
            setDownloadProgress(prev => ({
              ...prev,
              [backupId]: { ...prev[backupId], status: 'downloading', percent }
            }));
          }
        );

        // 下载完成，进入校验阶段
        setDownloadProgress(prev => ({
          ...prev,
          [backupId]: { ...prev[backupId], status: 'verifying', percent: 100 }
        }));
        console.log(`[Backup] 下载完成，开始校验文件完整性...`);

        const blob = response.data;
        const isValid = await backupService.verifyFileIntegrity(blob, fileSize, expectedChecksum);

        if (!isValid) {
          throw new Error('文件校验失败：下载的文件哈希值与服务器不匹配，文件可能已损坏');
        }

        console.log(`[Backup] 文件校验通过，正在保存到本地...`);
        
        setDownloadProgress(prev => ({
          ...prev,
          [backupId]: { status: 'completed', percent: 100 }
        }));

        const url = window.URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.setAttribute('download', fileName);
        document.body.appendChild(link);
        link.click();
        link.remove();
        window.URL.revokeObjectURL(url);
      } catch (error: any) {
        console.error(`[Backup] 下载过程中出错 (重试 ${currentRetry}/${MAX_RETRIES}):`, error);
        
        if (currentRetry < MAX_RETRIES) {
          currentRetry++;
          const delay = Math.pow(2, currentRetry) * 1000; // 指数退避
          console.log(`[Backup] 将在 ${delay}ms 后进行第 ${currentRetry} 次重试...`);
          
          setDownloadProgress(prev => ({
            ...prev,
            [backupId]: { 
              ...prev[backupId], 
              status: 'retrying', 
              error: `下载失败，准备重试 (${currentRetry}/${MAX_RETRIES})...` 
            }
          }));

          setTimeout(executeDownload, delay);
        } else {
          setDownloadProgress(prev => ({
            ...prev,
            [backupId]: { 
              status: 'failed', 
              percent: prev[backupId]?.percent || 0,
              error: typeof error === 'string' ? error : (error?.message || '下载失败')
            }
          }));
          message.error(`文件下载失败: ${error?.message || '未知错误'}`);
        }
      } finally {
        if (currentRetry >= MAX_RETRIES || !downloadProgress[backupId] || downloadProgress[backupId].status === 'completed') {
          setDownloadLoading(null);
        }
      }
    };

    await executeDownload();
  }, [downloadLoading, message, downloadProgress]);

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

  const handleRestore = useCallback(async () => {
    if (!selectedFile) {
      message.error('请选择备份文件');
      return;
    }

    // 再次校验指纹（防止用户绕过 handleFileChange）
    if (fileFingerprint && uploadedHashes.has(fileFingerprint)) {
      message.warning('该文件已上传过，请勿重复提交');
      return;
    }

    if (restoreLoading) return;

    setRestoreLoading(true);
    try {
      // 获取表单中的密码
      const password = form.getFieldValue('restorePassword');
      console.log('[Backup] 开始上传并恢复文件:', selectedFile.name, password ? '包含密码' : '无密码');
      
      const res = await backupService.uploadAndRestore(selectedFile, password);
      message.success(`本地文件恢复成功，共恢复 ${res?.restoredCount || 0} 条记录`);
      
      // 成功恢复后，记录指纹到缓存
      if (fileFingerprint) {
        const newHashes = new Set(uploadedHashes);
        newHashes.add(fileFingerprint);
        setUploadedHashes(newHashes);
        localStorage.setItem('backup_uploaded_hashes', JSON.stringify({
          hashes: Array.from(newHashes),
          timestamp: Date.now()
        }));
      }

      setRestoreModalVisible(false);
      setSelectedFile(null);
      setFileFingerprint(null);
      form.resetFields();
      
      // 刷新历史记录以获取最新的 isRestored 状态
      loadBackupHistory();
      
      // 发送全局更新通知，因为恢复数据会影响所有模块
      collaborativeService.emit('globalUpdate', { type: 'restore' });

      // 提示用户刷新页面
      modal.success({
        title: '数据恢复成功',
        content: '为了确保所有页面都能正确显示恢复后的数据，建议立即刷新页面。',
        okText: '立即刷新',
        onOk: () => {
          window.location.reload();
        }
      });
    } catch (error: any) {
      console.error('[Backup] 恢复失败:', error);
      // 优先使用 API 拦截器处理过的 formattedMessage，其次是 message
      const errorMsg = typeof error === 'string' ? error : (error?.formattedMessage || error?.message || '恢复失败，请检查密码或文件格式');
      
      if (errorMsg.includes('无需重复恢复')) {
        message.warning('该备份数据已在系统中，无需重复恢复');
        loadBackupHistory();
      } else {
        message.error(errorMsg);
      }
    } finally {
      // 设置 500ms 的防抖延迟
      setTimeout(() => {
        setRestoreLoading(false);
      }, 500);
    }
  }, [fileFingerprint, form, loadBackupHistory, message, modal, restoreLoading, selectedFile, uploadedHashes]);

  /**
   * 直接从服务器历史记录恢复数据
   */
  const handleRestoreFromHistory = useCallback(async (backupId: string) => {
    // 前端防重复点击校验 (500ms 内)
    if (restoreActionLoading === backupId) return;
    
    // 检查前端缓存状态
    if (lastRestoredId === backupId) {
      message.info('该数据刚刚已恢复成功，无需重复操作');
      return;
    }

    const password = '';
    
    setRestoreActionLoading(backupId);
    try {
      console.log(`[Backup] 触发历史记录恢复: ID=${backupId}`);
      const res = await backupService.restoreBackup(backupId, password);
      
      message.success(`恢复成功，共恢复 ${res?.restoredCount || 0} 条记录`);
      
      // 恢复成功后，重置本地状态并刷新所有数据
      setLastRestoredId(backupId);
      loadBackupHistory();
      
      // 发送全局更新通知
      collaborativeService.emit('globalUpdate', { type: 'restore' });

      // 提示用户刷新页面以加载新数据，或者自动执行一些关键数据的刷新
      modal.success({
        title: '数据恢复成功',
        content: '为了确保所有页面都能正确显示恢复后的数据，建议立即刷新页面。',
        okText: '立即刷新',
        onOk: () => {
          window.location.reload();
        }
      });
    } catch (error: any) {
      console.error('[Backup] 历史记录恢复失败:', error);
      // 优先使用 API 拦截器处理过的 formattedMessage，其次是 message
      const errorMsg = typeof error === 'string' ? error : (error?.formattedMessage || error?.message || '恢复失败');
      
      if (errorMsg.includes('无需重复恢复')) {
        message.warning('数据已存在，无需重复恢复');
        loadBackupHistory(); // 同步后端状态
      } else {
        message.error(errorMsg);
      }
    } finally {
      // 延迟重置 loading 状态，增加操作间隔感
      setTimeout(() => {
        setRestoreActionLoading(null);
      }, 500);
    }
  }, [lastRestoredId, loadBackupHistory, message, modal, restoreActionLoading]);

  const handleFileChange = useCallback(async (info: any) => {
    if (info.fileList.length > 0) {
      const file = info.fileList[0].originFileObj;
      setSelectedFile(file);
      
      // 立即计算指纹并校验
      try {
        const hash = await calculateFingerprint(file);
        setFileFingerprint(hash);
        
        if (uploadedHashes.has(hash)) {
          message.warning('该文件已上传过，请勿重复提交');
        }
      } catch (error) {
        console.error('计算文件指纹失败:', error);
      }
    } else {
      setSelectedFile(null);
      setFileFingerprint(null);
    }
  }, [uploadedHashes, message]);

  /**
   * 格式化文件大小显示
   * 遵循二进制系统标准：1 KB = 1024 Bytes, 1 MB = 1024 KB, 1 GB = 1024 MB
   * @param bytes 字节数
   * @returns 格式化后的字符串 (如 "44.63 KB")
   */
  const formatFileSize = useCallback((bytes: number) => {
    if (!bytes || bytes <= 0) return '0 B';
    
    // 强制转换为数字，防止后端返回字符串导致计算错误
    const byteValue = Number(bytes);
    if (isNaN(byteValue)) return '0 B';

    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    
    // 计算数量级 i
    const i = Math.floor(Math.log(byteValue) / Math.log(k));
    
    // 确保索引不越界
    const unitIndex = Math.min(i, sizes.length - 1);
    
    // 计算数值并保留两位小数
    const value = byteValue / Math.pow(k, unitIndex);
    
    // 关键位置打印日志方便调试：记录原始字节与转换后的数值
    console.log(`[FileFormat] Original: ${byteValue} bytes, Unit Index: ${unitIndex}, Formatted: ${value.toFixed(2)} ${sizes[unitIndex]}`);
    
    return `${parseFloat(value.toFixed(2))} ${sizes[unitIndex]}`;
  }, []);

  /**
   * 格式化备份显示名称
   * 采用标准化命名格式："[备份类型首字母缩写][YYYYMMDD][记录数]"
   * 示例：FBK2312251500
   */
  const formatDisplayName = useCallback((record: any) => {
    const { backupType, createdAt, recordCount } = record;
    
    // 获取类型缩写
    let typeAbbr = 'BK';
    switch(backupType) {
      case 'full': typeAbbr = 'FBK'; break;
      case 'transactions': typeAbbr = 'TBK'; break;
      case 'categories': typeAbbr = 'CBK'; break;
      case 'debts': typeAbbr = 'DBK'; break;
    }

    // 格式化日期 YYYYMMDD -> YYMMDD (根据示例 DBK2312251500，2023年是23)
    const date = new Date(createdAt);
    const year = date.getFullYear().toString().slice(-2);
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    const day = date.getDate().toString().padStart(2, '0');
    
    const formattedName = `${typeAbbr}${year}${month}${day}${recordCount || 0}`;
    
    // 界面显示截断为12字符以内
    return formattedName.length > 12 ? `${formattedName.substring(0, 11)}…` : formattedName;
  }, []);

  /**
   * 清除筛选条件
   */
  const handleClearFilters = useCallback(() => {
    setSearchText('');
    setFilterType('all');
    // 如果有刷新接口的逻辑，可以一并触发
    loadBackupHistory(false);
  }, [loadBackupHistory]);

  const filteredHistory = useMemo(() => {
    return backupHistory.filter(item => {
      const matchesSearch = item.fileName?.toLowerCase().includes(searchText.toLowerCase()) || 
                           formatDisplayName(item).toLowerCase().includes(searchText.toLowerCase());
      const matchesType = filterType === 'all' || item.backupType === filterType;
      return matchesSearch && matchesType;
    });
  }, [backupHistory, searchText, filterType, formatDisplayName]);

  const columns = useMemo(() => [
    { 
      title: '备份类型', 
      dataIndex: 'backupType', 
      key: 'type', 
      width: 100,
      align: 'center' as const,
      render: (type: string, record: any) => {
        let color = 'default';
        let label = '未知';
        
        switch(type) {
          case 'full': color = 'blue'; label = '完整备份'; break;
          case 'transactions': color = 'cyan'; label = '交易记录'; break;
          case 'categories': color = 'purple'; label = '分类数据'; break;
          case 'debts': color = 'orange'; label = '债务数据'; break;
          default: label = type || '设置';
        }
        
        return (
          <Space direction="vertical" size={0}>
            <Tag color={color} className="backup-type-tag">
              {label}
            </Tag>
            {record.isRestored && (
              <Tag color="green" style={{ fontSize: '10px', marginTop: 2 }}>
                已恢复
              </Tag>
            )}
          </Space>
        );
      } 
    },
    { 
      title: '文件名', 
      key: 'displayName', 
      width: 120,
      align: 'center' as const,
      render: (_: any, record: any) => (
        <Typography.Text ellipsis={{ tooltip: record.fileName }} className="compact-font">
          {formatDisplayName(record)}
        </Typography.Text>
      )
    },
    {
      title: '备份状态',
      dataIndex: 'isSuccess',
      key: 'status',
      width: 80,
      align: 'center' as const,
      render: (isSuccess: boolean, record: any) => (
        <div className="status-tag-container">
          {isSuccess ? 
            <Tag color="success" icon={<CheckCircleOutlined />} className="status-tag">成功</Tag> : 
            <Tag color="error" icon={<CloseCircleOutlined />} className="status-tag">失败</Tag>
          }
          {record.isEncrypted && <Tag color="warning" icon={<ClockCircleOutlined />} className="status-tag" style={{ marginTop: 4 }}>加密</Tag>}
        </div>
      )
    },
    {
      title: '大小',
      dataIndex: 'fileSize',
      key: 'size',
      width: 90,
      align: 'center' as const,
      sorter: (a: any, b: any) => (a.fileSize || 0) - (b.fileSize || 0),
      render: (size: number) => <span className="compact-font">{formatFileSize(size)}</span>
    },
    { 
      title: '记录数', 
      dataIndex: 'recordCount', 
      key: 'records',
      width: 80,
      align: 'center' as const,
      sorter: (a: any, b: any) => (a.recordCount || 0) - (b.recordCount || 0),
      render: (count: number) => <span className="compact-font">{count ?? 0} 条</span>
    },
    { 
      title: '时间', 
      dataIndex: 'createdAt', 
      key: 'createdAt', 
      width: 160,
      align: 'center' as const,
      sorter: (a: any, b: any) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
      defaultSortOrder: 'descend' as const,
      render: (date: string) => (
        <span className="compact-font">
          {new Date(date).toLocaleString('zh-CN', { 
            year: 'numeric', 
            month: '2-digit', 
            day: '2-digit', 
            hour: '2-digit', 
            minute: '2-digit', 
            second: '2-digit',
            hour12: false 
          })}
        </span>
      )
    },
    {
      title: '操作',
      key: 'actions',
      width: 180,
      fixed: 'right' as const,
      align: 'center' as const,
      render: (_: any, record: any) => {
        const state = downloadProgress[record.id];
        const isDownloading = downloadLoading === record.id;
        
        return (
          <Space size={8} className="table-actions" style={{ justifyContent: 'center', width: '100%' }}>
            {isDownloading && state ? (
              <span className="compact-font" style={{ color: 'var(--primary-500)' }}>
                {state.percent}%
              </span>
            ) : (
              <>
                {record.isSuccess && (
                  <>
                    <Popconfirm 
                      title="确定从该备份恢复数据吗？"
                      description={record.isRestored ? "该备份已恢复过一次，继续操作将再次覆盖当前数据。" : "这将覆盖当前系统中的所有数据，此操作不可撤销。"}
                      onConfirm={() => handleRestoreFromHistory(record.id)}
                      okText="确定恢复"
                      cancelText="取消"
                      okButtonProps={{ danger: true }}
                      disabled={record.isRestored}
                    >
                      <Button 
                        type="link"
                        size="small"
                        icon={<SyncOutlined />}
                        loading={restoreActionLoading === record.id}
                        className="compact-action-btn"
                        style={{ color: record.isRestored ? 'var(--neutral-400)' : 'var(--primary-500)' }}
                        disabled={record.isRestored}
                        title={record.isRestored ? "该数据已存在，无需重复恢复" : "恢复数据"}
                      >
                        {record.isRestored ? '已恢复' : '恢复'}
                      </Button>
                    </Popconfirm>
                    {record.isRestored && (
                      <Tooltip title="查看已恢复的交易数据">
                        <Button 
                          type="link"
                          size="small"
                          icon={<EyeOutlined />}
                          onClick={() => navigate('/transactions')}
                          className="compact-action-btn"
                          style={{ color: 'var(--success-500)' }}
                        >
                          查看
                        </Button>
                      </Tooltip>
                    )}
                  </>
                )}
                <Button 
                  type="link" 
                  size="small"
                  icon={<DownloadOutlined />} 
                  onClick={() => handleDownload(record.id, record.fileName, Number(record.fileSize), record.checksum)}
                  loading={isDownloading}
                  className="compact-action-btn"
                  disabled={!record.isSuccess}
                >
                  下载
                </Button>
                <Popconfirm title="确定删除？" onConfirm={() => handleDeleteBackup(record.id)} okText="是" cancelText="否">
                  <Button 
                    type="link" 
                    size="small"
                    danger 
                    icon={<DeleteOutlined />} 
                    loading={deleteLoading === record.id}
                    className="compact-action-btn"
                  >
                    删除
                  </Button>
                </Popconfirm>
              </>
            )}
          </Space>
        );
      },
    },
  ], [deleteLoading, downloadLoading, downloadProgress, formatDisplayName, formatFileSize, handleDeleteBackup, handleDownload, handleRestoreFromHistory, navigate, restoreActionLoading]);

  const successfulBackups = backupHistory.filter((b) => b.isSuccess).length;
  // 修复：确保使用 Number 进行数值累加，防止后端返回字符串导致 4.26 GB 这种错误的字符串拼接结果
  const totalSize = backupHistory.reduce((sum, b) => {
    const size = Number(b.fileSize || 0);
    return sum + (isNaN(size) ? 0 : size);
  }, 0);

  // 关键位置打印日志：确认总大小累加过程
  console.log(`[BackupStats] Total Items: ${backupHistory.length}, Calculated Total Size: ${totalSize} bytes (${formatFileSize(totalSize)})`);

  return (
    <div className="backup-page">
      <div className="page-header-section">
        <div className="header-left">
          <Title level={2} className="page-title">数据备份与恢复</Title>
          <Text type="secondary">定期备份您的财务数据，确保资产信息安全且可追溯</Text>
        </div>
        <div className="header-actions">
          <Space size="middle">
            <Tooltip title="从本地上传备份文件并恢复。系统会自动校验数据唯一性，防止重复恢复相同内容。">
              <Button 
                icon={<UploadOutlined />} 
                onClick={() => setRestoreModalVisible(true)}
                size="large"
                loading={restoreLoading}
              >
                恢复数据
              </Button>
            </Tooltip>
            <Button 
              type="primary" 
              icon={<PlusOutlined />} 
              onClick={() => setCreateModalVisible(true)}
              size="large"
              loading={loading}
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
              styles={{ content: { color: 'var(--success)' } }} 
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
            <div className="title-content">
              <span>备份历史记录</span>
              <Text type="secondary" className="title-desc">管理您的数据安全节点，支持按需恢复或下载历史备份</Text>
            </div>
          </div>
        }
        extra={
          <Button 
            type="text" 
            icon={<ReloadOutlined spin={refreshing} />} 
            onClick={() => loadBackupHistory(true)}
            className={`refresh-btn ${refreshing ? 'refreshing' : ''}`}
            disabled={refreshing}
          >
            刷新
          </Button>
        }
      >
        <div className="table-filter-bar">
          <Row gutter={16} align="middle">
            <Col xs={24} sm={12} md={8}>
              <Space.Compact style={{ width: '100%' }}>
                <Input
                  placeholder="搜索文件名..."
                  value={searchText}
                  onChange={e => setSearchText(e.target.value)}
                  onPressEnter={() => {
                    console.log('用户通过回车触发搜索:', searchText);
                    loadBackupHistory(true);
                  }}
                  className="raw-search-input"
                />
                <Button 
                  type="primary" 
                  icon={<SearchOutlined />}
                  onClick={() => {
                    console.log('用户点击按钮触发搜索:', searchText);
                    loadBackupHistory(true);
                  }}
                  className="raw-search-btn"
                  loading={refreshing}
                >
                  搜索
                </Button>
              </Space.Compact>
            </Col>
            <Col xs={24} sm={12} md={6}>
              <Space style={{ width: '100%' }}>
                <Select
                  value={filterType}
                  onChange={setFilterType}
                  style={{ flex: 1 }}
                  className="filter-select"
                  popupMatchSelectWidth={false}
                >
                  <Option value="all">所有类型</Option>
                  <Option value="full">完整备份</Option>
                  <Option value="transactions">交易记录</Option>
                  <Option value="categories">分类数据</Option>
                  <Option value="debts">债务数据</Option>
                </Select>
                <Button 
                  onClick={handleClearFilters}
                  icon={<ReloadOutlined />}
                  title="重置筛选"
                />
              </Space>
            </Col>
            <Col flex="auto"></Col>
            <Col>
              <Text type="secondary" className="record-count">
                共 {filteredHistory.length} 条记录
              </Text>
            </Col>
          </Row>
        </div>
        <Table 
          columns={columns} 
          dataSource={filteredHistory} 
          rowKey="id" 
          pagination={{ 
            pageSize: 10, 
            showSizeChanger: true,
            showTotal: (total) => `共 ${total} 条`
          }} 
          className="glass-table"
          scroll={{ x: 'max-content' }}
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
        centered
        maskClosable={false}
        keyboard={false}
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
        width={400} 
        destroyOnHidden
        className="custom-modal"
        centered
        maskClosable={false}
        keyboard={false}
      >
        <div className="restore-warning">
          <Text type="warning" strong>⚠️ 警告：</Text>
          <Text type="warning">恢复数据将覆盖现有数据，此操作不可撤销，请确保已创建最新备份。</Text>
        </div>
        
        <Form form={form} layout="vertical" onFinish={handleRestore}>
          <Form.Item label="备份文件" required>
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
          </Form.Item>

          <Form.Item 
            name="restorePassword" 
            label="解密密码" 
            tooltip="如果备份文件已加密，请输入加密时设置的密码。目前系统使用统一安全密钥，若未设置特定密码可留空。"
          >
            <Input.Password placeholder="请输入解密密码（可选）" size="large" />
          </Form.Item>

          <div style={{ marginTop: 24, textAlign: 'right' }}>
            <Space size="middle">
              <Button onClick={() => setRestoreModalVisible(false)} size="large">取消</Button>
              <Button 
                type="primary" 
                htmlType="submit" 
                loading={restoreLoading} 
                size="large" 
                className="save-btn"
                disabled={!selectedFile || (!!fileFingerprint && uploadedHashes.has(fileFingerprint))}
              >
                开始恢复
              </Button>
            </Space>
          </div>
        </Form>
      </Modal>
    </div>
  );
};

export default BackupPage;
