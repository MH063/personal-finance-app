import React, { useEffect, useState, useImperativeHandle, forwardRef, useCallback, useMemo } from 'react';
import { Table, Card, Button, Space, Tag, Modal, Form, Input, InputNumber, Select, DatePicker, App as AntdApp, Row, Col, Popconfirm, Alert } from 'antd';
import { PlusOutlined, DeleteOutlined, EditOutlined, ReloadOutlined } from '@ant-design/icons';
import { useDispatch, useSelector } from 'react-redux';
import { useNavigate } from 'react-router-dom';
import dayjs from 'dayjs';
import { RootState, AppDispatch } from '../../store';
import { fetchTransactions, createTransaction, updateTransaction, deleteTransaction, batchDeleteTransactions } from '../../store/slices/transactionSlice';
import { fetchCategories } from '../../store/slices/categorySlice';
import { fetchLedgers } from '../../store/slices/ledgerSlice';
import { aiService } from '../../services/aiService';
import { collaborativeService } from '../../services/collaborativeService';
import type { Transaction } from '../../services/transactionService';
import './TransactionManager.css';

const { Option } = Select;
const { TextArea } = Input;

interface TransactionManagerProps {
  type: 'income' | 'expense';
  title: string;
  themeColor: string;
  showHeader?: boolean;
  onSuccess?: () => void;
}

