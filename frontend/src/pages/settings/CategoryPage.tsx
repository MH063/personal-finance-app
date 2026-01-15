import React, { useEffect, useState, useCallback } from 'react';
import { Typography, Button, Row, Col, Card, Table, Tag, Space, Modal, Form, Input, Select, App as AntdApp, Popconfirm, ColorPicker, Tooltip, Radio, Alert } from 'antd';
import { PlusOutlined, EditOutlined, DeleteOutlined, ExclamationCircleOutlined, ClearOutlined } from '@ant-design/icons';
import { useDispatch, useSelector } from 'react-redux';
import { RootState, AppDispatch } from '../../store';
import { fetchCategories, createCategory, updateCategory, deleteCategory, Category } from '../../store/slices/categorySlice';
import { collaborativeService } from '../../services/collaborativeService';
import { categoryService } from '../../services/categoryService';
import './CategoryPage.css';
import { useSearchParams } from 'react-router-dom';

const { Title, Text } = Typography;
const { Option } = Select;

/**
 * 分类管理页面组件
 * 提供对收入和支出分类的全面管理功能，支持实时同步
 */
const CategoryPage: React.FC = () => {
  const { message } = AntdApp.useApp();
  const dispatch = useDispatch<AppDispatch>();
  const { categories, loading } = useSelector((state: RootState) => state.categories);
  
  const [modalVisible, setModalVisible] = useState(false);
  const [editingCategory, setEditingCategory] = useState<Category | null>(null);
  const [form] = Form.useForm();
  const [submitLoading, setSubmitLoading] = useState(false);
  const [cleaningLoading, setCleaningLoading] = useState(false);
  const [duplicateIds, setDuplicateIds] = useState<Set<string>>(new Set());
  const [pendingCreateType, setPendingCreateType] = useState<'income' | 'expense' | null>(null);
  const [searchParams] = useSearchParams();

  // 删除冲突处理状态
  const [conflictModalVisible, setConflictModalVisible] = useState(false);
  const [conflictData, setConflictData] = useState<{ id: string; message: string; count: number } | null>(null);
  const [deleteOption, setDeleteOption] = useState<'force' | 'migrate'>('force');
  const [migrateTargetId, setMigrateTargetId] = useState<string>('');
  const [confirmDeleteLoading, setConfirmDeleteLoading] = useState(false);

  useEffect(() => {
    dispatch(fetchCategories());
    
    // 初始化实时协作
    const token = localStorage.getItem('accessToken');
    if (token) {
      collaborativeService.init(token);
    }
    
    // 监听实时更新通知
    const handleUpdate = (data: any) => {
      console.log('[CategoryPage] 监听到实时更新:', data);
      // 只要是分类相关的更新，或者重连同步，都刷新数据
      if (data.type?.includes('CATEGORY') || data.type === 'RECONNECTED_SYNC') {
        dispatch(fetchCategories());
      }
    };
    
    collaborativeService.on('ledgerUpdate', handleUpdate);
    collaborativeService.on('globalUpdate', handleUpdate);
    
    // 初次加载服务端重复项
    (async () => {
      try {
        const groups = await categoryService.getDuplicates();
        const ids = new Set<string>();
        groups.forEach((g: any) => {
          (g.categories || []).forEach((c: Category) => ids.add(c.id));
        });
        setDuplicateIds(ids);
      } catch (e) {
        console.warn('[CategoryPage] 获取重复分类失败', e);
      }
    })();
    
    return () => {
      collaborativeService.off('ledgerUpdate', handleUpdate);
      collaborativeService.off('globalUpdate', handleUpdate);
    };
  }, [dispatch]);

  const handleAdd = useCallback(() => {
    setEditingCategory(null);
    setModalVisible(true);
  }, []);

  const handleEdit = useCallback((category: Category) => {
    setEditingCategory(category);
    setModalVisible(true);
  }, []);

  /**
   * 监听模态框显示状态，在显示时初始化表单数据
   * 解决 "Instance created by useForm is not connected to any Form element" 警告
   */
  useEffect(() => {
    if (modalVisible) {
      // 使用 setTimeout 确保 Form 组件已挂载并连接到 useForm 实例
      // 彻底解决 "Instance created by useForm is not connected to any Form element" 警告
      const timer = setTimeout(() => {
        if (editingCategory) {
          form.setFieldsValue({
            name: editingCategory.name,
            type: editingCategory.type,
            icon: editingCategory.icon,
            color: editingCategory.color || '#1677ff',
          });
        } else {
          form.resetFields();
          form.setFieldsValue({ type: pendingCreateType || 'expense', color: '#1677ff' });
        }
      }, 0);
      return () => clearTimeout(timer);
    }
  }, [modalVisible, editingCategory, form, pendingCreateType]);

  /**
   * 处理URL参数以直接打开创建分类窗口
   */
  useEffect(() => {
    const openCreate = searchParams.get('openCreate');
    const typeParam = (searchParams.get('type') || '').toLowerCase();
    if (openCreate && (openCreate === '1' || openCreate === 'true')) {
      const t = typeParam === 'income' ? 'income' : 'expense';
      console.log('[CategoryPage] 检测到 openCreate 请求，打开创建窗口，类型:', t);
      setPendingCreateType(t);
      setEditingCategory(null);
      setModalVisible(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleDelete = useCallback(async (id: string) => {
    try {
      await dispatch(deleteCategory(id)).unwrap();
      message.success('分类已删除');
    } catch (error: any) {
      const errorMsg = error.message || (typeof error === 'string' ? error : '删除失败');
      // 检查是否是关联数据错误 (后端返回消息包含"关联交易")
      if (errorMsg.includes('关联交易')) {
         const match = errorMsg.match(/(\d+)\s*条/);
         const count = match ? parseInt(match[1]) : 0;
         setConflictData({ id, message: errorMsg, count });
         setConflictModalVisible(true);
         setDeleteOption('force');
         setMigrateTargetId('');
      } else {
         message.error(errorMsg);
      }
    }
  }, [dispatch, message]);

  const handleConflictConfirm = async () => {
    if (!conflictData) return;
    
    if (deleteOption === 'migrate' && !migrateTargetId) {
      message.warning('请选择要迁移到的分类');
      return;
    }

    setConfirmDeleteLoading(true);
    try {
      await dispatch(deleteCategory({
        id: conflictData.id,
        options: {
          force: deleteOption === 'force',
          migrateTo: deleteOption === 'migrate' ? migrateTargetId : undefined
        }
      })).unwrap();
      message.success('分类删除成功');
      setConflictModalVisible(false);
      setConflictData(null);
    } catch (error: any) {
       message.error(error.message || (typeof error === 'string' ? error : '操作失败'));
    } finally {
      setConfirmDeleteLoading(false);
    }
  };

  const handleModalSubmit = useCallback(async (values: any) => {
    setSubmitLoading(true);
    try {
      // 处理颜色选择器的值
      const color = typeof values.color === 'string' ? values.color : values.color?.toHexString?.() || '#1677ff';
      const data = { ...values, color };

      if (editingCategory) {
        await dispatch(updateCategory({ id: editingCategory.id, data })).unwrap();
        message.success('分类已更新');
      } else {
        await dispatch(createCategory(data)).unwrap();
        message.success('分类已创建');
      }
      setModalVisible(false);
    } catch (error: any) {
      message.error(error.message || '操作失败');
    } finally {
      setSubmitLoading(false);
    }
  }, [dispatch, editingCategory, message]);

  /**
   * 刷新服务端重复项结果，并更新本地标记
   */
  const refreshDuplicateMarks = useCallback(async () => {
    try {
      const groups = await categoryService.getDuplicates();
      const ids = new Set<string>();
      groups.forEach((g: any) => {
        (g.categories || []).forEach((c: Category) => ids.add(c.id));
      });
      setDuplicateIds(ids);
    } catch (e) {
      console.warn('[CategoryPage] 刷新重复分类失败', e);
    }
  }, []);

  const handleCleanupDuplicates = useCallback(async () => {
    if (duplicateIds.size === 0) return;
    
    Modal.confirm({
      title: '清理重复分类',
      icon: <ExclamationCircleOutlined />,
      content: '系统将自动合并重复分类（保留创建时间最早的记录），并删除其余重复项。此操作不可撤销，是否继续？',
      okText: '确定清理',
      cancelText: '取消',
      onOk: async () => {
        setCleaningLoading(true);
        try {
          const result = await categoryService.cleanupDuplicates();
          message.success(`清理完成，共删除了 ${result.deletedCount} 个重复分类`);
          // 先刷新服务端重复项，再刷新列表，避免旧数据残留
          await refreshDuplicateMarks();
          await dispatch(fetchCategories()).unwrap();
        } catch (error: any) {
          message.error(error.message || '清理失败');
        } finally {
          setCleaningLoading(false);
        }
      }
    });
  }, [duplicateIds, dispatch, message, refreshDuplicateMarks]);

  const columns = [
    {
      title: '分类名称',
      dataIndex: 'name',
      key: 'name',
      render: (text: string, record: Category) => (
        <Space>
          <div 
            style={{ 
              width: 12, 
              height: 12, 
              borderRadius: '50%', 
              backgroundColor: record.color || '#ccc' 
            }} 
          />
          <span style={{ fontWeight: 600 }}>{text}</span>
          {record.isSystem && <Tag color="blue">系统默认</Tag>}
          {duplicateIds.has(record.id) && (
             <Tooltip title="检测到重复分类">
               <ExclamationCircleOutlined style={{ color: '#faad14' }} />
             </Tooltip>
          )}
        </Space>
      ),
    },
    {
      title: '类型',
      dataIndex: 'type',
      key: 'type',
      render: (type: string) => (
        <Tag color={type === 'income' ? 'green' : 'red'}>
          {type === 'income' ? '收入' : '支出'}
        </Tag>
      ),
    },
    {
      title: '图标',
      dataIndex: 'icon',
      key: 'icon',
      render: (icon: string) => icon || '-',
    },
    {
      title: '操作',
      key: 'actions',
      render: (_: any, record: Category) => (
        <Space size="small">
          <Button 
            type="text" 
            icon={<EditOutlined />} 
            onClick={() => handleEdit(record)}
            disabled={record.isSystem}
          >
            编辑
          </Button>
          <Popconfirm
            title="确定要删除该分类吗？"
            description="此操作将永久删除该类型，不可恢复。如果该分类下有关联交易，您将需要选择处理方式。"
            onConfirm={() => handleDelete(record.id)}
            disabled={record.isSystem}
            okText="确定"
            cancelText="取消"
          >
            <Button 
              type="text" 
              danger 
              icon={<DeleteOutlined />} 
              disabled={record.isSystem}
            >
              删除
            </Button>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <div className="category-page">
      <div className="page-header-section">
        <div className="header-left">
          <Title level={2} className="page-title">分类管理</Title>
          <Text type="secondary">自定义您的收支分类，让财务统计更符合您的需求</Text>
        </div>
        <div className="header-actions">
          <Space>
            {duplicateIds.size > 0 && (
              <Button 
                danger 
                icon={<ClearOutlined />} 
                loading={cleaningLoading}
                onClick={handleCleanupDuplicates}
                size="large"
              >
                清理重复项 ({duplicateIds.size})
              </Button>
            )}
            {duplicateIds.size > 0 && (
              <Button 
                onClick={async () => {
                  Modal.confirm({
                    title: '合并重复分类',
                    icon: <ExclamationCircleOutlined />,
                    content: '将交易与预算统一迁移到保留分类（系统分类优先保留），然后删除其他重复项。此操作不可撤销，是否继续？',
                    okText: '确定合并',
                    cancelText: '取消',
                    onOk: async () => {
                      setCleaningLoading(true);
                      try {
                        const result = await categoryService.mergeDuplicates(true);
                        message.success(`合并完成，合并组 ${result.mergedGroups}，迁移交易 ${result.movedTransactions} 条，迁移预算 ${result.movedBudgets} 条`);
                        await refreshDuplicateMarks();
                        await dispatch(fetchCategories()).unwrap();
                      } catch (error: any) {
                        message.error(error.message || '合并失败');
                      } finally {
                        setCleaningLoading(false);
                      }
                    }
                  });
                }}
                size="large"
              >
                合并重复项
              </Button>
            )}
            <Button 
              type="primary" 
              icon={<PlusOutlined />} 
              onClick={handleAdd}
              size="large"
            >
              创建新分类
            </Button>
          </Space>
        </div>
      </div>

      <Row gutter={[24, 24]}>
        <Col span={24}>
          <Card variant="borderless" className="glass-card">
            <Table 
              columns={columns} 
              dataSource={categories} 
              rowKey="id" 
              loading={loading}
              pagination={{
                pageSize: 10,
                showSizeChanger: true,
                showTotal: (total) => `共 ${total} 个分类`,
              }}
              className="glass-table"
            />
          </Card>
        </Col>
      </Row>

      <Modal
        title={editingCategory ? '编辑分类' : '创建新分类'}
        open={modalVisible}
        onOk={() => form.submit()}
        onCancel={() => setModalVisible(false)}
        confirmLoading={submitLoading}
        destroyOnHidden
        className="custom-modal"
        centered
        maskClosable={true}
        keyboard={true}
      >
        <Form form={form} layout="vertical" onFinish={handleModalSubmit}>
          <Form.Item 
            name="name" 
            label="分类名称" 
            dependencies={['type']}
            rules={[
              { required: true, message: '请输入分类名称' },
              ({ getFieldValue }) => ({
                validator(_, value) {
                  if (!value) return Promise.resolve();
                  const type = getFieldValue('type');
                  const isDuplicate = categories.some(c => 
                    c.type === type && 
                    c.name.toLowerCase() === value.toLowerCase() && 
                    c.id !== editingCategory?.id
                  );
                  if (isDuplicate) {
                    return Promise.reject(new Error('该分类已存在，请使用现有分类或输入不同的名称'));
                  }
                  return Promise.resolve();
                },
              }),
            ]}
          >
            <Input placeholder="例如：餐饮、工资、房租" maxLength={20} />
          </Form.Item>
          <Form.Item name="type" label="分类类型" rules={[{ required: true }]}>
            <Select>
              <Option value="expense">支出</Option>
              <Option value="income">收入</Option>
            </Select>
          </Form.Item>
          <Form.Item name="icon" label="图标名称 (可选)">
            <Input placeholder="例如：coffee, shop, wallet" />
          </Form.Item>
          <Form.Item name="color" label="分类颜色">
            <ColorPicker showText />
          </Form.Item>
        </Form>
      </Modal>
      <Modal
        title="删除分类冲突"
        open={conflictModalVisible}
        onOk={handleConflictConfirm}
        onCancel={() => {
          setConflictModalVisible(false);
          setConflictData(null);
        }}
        confirmLoading={confirmDeleteLoading}
        okText="确认删除"
        cancelText="取消"
        okButtonProps={{ danger: true }}
      >
        <Alert
          message="存在关联数据"
          description={conflictData?.message || '该分类下存在关联交易，无法直接删除。'}
          type="warning"
          showIcon
          style={{ marginBottom: 16 }}
        />
        <div style={{ marginBottom: 16 }}>请选择处理方式：</div>
        <Radio.Group 
          onChange={(e) => setDeleteOption(e.target.value)} 
          value={deleteOption}
          style={{ display: 'flex', flexDirection: 'column', gap: 12 }}
        >
          <Radio value="force">
            <Space direction="vertical" size={0}>
              <span style={{ fontWeight: 500 }}>强制删除</span>
              <Text type="secondary" style={{ fontSize: 12 }}>同时删除该分类下的所有交易记录（不可恢复）</Text>
            </Space>
          </Radio>
          <Radio value="migrate">
            <Space direction="vertical" size={0}>
              <span style={{ fontWeight: 500 }}>迁移数据</span>
              <Text type="secondary" style={{ fontSize: 12 }}>将关联交易迁移到其他分类</Text>
            </Space>
          </Radio>
        </Radio.Group>
        
        {deleteOption === 'migrate' && (
          <div style={{ marginTop: 16, paddingLeft: 24 }}>
            <div style={{ marginBottom: 8 }}>选择目标分类：</div>
            <Select
              style={{ width: '100%' }}
              placeholder="请选择目标分类"
              value={migrateTargetId}
              onChange={setMigrateTargetId}
            >
              {categories
                .filter(c => c.id !== conflictData?.id && c.type === (categories.find(t => t.id === conflictData?.id)?.type || 'expense'))
                .map(c => (
                  <Option key={c.id} value={c.id}>{c.name}</Option>
                ))
              }
            </Select>
          </div>
        )}
      </Modal>
    </div>
  );
};

export default CategoryPage;
