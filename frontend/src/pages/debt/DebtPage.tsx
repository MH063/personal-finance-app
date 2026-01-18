import React, { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import { Table, Card, Button, Space, Tag, Modal, Form, Input, InputNumber, Select, DatePicker, App as AntdApp, Row, Col, Progress, Popconfirm, Statistic, Typography, Tooltip } from 'antd';
import { SyncOutlined, PlusOutlined, DeleteOutlined, EditOutlined, DollarOutlined, ArrowDownOutlined, ArrowUpOutlined, ClockCircleOutlined, ReloadOutlined, QuestionCircleOutlined } from '@ant-design/icons';
import { useDispatch, useSelector } from 'react-redux';
import { useLocation, useNavigate } from 'react-router-dom';
import dayjs from 'dayjs';
import { RootState, AppDispatch } from '../../store';
import { fetchDebts, createDebt, updateDebt, deleteDebt, fetchDebtStatistics, repayDebt, syncDebtsToTransactions, Debt } from '../../store/slices/debtSlice';
import { collaborativeService } from '../../services/collaborativeService';
import debtService from '../../services/debtService';
import { disableFutureDate } from '../../utils/dateUtils';
import './DebtPage.css';

const { Option } = Select;
const { TextArea } = Input;
const { Title, Text } = Typography;

const REPAYMENT_TYPES = [
  { label: '自定义还款', value: 'custom' },
  { label: '等额本息 (每月固定)', value: 'equal_loan_payments' },
  { label: '等额本金 (首月最多)', value: 'equal_principal_payments' },
  { label: '先息后本 (按月付息)', value: 'interest_first' },
  { label: '一次性还本付息', value: 'one_time_payment' },
];

const REPAYMENT_DAY_ADJUSTMENTS = [
  { label: '不调整 (保持原日期)', value: 'none' },
  { label: '顺延至下一个工作日', value: 'workday' },
];

const DebtPage: React.FC = () => {
  const { message } = AntdApp.useApp();
  const location = useLocation();
  const navigate = useNavigate();
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
  const [pendingPayments, setPendingPayments] = useState<any[]>([]);
  const [selectedPendingPayment, setSelectedPendingPayment] = useState<string | null>(null);

  const [calculationResult, setCalculationResult] = useState<{
    totalPayment: number;
    totalInterest: number;
    monthlyPayment?: number;
    firstMonthPayment?: number;
    lastPayment?: number;
  } | null>(null);

  const calculateRepayment = useCallback((values: any) => {
    const { originalAmount, interestRate, duration, repaymentType, loanDate } = values;
    if (!originalAmount || interestRate === undefined || !duration || !repaymentType || repaymentType === 'custom') {
      setCalculationResult(null);
      return;
    }
    
    const P = Number(originalAmount);
    const r = Number(interestRate) / 100 / 12; // 月利率
    const n = Number(duration); // 月数

    if (P <= 0 || n <= 0) {
        setCalculationResult(null);
        return;
    }

    let result: any = {};
    
    try {
      if (repaymentType === 'equal_loan_payments') { // 等额本息
        if (r === 0) {
            const monthly = P / n;
            result = { totalPayment: P, totalInterest: 0, monthlyPayment: monthly };
        } else {
            const monthly = (P * r * Math.pow(1 + r, n)) / (Math.pow(1 + r, n) - 1);
            const total = monthly * n;
            result = { totalPayment: total, totalInterest: total - P, monthlyPayment: monthly };
        }
      } else if (repaymentType === 'equal_principal_payments') { // 等额本金
        const totalInterest = (n + 1) * P * r / 2;
        const total = P + totalInterest;
        const firstMonth = (P / n) + (P * r);
        result = { totalPayment: total, totalInterest: totalInterest, firstMonthPayment: firstMonth };
      } else if (repaymentType === 'interest_first') { // 先息后本
        const monthlyInterest = P * r;
        const totalInterest = monthlyInterest * n;
        const total = P + totalInterest;
        result = { totalPayment: total, totalInterest: totalInterest, monthlyPayment: monthlyInterest, lastPayment: P + monthlyInterest };
      } else if (repaymentType === 'one_time_payment') { // 一次性还本付息
        // 单利计算: Interest = P * (AnnualRate/12) * Months
        const totalInterest = P * r * n; 
        const total = P + totalInterest;
        result = { totalPayment: total, totalInterest: totalInterest };
      }
      
      setCalculationResult(result);
      
      // 自动计算 DueDate
      if (loanDate && n) {
          const startDate = dayjs(loanDate);
          const dueDate = startDate.add(n, 'month');
          form.setFieldValue('dueDate', dueDate);
      }
      
    } catch (e) {
      console.error(e);
      setCalculationResult(null);
    }
  }, [form]);

  const [syncLoading, setSyncLoading] = useState(false);

  const dispatch = useDispatch<AppDispatch>();
  const { debts, statistics, loading: debtLoading } = useSelector((state: RootState) => state.debts);
  const openedFromTransactionRef = useRef<string | null>(null);
  const openedFromPaymentRef = useRef<string | null>(null);

  const loadDebts = useCallback((currentFilters = filters) => {
    dispatch(fetchDebts(currentFilters) as any);
  }, [dispatch, filters]);

  const updateThrottleRef = useRef<number>(0);
  const refreshDebts = useCallback(() => {
    const now = Date.now();
    if (now - updateThrottleRef.current < 800) {
      return;
    }
    updateThrottleRef.current = now;
    loadDebts();
    dispatch(fetchDebtStatistics() as any);
  }, [loadDebts, dispatch]);

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
      refreshDebts();
    };

    collaborativeService.on('ledgerUpdate', handleUpdate);
    collaborativeService.on('globalUpdate', handleUpdate);

    return () => {
      collaborativeService.off('ledgerUpdate', handleUpdate);
      collaborativeService.off('globalUpdate', handleUpdate);
    };
  }, [dispatch, loadDebts, refreshDebts]);

  const handleAdd = useCallback(() => {
    if (loading) return;
    setEditingDebt(null);
    setCalculationResult(null); // 清空之前的计算结果
    setModalVisible(true);
    setTimeout(() => {
      form.resetFields();
      form.setFieldsValue({ 
        debtType: 'borrow', 
        isReminderEnabled: true, 
        paymentMethod: 'other',
        repaymentDay: dayjs().date(), // 默认为当前日期
        repaymentDayAdjustment: 'none'
      });
    }, 0);
  }, [form, loading]);

  const handleEdit = useCallback((record: Debt) => {
    if (loading) return;
    setEditingDebt(record);
    setCalculationResult(null); // 先清空，若有数据后续会自动重新计算
    setModalVisible(true);
    setTimeout(() => {
      let durationVal = undefined;
      // 尝试自动计算期限
      if (record.loanDate && record.dueDate) {
          const start = dayjs(record.loanDate);
          const end = dayjs(record.dueDate);
          const months = end.diff(start, 'month');
          if (months > 0) durationVal = months;
      }

      form.setFieldsValue({ 
        ...record, 
        originalAmount: Number(record.originalAmount),
        interestRate: record.interestRate ? Number(record.interestRate) : undefined,
        dueDate: record.dueDate ? dayjs(record.dueDate) : null,
        loanDate: record.loanDate ? dayjs(record.loanDate) : null,
        repaymentType: record.repaymentType || 'custom',
        duration: durationVal
      });

      // 如果信息完整，触发一次智能计算展示
      if (record.originalAmount && record.interestRate && durationVal && record.repaymentType && record.loanDate && record.repaymentType !== 'custom') {
         calculateRepayment({
             originalAmount: Number(record.originalAmount),
             interestRate: Number(record.interestRate),
             duration: durationVal,
             repaymentType: record.repaymentType,
             loanDate: dayjs(record.loanDate)
         });
      }
    }, 0);
  }, [form, loading, calculateRepayment]);

  const requestedDebtId = useMemo(() => {
    const stateId = (location.state as any)?.editDebtId;
    const queryId = new URLSearchParams(location.search).get('editDebtId');
    return String(stateId || queryId || '');
  }, [location.search, location.state]);

  const requestedPayDebtId = useMemo(() => {
    const stateId = (location.state as any)?.payDebtId;
    const queryId = new URLSearchParams(location.search).get('payDebtId');
    return String(stateId || queryId || '');
  }, [location.search, location.state]);

  useEffect(() => {
    if (!requestedDebtId) return;
    if (openedFromTransactionRef.current === requestedDebtId) return;
    openedFromTransactionRef.current = requestedDebtId;

    const clearRequest = () => {
      navigate('/debt', { replace: true, state: null });
    };

    const openById = async () => {
      console.log('[DebtPage] 收到打开债务编辑请求:', { requestedDebtId });

      const inList = (debts || []).find((d) => d?.id === requestedDebtId) || null;
      if (inList) {
        handleEdit(inList);
        clearRequest();
        return;
      }

      let debt = await debtService.getDebt(requestedDebtId);
      if (!debt && navigator.onLine) {
        for (let i = 0; i < 3; i++) {
          await new Promise((resolve) => setTimeout(resolve, 200));
          debt = await debtService.getDebt(requestedDebtId);
          if (debt) break;
        }
      }

      if (debt) {
        handleEdit(debt as any);
        clearRequest();
        return;
      }

      message.warning('关联债务不存在或已被删除，无法打开编辑窗口');
      clearRequest();
    };

    openById().catch((error) => {
      console.error('[DebtPage] 打开债务编辑失败:', error);
      message.error('打开债务编辑窗口失败，请稍后重试');
      clearRequest();
    });
  }, [debts, handleEdit, message, navigate, requestedDebtId]);

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
        loanDate: values.loanDate?.format('YYYY-MM-DD'),
        reminderDate: values.reminderDate?.format('YYYY-MM-DD'),
      };
      
      // 移除辅助字段
      delete data.duration;

      if (editingDebt) {
        delete (data as any).debtType;
        console.log('[DebtPage] 提交编辑债务:', { id: editingDebt.id, data });
        await (dispatch(updateDebt({ id: editingDebt.id, data }) as any) as any).unwrap();
        message.success(navigator.onLine ? '更新成功' : '已离线保存，待联网同步');
      } else {
        console.log('[DebtPage] 提交新增债务:', { data });
        await (dispatch(createDebt(data) as any) as any).unwrap();
        message.success(navigator.onLine ? '添加成功' : '已离线保存，待联网同步');
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

  const handleAddPayment = useCallback(async (record: Debt) => {
    if (paymentLoading) return;
    setSelectedDebt(record);
    setPaymentModalVisible(true);
    setPendingPayments([]);
    setSelectedPendingPayment(null);

    // 获取该债务的待处理还款记录
    if (record.id) {
        try {
            // 注意：这里可能需要先刷新债务详情以获取最新 payments
            // 简单起见，假设 record.payments 包含了（如果列表接口已返回），或者单独获取
            const latestDebt = await debtService.getDebt(record.id);
            if (latestDebt && latestDebt.payments) {
                const pending = latestDebt.payments.filter((p: any) => p.status === 'pending');
                setPendingPayments(pending);
            }
        } catch (e) {
            console.warn('获取待还款记录失败', e);
        }
    }

    // 智能计算默认还款金额
    let defaultAmount = Number(record.remainingAmount);
    // 如果有未还利息，建议优先偿还利息+本金（即全额结清）
    if (record.accumulatedInterest && record.accumulatedInterest > 0) {
        defaultAmount += Number(record.accumulatedInterest);
    }

    // 针对分期还款方式，尝试计算本期应还金额
    if (record.loanDate && record.dueDate && record.interestRate && record.originalAmount && 
        ['equal_loan_payments', 'equal_principal_payments', 'interest_first'].includes(record.repaymentType || '')) {
        
        try {
            const P = Number(record.originalAmount);
            const r = Number(record.interestRate) / 100 / 12;
            const start = dayjs(record.loanDate);
            const end = dayjs(record.dueDate);
            const n = end.diff(start, 'month'); // 总期数
            
            // 简单估算：如果期数合理且利率存在
            if (n > 0 && r >= 0) {
                if (record.repaymentType === 'equal_loan_payments') {
                     // 等额本息：每月固定
                     if (r === 0) defaultAmount = P / n;
                     else defaultAmount = (P * r * Math.pow(1 + r, n)) / (Math.pow(1 + r, n) - 1);
                } else if (record.repaymentType === 'equal_principal_payments') {
                     // 等额本金：首月最多，这里默认建议首月（或当前剩余本金对应的利息+本金）
                     // 更精确的做法是：本金部分 + 当前剩余本金产生的利息
                     const monthlyPrincipal = P / n;
                     const currentInterest = Number(record.remainingAmount) * r; // 当前月利息
                     defaultAmount = monthlyPrincipal + currentInterest;
                } else if (record.repaymentType === 'interest_first') {
                     // 先息后本：每月只还利息
                     defaultAmount = Number(record.remainingAmount) * r;
                }
            }
        } catch (e) {
            console.warn('自动计算建议还款金额失败', e);
            // 失败则保持默认的全额结清
        }
    }

    // 确保金额不超过剩余总额 (本金+利息)
    const maxAmount = Number(record.remainingAmount) + (record.accumulatedInterest || 0);
    if (defaultAmount > maxAmount) {
        defaultAmount = maxAmount;
    }

    setTimeout(() => {
      paymentForm.resetFields();
      paymentForm.setFieldsValue({ 
          paymentDate: dayjs(), 
          paymentMethod: 'other',
          amount: Number(defaultAmount.toFixed(2))
      });
    }, 0);
  }, [paymentForm, paymentLoading]);

  useEffect(() => {
    if (!requestedPayDebtId) return;
    if (openedFromPaymentRef.current === requestedPayDebtId) return;
    openedFromPaymentRef.current = requestedPayDebtId;

    const clearRequest = () => {
      navigate('/debt', { replace: true, state: null });
    };

    const openById = async () => {
      console.log('[DebtPage] 收到打开还款确认请求:', { requestedPayDebtId });

      const inList = (debts || []).find((d) => d?.id === requestedPayDebtId) || null;
      if (inList) {
        await handleAddPayment(inList);
        clearRequest();
        return;
      }

      let debt = await debtService.getDebt(requestedPayDebtId);
      if (!debt && navigator.onLine) {
        for (let i = 0; i < 3; i++) {
          await new Promise((resolve) => setTimeout(resolve, 200));
          debt = await debtService.getDebt(requestedPayDebtId);
          if (debt) break;
        }
      }

      if (debt) {
        await handleAddPayment(debt as any);
        clearRequest();
        return;
      }

      message.warning('关联债务不存在或已被删除，无法打开还款确认窗口');
      clearRequest();
    };

    openById().catch((error) => {
      console.error('[DebtPage] 打开还款确认失败:', error);
      message.error('打开还款确认窗口失败，请稍后重试');
      clearRequest();
    });
  }, [debts, handleAddPayment, message, navigate, requestedPayDebtId]);

  const handleSelectPendingPayment = (payment: any) => {
    setSelectedPendingPayment(payment.id);
    paymentForm.setFieldsValue({
        amount: Number(payment.amount), // 待确认金额可能是0，用户需要确认
        paymentDate: dayjs(payment.paymentDate),
        paymentMethod: payment.paymentMethod || 'other',
        note: payment.note || '确认系统生成的待还款'
    });
    // 如果金额为0，提示用户输入
    if (Number(payment.amount) === 0) {
       message.info('请确认实际还款金额');
    }
  };

  const handlePaymentSubmit = useCallback(async (values: any) => {
    if (!selectedDebt) return;
    setPaymentLoading(true);
    try {
      await dispatch(repayDebt({ 
        id: selectedDebt.id, 
        amount: values.amount, 
        paymentDate: values.paymentDate.format('YYYY-MM-DD'),
        paymentMethod: values.paymentMethod,
        paymentId: selectedPendingPayment || undefined,
        note: values.note
      }) as any);
      message.success('还款记录已确认/添加');
      setPaymentModalVisible(false);
      loadDebts();
      dispatch(fetchDebtStatistics() as any);
    } catch (error: any) {
      message.error(typeof error === 'string' ? error : (error?.message || '还款失败'));
    } finally {
      setPaymentLoading(false);
    }
  }, [selectedDebt, dispatch, loadDebts, message, selectedPendingPayment]);

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
      title: '金额',
      key: 'amount',
      width: 140,
      render: (_: any, record: Debt) => (
        <div className="amount-column">
          <span className={`original-amount ${record.debtType}`}>
            ¥{Number(record.originalAmount).toFixed(2)}
          </span>
          <div className="remaining-amount">
             <div>待{record.debtType === 'borrow' ? '还' : '收'}本金: ¥{Number(record.remainingAmount).toFixed(2)}</div>
             {record.accumulatedInterest && record.accumulatedInterest > 0 ? (
                <Tooltip title={`利息计算：剩余本金 × 年利率 × (已借天数/365)\n计算截止至：${dayjs().format('YYYY-MM-DD')}`}>
                  <div style={{ fontSize: '11px', color: '#fbbf24', marginTop: '2px', cursor: 'help', textDecoration: 'underline dotted' }}>
                    + 预计利息: ¥{record.accumulatedInterest}
                  </div>
                </Tooltip>
             ) : null}
           </div>
        </div>
      )
    },
    { 
      title: '支付方式', 
      dataIndex: 'paymentMethod', 
      key: 'paymentMethod',
      width: 100,
      render: (method: string) => {
        const methods: Record<string, { label: string, color: string }> = {
          bank_card: { label: '银行卡', color: 'blue' },
          alipay: { label: '支付宝', color: 'cyan' },
          wechat: { label: '微信', color: 'green' },
          cash: { label: '现金', color: 'orange' },
          other: { label: '其他', color: 'purple' }
        };
        const config = methods[method] || { label: method || '其他', color: 'purple' };
        return <Tag color={config.color} style={{ borderRadius: 8, fontSize: 11, fontWeight: 600, border: 'none' }}>{config.label}</Tag>;
      }
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
            <Statistic title="总借入本金" value={statistics.totalBorrowed} precision={2} prefix="¥" />
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
            <Statistic title="总借出本金" value={statistics.totalLent} precision={2} prefix="¥" />
            <div className="stats-card-footer">
              <Tag color="success">待收金额: ¥{statistics.totalLent?.toFixed(2)}</Tag>
            </div>
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card className="stats-card pending" variant="borderless">
            <div className="stats-card-icon" style={{ backgroundColor: 'rgba(251, 191, 36, 0.1)', color: '#fbbf24' }}>
              <DollarOutlined />
            </div>
            <Statistic title="累计产生利息" value={statistics.totalAccruedInterest} precision={2} prefix="¥" />
            <div className="stats-card-footer">
              <Text type="secondary" style={{ fontSize: '12px' }}>基于当前剩余本金动态计算</Text>
            </div>
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card className="stats-card overdue" variant="borderless">
            <div className="stats-card-icon">
              <ClockCircleOutlined />
            </div>
            <Statistic title="待处理/逾期" value={statistics.pendingDebts} suffix={`/ ${statistics.overdueDebts}`} />
            <div className="stats-card-footer">
              <Tag color={statistics.overdueDebts > 0 ? "error" : "processing"}>
                {statistics.overdueDebts > 0 ? `${statistics.overdueDebts} 笔已逾期` : '暂无逾期'}
              </Tag>
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
        destroyOnHidden
        className="custom-modal"
        centered
        maskClosable={false}
        keyboard={false}
      >
        <Form 
          form={form} 
          layout="vertical" 
          onFinish={handleSubmit} 
          className="modern-form"
          onValuesChange={(changedValues, allValues) => {
             if (['originalAmount', 'interestRate', 'duration', 'repaymentType', 'loanDate'].some(k => k in changedValues)) {
                 calculateRepayment(allValues);
             }
          }}
        >
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item name="debtorName" label="对象名称" rules={[{ required: true }]}><Input placeholder="姓名或单位名称" /></Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="debtType" label="债务类型" rules={[{ required: true }]}>
                <Select disabled={!!editingDebt}>
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
                label="借款金额" 
                rules={[
                  { required: true, message: '请输入金额' },
                  { type: 'number', max: 999999999999, message: '金额过大', transform: (v) => Number(v) }
                ]}
              >
                <InputNumber min={0.01} precision={2} style={{ width: '100%' }} prefix="¥" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="loanDate" label="借款日期" rules={[{ required: true }]}>
                  <DatePicker style={{ width: '100%' }} disabledDate={(current) => current && current > dayjs().endOf('day')} />
              </Form.Item>
            </Col>
          </Row>
          
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item 
                name="repaymentType" 
                label={
                  <Space size={4}>
                    还款方式
                    <Tooltip title={
                      <div>
                        <div>等额本息：每月还款额固定，包含本金和利息</div>
                        <div>等额本金：每月还本金固定，利息逐月递减</div>
                        <div>先息后本：每月只还利息，到期还本金</div>
                        <div>一次性还本付息：到期一次性归还所有本金和利息</div>
                      </div>
                    }>
                      <QuestionCircleOutlined style={{ color: 'rgba(0,0,0,0.45)', cursor: 'help' }} />
                    </Tooltip>
                  </Space>
                }
                rules={[{ required: true }]}
              >
                <Select options={REPAYMENT_TYPES} placeholder="选择计算方式" />
              </Form.Item>
            </Col>
             <Col span={12}>
              <Form.Item name="paymentMethod" label="转账方式" rules={[{ required: true }]}>
                <Select placeholder="选择转账方式">
                  <Option value="cash">现金</Option>
                  <Option value="alipay">支付宝</Option>
                  <Option value="wechat">微信</Option>
                  <Option value="bank_card">银行卡</Option>
                  <Option value="other">其他</Option>
                </Select>
              </Form.Item>
            </Col>
          </Row>

          <Row gutter={16}>
            <Col span={12}>
              <Form.Item name="interestRate" label="年利率 (%)" rules={[{ required: true }]}>
                <InputNumber min={0} max={100} precision={2} style={{ width: '100%' }} suffix="%" />
              </Form.Item>
            </Col>
            <Col span={12}>
               <Form.Item 
                 name="duration" 
                 label="借款期限 (月)" 
                 dependencies={['repaymentType']}
                 rules={[
                   ({ getFieldValue }) => ({
                     required: getFieldValue('repaymentType') !== 'custom',
                     message: '智能计算需要期限',
                   }),
                 ]}
               >
                 <InputNumber min={1} precision={0} style={{ width: '100%' }} placeholder="输入月数自动计算" />
               </Form.Item>
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

          <Row gutter={16}>
            <Col span={12}>
              <Form.Item 
                name="repaymentDay" 
                label="每月还款日" 
                rules={[{ type: 'number', min: 1, max: 31, message: '请输入1-31之间的日期' }]}
                tooltip="设置每月固定的还款日期，系统将在该日期自动生成待还款记录"
              >
                <Select placeholder="选择日期" showSearch optionFilterProp="children">
                  {Array.from({ length: 31 }, (_, i) => i + 1).map(day => (
                    <Option key={day} value={day}>{day}日</Option>
                  ))}
                </Select>
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item 
                name="repaymentDayAdjustment" 
                label="非工作日调整"
                tooltip="当还款日遇到周末或节假日时的调整策略"
              >
                <Select options={REPAYMENT_DAY_ADJUSTMENTS} />
              </Form.Item>
            </Col>
          </Row>

          {/* 智能计算结果展示 */}
          {calculationResult && form.getFieldValue('repaymentType') !== 'custom' && (
             <div style={{ marginBottom: 24, padding: 12, background: 'rgba(59, 130, 246, 0.05)', borderRadius: 8, border: '1px dashed #3b82f6' }}>
                <div style={{ marginBottom: 8, fontSize: 12, fontWeight: 600, color: '#3b82f6', display: 'flex', alignItems: 'center' }}>
                    <DollarOutlined style={{ marginRight: 4 }} /> 智能计算结果
                </div>
                <Row gutter={16}>
                   <Col span={12}><Text type="secondary" style={{fontSize: 12}}>本息合计</Text><div style={{fontWeight: 'bold', color: '#3b82f6'}}>¥{calculationResult.totalPayment.toFixed(2)}</div></Col>
                   <Col span={12}><Text type="secondary" style={{fontSize: 12}}>利息总额</Text><div style={{fontWeight: 'bold', color: '#f59e0b'}}>¥{calculationResult.totalInterest.toFixed(2)}</div></Col>
                </Row>
                <div style={{ marginTop: 8, fontSize: 12, color: '#666' }}>
                    {calculationResult.monthlyPayment && `每月还款: ¥${calculationResult.monthlyPayment.toFixed(2)}`}
                    {calculationResult.firstMonthPayment && `首月还款: ¥${calculationResult.firstMonthPayment.toFixed(2)}`}
                    {calculationResult.lastPayment && `末月还款: ¥${calculationResult.lastPayment.toFixed(2)}`}
                </div>
             </div>
          )}

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
        destroyOnHidden
        className="custom-modal"
        centered
        maskClosable={false}
        keyboard={false}
      >
        <Form form={paymentForm} layout="vertical" onFinish={handlePaymentSubmit} className="modern-form">
          <div className="payment-info-card" style={{ marginBottom: 24, padding: 16, backgroundColor: 'rgba(59, 130, 246, 0.05)', borderRadius: 12, border: '1px solid rgba(59, 130, 246, 0.1)' }}>
            <Row gutter={16}>
              <Col span={12}>
                <div style={{ color: 'var(--neutral-500)', fontSize: 12 }}>还款对象</div>
                <div style={{ fontWeight: 600, fontSize: 16 }}>{selectedDebt?.debtorName}</div>
              </Col>
              <Col span={12}>
                <div style={{ color: 'var(--neutral-500)', fontSize: 12 }}>债务类型</div>
                <Tag color={selectedDebt?.debtType === 'borrow' ? 'orange' : 'cyan'}>
                  {selectedDebt?.debtType === 'borrow' ? '借入' : '借出'}
                </Tag>
              </Col>
            </Row>
            <div style={{ marginTop: 16, paddingTop: 16, borderTop: '1px dashed rgba(0,0,0,0.05)' }}>
              <Row gutter={16}>
                <Col span={12}>
                  <div style={{ color: 'var(--neutral-500)', fontSize: 12 }}>待还本金</div>
                  <div style={{ color: 'var(--primary-color)', fontWeight: 600 }}>¥{Number(selectedDebt?.remainingAmount || 0).toFixed(2)}</div>
                </Col>
                <Col span={12}>
                  <div style={{ color: 'var(--neutral-500)', fontSize: 12 }}>预计利息 (截止今日)</div>
                  <div style={{ color: '#fbbf24', fontWeight: 600 }}>+ ¥{Number(selectedDebt?.accumulatedInterest || 0).toFixed(2)}</div>
                </Col>
              </Row>
              <div style={{ marginTop: 12, padding: '8px 12px', backgroundColor: 'rgba(251, 191, 36, 0.1)', borderRadius: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: 13, fontWeight: 600 }}>总计待还:</span>
                <span style={{ fontSize: 18, fontWeight: 700, color: 'var(--primary-color)' }}>
                  ¥{(Number(selectedDebt?.remainingAmount || 0) + Number(selectedDebt?.accumulatedInterest || 0)).toFixed(2)}
                </span>
              </div>
            </div>
          </div>

          {pendingPayments.length > 0 && (
            <div style={{ marginBottom: 24 }}>
              <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8, color: '#f59e0b' }}>
                <ClockCircleOutlined style={{ marginRight: 4 }} /> 待确认还款记录
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {pendingPayments.map(p => (
                   <div 
                     key={p.id}
                     onClick={() => handleSelectPendingPayment(p)}
                     style={{ 
                       padding: '8px 12px', 
                       border: `1px solid ${selectedPendingPayment === p.id ? '#f59e0b' : '#eee'}`,
                       borderRadius: 8,
                       background: selectedPendingPayment === p.id ? '#fffbeb' : '#fafafa',
                       cursor: 'pointer',
                       display: 'flex',
                       justifyContent: 'space-between',
                       alignItems: 'center'
                     }}
                   >
                      <div>
                        <div style={{ fontSize: 13, fontWeight: 500 }}>{dayjs(p.paymentDate).format('YYYY-MM-DD')} 应还</div>
                        <div style={{ fontSize: 11, color: '#888' }}>{p.note || '系统自动生成'}</div>
                      </div>
                      <div style={{ textAlign: 'right' }}>
                         <div style={{ fontWeight: 600 }}>¥{Number(p.amount).toFixed(2)}</div>
                         <Tag color="warning" style={{ margin: 0, fontSize: 10 }}>待确认</Tag>
                      </div>
                   </div>
                ))}
              </div>
            </div>
          )}

          <Form.Item 
            name="amount" 
            label="本次还款金额" 
            rules={[
              { required: true, message: '请输入还款金额' },
              { type: 'number', max: 999999999999, message: '金额超出限制' },
              {
                validator: (_, value) => {
                  if (value && selectedDebt && value > (Number(selectedDebt.remainingAmount) + Number(selectedDebt.accumulatedInterest))) {
                    return Promise.reject('还款金额不能超过总计待还金额');
                  }
                  return Promise.resolve();
                }
              }
            ]}
            extra={selectedDebt ? (
              Number(selectedDebt.accumulatedInterest) > 0 ? (
                <span style={{ fontSize: 12, fontWeight: 'bold', color: '#fa8c16' }}>
                  本次还款金额已包含利息¥{Number(selectedDebt.accumulatedInterest).toFixed(2)}
                </span>
              ) : (
                <span style={{ fontSize: 12, fontWeight: 'bold', color: '#52c41a' }}>
                  本次还款金额不包含利息
                </span>
              )
            ) : null}
          >
            <InputNumber 
              min={0.01} 
              precision={2} 
              style={{ width: '100%' }} 
              prefix="¥" 
              placeholder="输入还款金额"
            />
          </Form.Item>
          <Form.Item name="paymentMethod" label="支付方式" rules={[{ required: true }]}>
            <Select placeholder="选择支付方式">
              <Option value="cash">现金</Option>
              <Option value="alipay">支付宝</Option>
              <Option value="wechat">微信</Option>
              <Option value="bank_card">银行卡</Option>
              <Option value="other">其他</Option>
            </Select>
          </Form.Item>
          <Form.Item name="paymentDate" label="还款日期" rules={[{ required: true }]}>
            <DatePicker style={{ width: '100%' }} disabledDate={disableFutureDate} />
          </Form.Item>
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