const TransactionManager = forwardRef<any, TransactionManagerProps>(({ type, title, themeColor, showHeader = true, onSuccess }, ref) => {
  const { message, modal } = AntdApp.useApp();
  const [loading, setLoading] = useState(false);
  const [deleteLoading, setDeleteLoading] = useState<string | null>(null);
  const [batchDeleteLoading, setBatchDeleteLoading] = useState(false);
  const [selectedRowKeys, setSelectedRowKeys] = useState<React.Key[]>([]);
  const [filterLoading, setFilterLoading] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  const [editingTransaction, setEditingTransaction] = useState<Transaction | null>(null);
  const [predicting, setPredicting] = useState(false);
  const [filters, setFilters] = useState({ categoryId: '', ledgerId: '', startDate: '', endDate: '' });
  const [form] = Form.useForm();
  const navigate = useNavigate();

  const dispatch = useDispatch<AppDispatch>();
  const { user } = useSelector((state: RootState) => state.auth);
  const { transactions = [], total = 0, page = 1, limit = 10, loading: txLoading = false } = useSelector((state: RootState) => state.transactions || {});
  const { categories = [] } = useSelector((state: RootState) => state.categories || {});
  const { ledgers = [] } = useSelector((state: RootState) => state.ledger || {});

  const filteredCategories = (categories || []).filter((c) => c.type === type);

  useImperativeHandle(ref, () => ({
    handleAdd
  }));

  useEffect(() => {
    console.log(`[TransactionManager] 加载数据: type=${type}, filters=`, filters);
    dispatch(fetchTransactions({ type, ...filters }) as any);
    dispatch(fetchCategories(type) as any);
    dispatch(fetchLedgers() as any);
    
    // 初始化实时协作
    const token = localStorage.getItem('accessToken');
    if (token) {
      collaborativeService.init(token);
    }
    
    // 监听实时更新
    const handleUpdate = (data: any) => {
      console.log('[TransactionManager] 监听到实时更新:', data);
      
      const updateType = String(data?.type || '');
      const normalizedType = updateType.toLowerCase();
      const payloadData = data?.data;
      const changedLedgerId = payloadData?.ledgerId ?? data?.ledgerId;
      
      // 1. 如果是交易更新，且属于当前账本或全局，刷新交易列表
      const shouldRefreshTransactions =
        normalizedType.startsWith('transaction_') ||
        normalizedType.startsWith('transaction') ||
        normalizedType.startsWith('debt_') ||
        normalizedType.startsWith('debt');

      if (shouldRefreshTransactions) {
        if (!filters.ledgerId || !changedLedgerId || changedLedgerId === filters.ledgerId) {
          dispatch(fetchTransactions({ type, ...filters }) as any);
        }
      }
      
      // 2. 如果是分类更新，刷新分类列表
      if (normalizedType.startsWith('category_') || normalizedType.startsWith('category')) {
        dispatch(fetchCategories(type) as any);
      }
      
      // 3. 如果是账本更新，刷新账本列表
      if (normalizedType.startsWith('ledger_') || normalizedType.startsWith('ledger')) {
        dispatch(fetchLedgers() as any);
      }
    };
    
    collaborativeService.on('ledgerUpdate', handleUpdate);
    
    return () => {
      collaborativeService.off('ledgerUpdate', handleUpdate);
      // 注意：这里不 disconnect，因为其他组件可能还在用
    };
  }, [dispatch, type, filters]);

  const handleFilter = async () => {
    console.log(`[TransactionManager] 执行筛选: filters=`, filters);
    setFilterLoading(true);
    try {
      // 筛选时重置到第一页
      await dispatch(fetchTransactions({ type, ...filters, page: 1 }) as any);
    } finally {
      setFilterLoading(false);
    }
  };

  /**
   * 清除筛选条件并刷新数据
   */
  const handleClearFilters = useCallback(async () => {
    console.log(`[TransactionManager] 清除所有筛选条件`);
    const defaultFilters = { categoryId: '', ledgerId: '', startDate: '', endDate: '' };
    setFilters(defaultFilters);
    
    // 触发刷新操作
    setFilterLoading(true);
    try {
      await dispatch(fetchTransactions({ type, ...defaultFilters, page: 1 }) as any);
    } finally {
      setFilterLoading(false);
    }
  }, [dispatch, type]);

  const handleAdd = useCallback(() => {
    if (loading) return;
    console.log(`[TransactionManager] 打开添加弹窗`);
    setEditingTransaction(null);
    setModalVisible(true);
    setTimeout(() => {
      form.resetFields();
      form.setFieldsValue({ transactionDate: dayjs(), type });
    }, 0);
  }, [form, loading, type]);

  const handleEdit = useCallback((record: Transaction) => {
    if (loading) return;
    console.log(`[TransactionManager] 打开编辑弹窗: id=${record.id}`);
    setEditingTransaction(record);
    setModalVisible(true);
    setTimeout(() => {
      form.setFieldsValue({
        ...record,
        transactionDate: dayjs(record.transactionDate),
      });
    }, 0);
  }, [form, loading]);

  const handleDelete = useCallback(async (id: string) => {
    if (deleteLoading) return;
    console.log(`[TransactionManager] 执行删除: id=${id}`);
    setDeleteLoading(id);
    
    // 检查是否为债务相关记录
    const targetTransaction = transactions.find(t => t.id === id);
    // 判断逻辑：检查 metadata 中是否有 debtId 标识
    const isDebtRecord = targetTransaction && ((targetTransaction as any).metadata?.debtId || (targetTransaction as any).metadata?.isDebtLink);

    try {
      if (isDebtRecord) {
        message.warning('此交易关联至债务记录，请前往债务管理模块进行删除');
        return;
      }
      await dispatch(deleteTransaction(id) as any);
      
      // 仅针对非债务管理模块的记录显示成功提示
      if (!isDebtRecord) {
        message.success('删除成功');
      }
      
      await dispatch(fetchTransactions({ type, ...filters }) as any);
      if (onSuccess) {
        onSuccess();
      }
    } catch (error: any) {
      console.error(`[TransactionManager] 删除失败:`, error);
      message.error(typeof error === 'string' ? error : (error?.message || '删除失败'));
    } finally {
      setDeleteLoading(null);
    }
  }, [dispatch, filters, message, type, onSuccess, deleteLoading, transactions]);

  const handleBatchDelete = useCallback(async () => {
    if (selectedRowKeys.length === 0 || batchDeleteLoading) return;

    // 检查选中的记录是否全部为债务相关记录
    const selectedTransactions = transactions.filter(t => selectedRowKeys.includes(t.id));
    const allDebtRecords = selectedTransactions.length > 0 && selectedTransactions.every(t => 
      (t as any).metadata?.debtId || (t as any).metadata?.isDebtLink
    );
    // 过滤掉债务关联记录，仅提交可删除的ID
    const idsToDelete = selectedTransactions
      .filter(t => !((t as any).metadata?.debtId || (t as any).metadata?.isDebtLink))
      .map(t => t.id);
    
    modal.confirm({
      title: '批量删除',
      content: `确定要删除选中的 ${selectedRowKeys.length} 条记录吗？此操作将永久删除记录，不可恢复。`,
      okText: '永久删除',
      okType: 'danger',
      cancelText: '取消',
      onOk: async () => {
        setBatchDeleteLoading(true);
        try {
          if (idsToDelete.length === 0) {
            message.warning('选中的记录均为债务关联交易，无法删除，请前往债务管理模块操作');
            return;
          }
          await dispatch(batchDeleteTransactions(idsToDelete) as any);
          
          // 仅当包含非债务记录时，才显示成功提示
          if (!allDebtRecords) {
            message.success('批量删除成功');
          }

          setSelectedRowKeys([]);
          await dispatch(fetchTransactions({ type, ...filters }) as any);
          if (onSuccess) {
            onSuccess();
          }
        } catch (error: any) {
          console.error(`[TransactionManager] 批量删除失败:`, error);
          message.error('部分记录删除失败');
        } finally {
          setBatchDeleteLoading(false);
        }
      },
    });
  }, [selectedRowKeys, batchDeleteLoading, modal, dispatch, type, filters, message, onSuccess, transactions]);

  const handleSubmit = async (values: any) => {
    console.log(`[TransactionManager] 提交表单: values=`, values);
    
    // 重复记录检查
    if (!editingTransaction) {
      const isDuplicate = transactions.some(t => 
        t.amount === values.amount && 
        dayjs(t.transactionDate).format('YYYY-MM-DD') === values.transactionDate.format('YYYY-MM-DD') &&
        t.categoryId === values.categoryId &&
        t.ledgerId === values.ledgerId
      );

      if (isDuplicate) {
        const confirmed = await new Promise((resolve) => {
          modal.confirm({
            title: '疑似重复记录',
            content: '系统检测到已存在一笔金额、日期、分类完全相同的记录，确定要再次添加吗？',
            okText: '确定添加',
            cancelText: '取消',
            onOk: () => resolve(true),
            onCancel: () => resolve(false),
          });
        });
        if (!confirmed) return;
      }
    }

    setLoading(true);
    try {
      const data = {
        ...values,
        type, // 显式包含交易类型 (income 或 expense)
        transactionDate: values.transactionDate.format('YYYY-MM-DD'),
      };

      console.log(`[TransactionManager] 准备提交交易数据: type=${type}, action=${editingTransaction ? 'UPDATE' : 'CREATE'}`, data);

      if (editingTransaction) {
        await dispatch(updateTransaction({ id: editingTransaction.id, data }) as any);
        message.success('更新成功');
      } else {
        await dispatch(createTransaction(data) as any);
        message.success('添加成功');
      }

      setModalVisible(false);
      await dispatch(fetchTransactions({ type, ...filters }) as any);
      
      // 触发成功回调，通知父组件刷新相关数据（如概览统计）
      if (onSuccess) {
        onSuccess();
      }
    } catch (error: any) {
      console.error(`[TransactionManager] 提交失败:`, error);
      message.error(typeof error === 'string' ? error : (error?.message || '操作失败'));
    } finally {
      setLoading(false);
    }
  };

  const handleJumpToDebtEdit = useCallback(async () => {
    const debtId = (editingTransaction as any)?.metadata?.debtId;
    if (!debtId) {
      message.warning('未找到关联债务，无法跳转');
      return;
    }

    console.log('[TransactionManager] 跳转至债务编辑:', { transactionId: editingTransaction?.id, debtId });
    setModalVisible(false);

    requestAnimationFrame(() => {
      navigate(`/debt?editDebtId=${encodeURIComponent(debtId)}`, { state: { editDebtId: debtId } });
    });
  }, [editingTransaction, message, navigate]);


  const handleDescriptionBlur = async (e: React.FocusEvent<HTMLTextAreaElement>) => {
    const description = e.target.value;
    if (!description || editingTransaction || form.getFieldValue('categoryId')) return;

    setPredicting(true);
    try {
      const categoryId = await aiService.predictCategory(description);
      if (categoryId) {
        // 检查预测的分类是否在当前类型的分类列表中
        const exists = filteredCategories.some(c => c.id === categoryId);
        if (exists) {
          form.setFieldsValue({ categoryId });
          message.info('AI 已根据您的描述自动选择分类');
        }
      }
    } catch (error) {
      console.error('AI 预测失败:', error);
    } finally {
      setPredicting(false);
    }
  };

  const columns = useMemo(() => [
    { 
      title: '分类/备注', 
      key: 'category', 
      width: 220,
      render: (_: any, record: Transaction) => (
        <div className="category-column">
          <div className="category-name">{record.category?.name || '未分类'}</div>
          <div className="description-sub">{record.description || '无备注'}</div>
        </div>
      )
    },
    { 
      title: '金额', 
      dataIndex: 'amount', 
      key: 'amount', 
      width: 150,
      render: (amount: number) => (
        <div className={`amount-column ${type}`}>
          <div className="amount-value">
            {type === 'expense' ? '-' : '+'}¥{amount.toLocaleString('zh-CN', { minimumFractionDigits: 2 })}
          </div>
        </div>
      )
    },
    { 
      title: '支付方式', 
      dataIndex: 'paymentMethod', 
      key: 'method',
      width: 120,
      render: (method: string) => {
        const methods: Record<string, { label: string, color: string }> = {
          bank_card: { label: '银行卡', color: 'blue' },
          alipay: { label: '支付宝', color: 'cyan' },
          wechat: { label: '微信', color: 'green' },
          cash: { label: '现金', color: 'orange' },
          other: { label: '其他', color: 'purple' }
        };
        const config = methods[method] || { label: method || '其他', color: 'purple' };
        return <Tag color={config.color} className="method-tag">{config.label}</Tag>;
      }
    },
    {
      title: '账本',
      key: 'ledger',
      width: 120,
      render: (_: any, record: Transaction) => {
        // 优先使用后端返回的关联对象，否则尝试从本地 ledgers 列表匹配
        const ledgerName = record.ledger?.name || ledgers.find(l => l.id === record.ledgerId)?.name || '默认账本';
        return <Tag color="purple">{ledgerName}</Tag>;
      }
    },
    { 
      title: '交易日期', 
      dataIndex: 'transactionDate', 
      key: 'date', 
      width: 120,
      render: (date: string) => (
        <div className="date-column">
          <div className="date-main">{dayjs(date).format('MM-DD')}</div>
          <div className="date-sub">{dayjs(date).format('YYYY')}</div>
        </div>
      ),
      sorter: (a: Transaction, b: Transaction) => dayjs(a.transactionDate).unix() - dayjs(b.transactionDate).unix()
    },
    {
      title: '管理操作',
      key: 'actions',
      width: 150,
      fixed: 'right' as const,
      render: (_: any, record: Transaction) => {
        // 权限判断：只有交易创建者、账本所有者或管理员可以修改/删除
        const ledger = ledgers.find(l => l.id === record.ledgerId);
        const isCreator = record.userId === user?.id;
        const userRole = ledger?.ownerId === user?.id 
          ? 'owner' 
          : ledger?.members?.find((m: any) => m.userId === user?.id)?.role;
        
        const canManage = isCreator || userRole === 'owner' || userRole === 'admin';

        return (
          <Space size="small">
            <Button 
              type="text" 
              icon={<EditOutlined />} 
              onClick={() => handleEdit(record)}
              className="action-btn edit"
              disabled={!canManage}
            />
            <Popconfirm 
              title="删除记录" 
              description="此操作将永久删除该记录，不可恢复，确定要继续吗？"
              onConfirm={() => handleDelete(record.id)}
              okText="确定"
              cancelText="取消"
              disabled={!canManage}
            >
              <Button 
                type="text" 
                danger 
                icon={<DeleteOutlined />} 
                loading={deleteLoading === record.id}
                className="action-btn delete"
                disabled={!canManage}
              />
            </Popconfirm>
          </Space>
        );
      },
    },
  ], [deleteLoading, handleDelete, handleEdit, ledgers, type, user?.id]);

  return (
    <div className={`transaction-manager ${type}-manager`}>
      <Card 
        variant="borderless"
        className="glass-card custom-table-card"
        title={showHeader ? (
          <div className="card-header-title">
            <div className="title-dot" style={{ backgroundColor: themeColor }}></div>
            <span>{title}</span>
          </div>
        ) : (
          selectedRowKeys.length > 0 ? (
            <div className="card-header-title">
              <div className="title-dot" style={{ backgroundColor: '#f87171' }}></div>
              <span>已选中 {selectedRowKeys.length} 条记录</span>
            </div>
          ) : null
        )} 
        extra={(showHeader || selectedRowKeys.length > 0) ? (
          <Space>
            {selectedRowKeys.length > 0 && (
              <Button 
                danger 
                icon={<DeleteOutlined />} 
                onClick={handleBatchDelete}
                loading={batchDeleteLoading}
                size="large"
                className="batch-delete-btn"
              >
                批量删除
              </Button>
            )}
            {showHeader && (
              <Button 
                type="primary" 
                icon={<PlusOutlined />} 
                onClick={handleAdd}
                className="add-button"
                size="large"
                style={{ backgroundColor: themeColor, borderColor: themeColor }}
              >
                添加新记录
              </Button>
            )}
          </Space>
        ) : null}
      >
        <div className="filter-section">
          <Row gutter={[16, 16]} align="middle">
            <Col xs={24} sm={12} md={8}>
              <div className="filter-label">分类筛选</div>
              <Select 
                placeholder="全部分类" 
                style={{ width: '100%' }} 
                value={filters.categoryId || undefined}
                onChange={(val) => {
                  setFilters({ ...filters, categoryId: val || '' });
                }}
                size="large"
                suffixIcon={<PlusOutlined rotate={45} />}
              >
                {filteredCategories.filter(c => c && c.id).map(c => <Option key={c.id} value={c.id}>{c.name}</Option>)}
              </Select>
            </Col>
            <Col xs={24} sm={12} md={8}>
              <div className="filter-label">账本筛选</div>
              <Select 
                placeholder="全部账本" 
                style={{ width: '100%' }} 
                value={filters.ledgerId || undefined}
                onChange={(val) => {
                  setFilters({ ...filters, ledgerId: val || '' });
                }}
                size="large"
              >
                {ledgers.filter(l => l && l.id).map(l => <Option key={l.id} value={l.id}>{l.name}</Option>)}
              </Select>
            </Col>
            <Col xs={24} sm={24} md={8}>
              <div className="filter-label">时间范围</div>
              <DatePicker.RangePicker 
                style={{ width: '100%' }}
                size="large"
                value={(filters.startDate && filters.endDate) ? [dayjs(filters.startDate), dayjs(filters.endDate)] : null}
                onChange={(dates) => {
                  setFilters({ 
                    ...filters, 
                    startDate: dates ? dates[0]?.startOf('day').toISOString() || '' : '', 
                    endDate: dates ? dates[1]?.endOf('day').toISOString() || '' : '' 
                  });
                }}
                placeholder={['开始日期', '结束日期']}
              />
            </Col>
            <Col xs={24} sm={24} md={6}>
              <div className="filter-label">&nbsp;</div>
              <Space style={{ width: '100%' }}>
                <Button 
                  type="primary" 
                  onClick={handleFilter} 
                  style={{ flex: 1 }}
                  size="large"
                  loading={filterLoading}
                  className="filter-submit-btn"
                >
                  执行筛选
                </Button>
                <Button 
                  onClick={handleClearFilters}
                  size="large"
                  icon={<ReloadOutlined />}
                  title="重置筛选"
                  className="filter-reset-btn"
                />
              </Space>
            </Col>
          </Row>
        </div>

        <div className="table-container">
          <Table 
            rowSelection={{
              selectedRowKeys,
              onChange: (keys) => setSelectedRowKeys(keys),
            }}
            columns={columns} 
            dataSource={transactions} 
            rowKey="id" 
            loading={txLoading}
            pagination={{ 
              total, 
              current: page,
              pageSize: limit,
              showSizeChanger: true,
              showTotal: (total) => `共 ${total} 条记录`
            }}
            onChange={(pagination) => {
              const { current, pageSize } = pagination;
              dispatch(fetchTransactions({ 
                type, 
                ...filters, 
                page: current, 
                limit: pageSize 
              }) as any);
            }}
            scroll={{ x: 1000 }}
            className="glass-table transaction-table"
          />
        </div>
      </Card>

      <Modal
        title={editingTransaction ? `编辑${title}` : `添加${title}`}
        open={modalVisible}
        onOk={editingTransaction?.metadata?.isDebtLink ? handleJumpToDebtEdit : () => form.submit()}
        onCancel={() => setModalVisible(false)}
        okText={editingTransaction?.metadata?.isDebtLink ? '跳转至债务编辑' : undefined}
        confirmLoading={loading}
        destroyOnHidden
        className="custom-modal"
        width={600}
        centered
        maskClosable={true}
        keyboard={true}
        okButtonProps={{ 
          style: { backgroundColor: themeColor, borderColor: themeColor },
          size: 'large',
          className: 'modal-ok-button'
        }}
        cancelButtonProps={{ size: 'large' }}
      >
        <Form form={form} layout="vertical" onFinish={handleSubmit} className="modern-form">
          {editingTransaction?.metadata?.isDebtLink && (
            <Alert
              message="仅查看模式"
              description="此交易关联至债务记录，为保证数据一致性，请前往“债务管理”模块进行修改。"
              type="info"
              showIcon
              style={{ marginBottom: 24 }}
            />
          )}
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item name="categoryId" label="分类" rules={[{ required: true, message: '请选择分类' }]}>
                <Select 
                  placeholder="选择分类" 
                  size="large"
                  disabled={!!editingTransaction?.metadata?.isDebtLink}
                  popupRender={(menu) => (
                    <>
                      {menu}
                      <Space style={{ padding: '8px', borderTop: '1px solid #f0f0f0' }}>
                        <Button 
                          type="text" 
                          icon={<PlusOutlined />} 
                          onClick={() => {
                            navigate(`/categories?openCreate=1&type=${type}`);
                            setModalVisible(false);
                          }}
                          block
                        >
                          新增分类
                        </Button>
                      </Space>
                    </>
                  )}
                >
                  {filteredCategories.filter(c => c && c.id).map(c => <Option key={c.id} value={c.id}>{c.name}</Option>)}
                </Select>
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="ledgerId" label="账本" rules={[{ required: true, message: '请选择账本' }]}>
                <Select placeholder="选择账本" size="large" disabled={!!editingTransaction?.metadata?.isDebtLink}>
                  {ledgers.filter(l => l && l.id).map(l => <Option key={l.id} value={l.id}>{l.name}</Option>)}
                </Select>
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={16}>
            <Col span={24}>
              <Form.Item name="transactionDate" label="日期" rules={[{ required: true, message: '请选择日期' }]}>
                <DatePicker 
                  style={{ width: '100%' }} 
                  size="large" 
                  disabled={!!editingTransaction?.metadata?.isDebtLink}
                />
              </Form.Item>
            </Col>
          </Row>

          <Form.Item 
            name="amount" 
            label="金额" 
            rules={[
              { required: true, message: '请输入金额' },
              { 
                type: 'number', 
                transform: (value) => (value === '' || value === null || value === undefined ? value : Number(value)),
                max: 999999999999, 
                message: '金额不能超过 999,999,999,999' 
              }
            ]}
          >
            <InputNumber 
              style={{ width: '100%' }} 
              min={0.01} 
              precision={2} 
              placeholder="0.00" 
              size="large"
              prefix="¥"
              disabled={!!editingTransaction?.metadata?.isDebtLink}
            />
          </Form.Item>

          <Form.Item name="paymentMethod" label="支付方式" rules={[{ required: true, message: '请选择支付方式' }]}>
            <Select 
              placeholder="选择支付方式" 
              size="large"
              disabled={!!editingTransaction?.metadata?.isDebtLink}
            >
              <Option value="cash">现金</Option>
              <Option value="alipay">支付宝</Option>
              <Option value="wechat">微信</Option>
              <Option value="bank_card">银行卡</Option>
              <Option value="other">其他</Option>
            </Select>
          </Form.Item>

          <Form.Item name="description" label="备注">
            <TextArea 
              rows={3} 
              placeholder={predicting ? "AI 正在分析您的描述..." : "添加备注信息..."}
              disabled={predicting || !!editingTransaction?.metadata?.isDebtLink}
              showCount 
              maxLength={200} 
              onBlur={handleDescriptionBlur}
            />
          </Form.Item>
        </Form>
      </Modal>

    </div>
  );
});

TransactionManager.displayName = 'TransactionManager';

// End of TransactionManager component
export default TransactionManager;
