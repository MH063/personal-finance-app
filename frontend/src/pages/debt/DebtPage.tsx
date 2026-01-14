import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { Table, Card, Button, Space, Tag, Modal, Form, Input, InputNumber, Select, DatePicker, App as AntdApp, Row, Col, Progress, Popconfirm, Statistic, Typography } from 'antd';
import { SyncOutlined, PlusOutlined, DeleteOutlined, EditOutlined, DollarOutlined, ArrowDownOutlined, ArrowUpOutlined, ClockCircleOutlined, ReloadOutlined } from '@ant-design/icons';
import { useDispatch, useSelector } from 'react-redux';
import dayjs from 'dayjs';
import { RootState, AppDispatch } from '../../store';
import { fetchDebts, createDebt, updateDebt, deleteDebt, fetchDebtStatistics, repayDebt, syncDebtsToTransactions, Debt } from '../../store/slices/debtSlice';
import { collaborativeService } from '../../services/collaborativeService';
import './DebtPage.css';

const { Option } = Select;
const { TextArea } = Input;
const { Title, Text } = Typography;

const DebtPage: React.FC = () => {
  const { message } = AntdApp.useApp();
  const [loading, setLoading] = useState(false);
  const [paymentLoading, setPaymentLoading] = useState(false);
  const [deleteLoading, setDeleteLoading] = useState<string | null>(null);
  const [modalVisible, setModalVisible] = useState(false);
  const [paymentModalVisible, setPaymentModalVisible] = useState(false);
  const [editingDebt, setEditingDebt] = useState<Debt | null>(null);
  const [selectedDebt, setSelectedDebt] = useState<Debt | null>(null);
  const [filters, setFilters] = useState({ debtType: '', status: '' });
  const [form] = Form.useForm();
  const [paymentForm] = Form.useForm();

  const [syncLoading, setSyncLoading] = useState(false);

  const dispatch = useDispatch<AppDispatch>();
  const { debts, statistics, loading: debtLoading } = useSelector((state: RootState) => state.debts);

  const loadDebts = useCallback((currentFilters = filters) => {
    dispatch(fetchDebts(currentFilters) as any);
  }, [dispatch, filters]);

  const handleSync = async () => {
    setSyncLoading(true);
    try {
      const result = await dispatch(syncDebtsToTransactions() as any).unwrap();
      message.success(`同步成功：补全了 ${result.debtsSynced} 笔债务流水和 ${result.paymentsSynced} 笔还款流水`);
      loadDebts();
    } catch (error: any) {
      message.error(error || '同步失败');
    } finally {
      setSyncLoading(false);
    }
  };

  const handleFilterChange = (key: string, value: any) => {
    const newFilters = { ...filters, [key]: value || '' };
    setFilters(newFilters);
  };

  const handleClearFilters = () => {
    const defaultFilters = { debtType: '', status: '' };
    setFilters(defaultFilters);
    loadDebts(defaultFilters);
  };

  const handleExecuteFilter = () => {
    loadDebts();
  };

  useEffect(() => {
    loadDebts();
    dispatch(fetchDebtStatistics() as any);

    // 监听更新
    const handleUpdate = (data: any) => {
      console.log('[DebtPage] 监听到实时更新:', data);
      loadDebts();
      dispatch(fetchDebtStatistics() as any);
    };

    collaborativeService.on('ledgerUpdate', handleUpdate);
    collaborativeService.on('globalUpdate', handleUpdate);

    return () => {
      collaborativeService.off('ledgerUpdate', handleUpdate);
      collaborativeService.off('globalUpdate', handleUpdate);
    };
  }, [dispatch, loadDebts]);

  const handleAdd = useCallback(() => {
    if (loading) return;
    setEditingDebt(null);
    setModalVisible(true);
    setTimeout(() => {
      form.resetFields();
      form.setFieldsValue({ debtType: 'borrow', isReminderEnabled: true });
    }, 0);
  }, [form, loading]);

  const handleEdit = useCallback((record: Debt) => {
    if (loading) return;
    setEditingDebt(record);
    setModalVisible(true);
    setTimeout(() => {
      form.setFieldsValue({ ...record, dueDate: record.dueDate ? dayjs(record.dueDate) : null });
    }, 0);
  }, [form, loading]);

  const handleDelete = useCallback(async (id: string) => {
    if (deleteLoading) return;
    setDeleteLoading(id);
    try {
      await dispatch(deleteDebt(id) as any);
      message.success('删除成功');
      loadDebts();
      dispatch(fetchDebtStatistics() as any);
    } catch (error: any) {
      message.error(typeof error === 'string' ? error : (error?.message || '删除失败'));
    } finally {
      setDeleteLoading(null);
    }
  }, [deleteLoading, dispatch, loadDebts, message]);

  const handleSubmit = useCallback(async (values: any) => {
    setLoading(true);
    try {
      const data = {
        ...values,
        dueDate: values.dueDate?.format('YYYY-MM-DD'),
      };

      if (editingDebt) {
        await dispatch(updateDebt({ id: editingDebt.id, data }) as any);
        message.success('更新成功');
      } else {
        await dispatch(createDebt(data) as any);
        message.success('添加成功');
      }

      setModalVisible(false);
      loadDebts();
      dispatch(fetchDebtStatistics() as any);
    } catch (error: any) {
      message.error(typeof error === 'string' ? error : (error?.message || '操作失败'));
    } finally {
      setLoading(false);
    }
  }, [editingDebt, dispatch, loadDebts, message]);

  const handleAddPayment = useCallback((record: Debt) => {
    if (paymentLoading) return;
    setSelectedDebt(record);
    setPaymentModalVisible(true);
    setTimeout(() => {
      paymentForm.resetFields();
      paymentForm.setFieldsValue({ paymentDate: dayjs() });
    }, 0);
  }, [paymentForm, paymentLoading]);

  const handlePaymentSubmit = useCallback(async (values: any) => {
    if (!selectedDebt) return;
    setPaymentLoading(true);
    try {
      await dispatch(repayDebt({ 
        id: selectedDebt.id, 
        amount: values.amount, 
        paymentDate: values.paymentDate.format('YYYY-MM-DD') 
      }) as any);
      message.success('还款记录已添加');
      setPaymentModalVisible(false);
      loadDebts();
      dispatch(fetchDebtStatistics() as any);
    } catch (error: any) {
      message.error(typeof error === 'string' ? error : (error?.message || '还款失败'));
    } finally {
      setPaymentLoading(false);
    }
  }, [selectedDebt, dispatch, loadDebts, message]);

  const getStatusConfig = useCallback((status: string) => {
    const config: Record<string, { color: string; text: string; icon?: React.ReactNode }> = {
      pending: { color: 'orange', text: '待还' },
      partial: { color: 'blue', text: '部分还款' },
      paid: { color: 'green', text: '已还清' },
      overdue: { color: 'red', text: '已逾期' },
    };
    return config[status] || { color: 'default', text: status };
  }, []);

  const columns = useMemo(() => [
    { 
      title: '对象/类型', 
      key: 'debtor',
      width: 180,
      render: (_: any, record: Debt) => (
        <div className="debtor-column">
          <div className="debtor-name">{record.debtorName}</div>
          <Tag color={record.debtType === 'borrow' ? 'orange' : 'cyan'} className="type-tag">
            {record.debtType === 'borrow' ? '借入' : '借出'}
          </Tag>
        </div>
      )
    },
    { 
      title: '金额/待还', 
      key: 'amount',
      width: 160,
      render: (_: any, record: Debt) => (
        <div className="amount-column">
          <div className={`original-amount ${record.debtType === 'borrow' ? 'borrow' : 'lend'}`}>
            {record.debtType === 'borrow' ? '-' : '+'}¥{Number(record.originalAmount).toFixed(2)}
          </div>
          <div className="remaining-amount">待还: ¥{Number(record.remainingAmount).toFixed(2)}</div>
        </div>
      )
    },
    { 
      title: '还款进度', 
      key: 'progress',
      width: 200,
      render: (_: any, record: Debt) => {
        const paidPercent = record.paidPercentage ?? Math.round((1 - record.remainingAmount / record.originalAmount) * 100);
        const statusConfig = getStatusConfig(record.status);
        return (
          <div className="progress-column">
            <Progress 
              percent={paidPercent} 
              size="small" 
              status={record.status === 'overdue' ? 'exception' : record.status === 'paid' ? 'success' : 'normal'} 
              strokeColor={record.status === 'paid' ? '#10b981' : undefined}
            />
            <div className="status-row">
              <Tag color={statusConfig.color}>
                {statusConfig.text}
              </Tag>
            </div>
          </div>
        );
      }
    },
    { 
      title: '到期日', 
      dataIndex: 'dueDate', 
      key: 'dueDate',
      width: 120,
      render: (date: string) => (
        <div className="date-column">
          <div className="date-main">{date ? dayjs(date).format('MM-DD') : '-'}</div>
          <div className="date-sub">{date ? dayjs(date).format('YYYY') : ''}</div>
        </div>
      )
    },
    {
      title: '管理操作',
      key: 'actions',
      width: 150,
      fixed: 'right' as const,
      render: (_: any, record: Debt) => (
        <Space size="small">
          {record.status !== 'paid' && (
            <Button 
              type="text" 
              icon={<DollarOutlined />} 
              onClick={() => handleAddPayment(record)}
              className="action-btn pay"
              title="还款"
            />
          )}
          <Button 
            type="text" 
            icon={<EditOutlined />} 
            onClick={() => handleEdit(record)}
            className="action-btn edit"
          />
          <Popconfirm 
            title="删除债务" 
            description="确定要删除这条债务记录吗？"
            onConfirm={() => handleDelete(record.id)}
            okText="确定"
            cancelText="取消"
          >
            <Button 
              type="text" 
              danger 
              icon={<DeleteOutlined />} 
              className="action-btn delete"
            />
          </Popconfirm>
        </Space>
      ),
    },
  ], [getStatusConfig, handleAddPayment, handleEdit, handleDelete]);

  return (
    <div className="debt-page">
      <div className="page-header-section">
        <div className="header-left">
          <Title level={2} className="page-title">债务管理</Title>
          <Text type="secondary">跟踪借入与借出的款项，管理还款进度</Text>
        </div>
        <div className="header-actions">
          <Button 
            icon={<SyncOutlined spin={syncLoading} />} 
            onClick={handleSync}
            loading={syncLoading}
            size="large"
            className="sync-btn"
            style={{ marginRight: 8 }}
          >
            同步历史数据
          </Button>
          <Button 
            type="primary" 
            icon={<PlusOutlined />} 
            onClick={handleAdd}
            size="large"
            className="add-btn"
          >
            添加债务
          </Button>
        </div>
      </div>

      <Row gutter={[24, 24]} className="stats-row">
        <Col xs={24} sm={12} lg={6}>
          <Card className="stats-card income" variant="borderless">
            <div className="stats-card-icon">
              <ArrowDownOutlined />
            </div>
            <Statistic title="总借入" value={statistics.totalBorrowed} precision={2} prefix="¥" />
            <div className="stats-card-footer">
              <Tag color="error">待还金额: ¥{statistics.totalPendingAmount?.toFixed(2)}</Tag>
            </div>
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card className="stats-card lend" variant="borderless">
            <div className="stats-card-icon">
              <ArrowUpOutlined />
            </div>
            <Statistic title="总借出" value={statistics.totalLent} precision={2} prefix="¥" />
            <div className="stats-card-footer">
              <Tag color="success">待收金额: ¥{statistics.totalLent?.toFixed(2)}</Tag>
            </div>
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card className="stats-card pending" variant="borderless">
            <div className="stats-card-icon">
              <ClockCircleOutlined />
            </div>
            <Statistic title="待处理笔数" value={statistics.pendingDebts} suffix="笔" />
            <div className="stats-card-footer">
              <Text type="secondary">含 {statistics.dueSoonDebts || 0} 笔近期到期</Text>
            </div>
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card className="stats-card overdue" variant="borderless">
            <div className="stats-card-icon">
              <DeleteOutlined />
            </div>
            <Statistic title="逾期笔数" value={statistics.overdueDebts} suffix="笔" valueStyle={{ color: '#ef4444' }} />
            <div className="stats-card-footer">
              <Tag color="error">需尽快处理</Tag>
            </div>
          </Card>
        </Col>
      </Row>

      <Card className="glass-card custom-table-card" variant="borderless">
        <div className="filter-section" style={{ marginBottom: 20, padding: '0 4px' }}>
          <Row gutter={16} align="bottom">
            <Col xs={24} sm={8} md={6}>
              <div className="filter-label" style={{ marginBottom: 8, fontSize: 13, color: 'var(--neutral-500)' }}>债务类型</div>
              <Select 
                placeholder="全部类型" 
                style={{ width: '100%' }} 
                value={filters.debtType || undefined}
                onChange={(val) => handleFilterChange('debtType', val)}
                size="large"
              >
                <Option value="borrow">借入</Option>
                <Option value="lend">借出</Option>
              </Select>
            </Col>
            <Col xs={24} sm={8} md={6}>
              <div className="filter-label" style={{ marginBottom: 8, fontSize: 13, color: 'var(--neutral-500)' }}>还款状态</div>
              <Select 
                placeholder="全部状态" 
                style={{ width: '100%' }} 
                value={filters.status || undefined}
                onChange={(val) => handleFilterChange('status', val)}
                size="large"
              >
                <Option value="pending">待还/待收</Option>
                <Option value="paid">已结清</Option>
                <Option value="overdue">已逾期</Option>
              </Select>
            </Col>
            <Col xs={24} sm={8} md={6}>
              <Space style={{ width: '100%' }}>
                <Button 
                  type="primary" 
                  onClick={handleExecuteFilter}
                  size="large"
                  style={{ flex: 1 }}
                >
                  查询
                </Button>
                <Button 
                  onClick={handleClearFilters}
                  size="large"
                  icon={<ReloadOutlined />}
                  title="重置筛选"
                />
              </Space>
            </Col>
          </Row>
        </div>
        <Table 
          columns={columns} 
          dataSource={debts} 
          rowKey="id" 
          loading={debtLoading} 
          pagination={{ 
            pageSize: 10, 
            showSizeChanger: true,
            showTotal: (total) => `共 ${total} 条记录`
          }} 
          scroll={{ x: 800 }}
          className="glass-table transaction-table"
        />
      </Card>

      <Modal 
        title={editingDebt ? '编辑债务' : '添加债务'} 
        open={modalVisible} 
        onCancel={() => setModalVisible(false)} 
        footer={null} 
        width={600} 
        destroyOnClose
        className="custom-modal"
        centered
        maskClosable={true}
        keyboard={true}
      >
        <Form form={form} layout="vertical" onFinish={handleSubmit} className="modern-form">
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item name="debtorName" label="对象名称" rules={[{ required: true }]}><Input placeholder="姓名或单位名称" /></Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="debtType" label="债务类型" rules={[{ required: true }]}>
                <Select>
                  <Option value="borrow">借入（我欠别人）</Option>
                  <Option value="lend">借出（别人欠我）</Option>
                </Select>
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item 
                name="originalAmount" 
                label="金额" 
                rules={[
                  { required: true, message: '请输入金额' },
                  { type: 'number', max: 999999999999, message: '金额不能超过 999,999,999,999' }
                ]}
              >
                <InputNumber min={0.01} precision={2} style={{ width: '100%' }} prefix="¥" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="interestRate" label="利率（%）"><InputNumber min={0} max={100} precision={2} style={{ width: '100%' }} /></Form.Item>
            </Col>
          </Row>
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item name="dueDate" label="约定还款日期"><DatePicker style={{ width: '100%' }} /></Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="isReminderEnabled" label="到期提醒" valuePropName="checked">
                <Select><Option value={true}>启用提醒</Option><Option value={false}>禁用提醒</Option></Select>
              </Form.Item>
            </Col>
          </Row>
          <Form.Item name="description" label="备注说明"><TextArea rows={3} placeholder="添加更多细节信息..." /></Form.Item>
          <div className="modal-footer">
            <Space>
              <Button onClick={() => setModalVisible(false)} size="large">取消</Button>
              <Button type="primary" htmlType="submit" loading={loading} size="large" className="submit-btn">{editingDebt ? '保存更新' : '立即创建'}</Button>
            </Space>
          </div>
        </Form>
      </Modal>

      <Modal 
        title="还款记录" 
        open={paymentModalVisible} 
        onCancel={() => setPaymentModalVisible(false)} 
        confirmLoading={paymentLoading}
        footer={null} 
        width={500} 
        destroyOnClose
        className="custom-modal"
        centered
        maskClosable={true}
        keyboard={true}
      >
        <Form form={paymentForm} layout="vertical" onFinish={handlePaymentSubmit} className="modern-form">
          <div className="payment-info-card">
            <div className="info-label">还款对象: {selectedDebt?.debtorName}</div>
            <div className="info-amount">待还金额: <span>¥{Number(selectedDebt?.remainingAmount || 0).toFixed(2)}</span></div>
          </div>
          <Form.Item 
            name="amount" 
            label="本次还款金额" 
            rules={[
              { required: true, message: '请输入还款金额' },
              { type: 'number', max: 999999999999, message: '金额超出限制' }
            ]}
          >
            <InputNumber min={0.01} max={Number(selectedDebt?.remainingAmount) || 999999} precision={2} style={{ width: '100%' }} prefix="¥" />
          </Form.Item>
          <Form.Item name="paymentDate" label="还款日期" rules={[{ required: true }]}><DatePicker style={{ width: '100%' }} /></Form.Item>
          <Form.Item name="note" label="备注"><TextArea rows={2} placeholder="添加备注..." /></Form.Item>
          <div className="modal-footer">
            <Space>
              <Button onClick={() => setPaymentModalVisible(false)} size="large">取消</Button>
              <Button type="primary" htmlType="submit" size="large" className="submit-btn">确认还款</Button>
            </Space>
          </div>
        </Form>
      </Modal>
    </div>
  );
};

export default DebtPage;
