import React, { useState, useEffect, useRef } from 'react';
import { Button, Tag, Space, Badge, Tooltip, Segmented, App as AntdApp } from 'antd';
import { CheckCircleOutlined, ExclamationCircleOutlined, RobotOutlined, PlusOutlined, ImportOutlined, SwapOutlined } from '@ant-design/icons';
import { ProTable } from '@ant-design/pro-components';
import type { ProColumns } from '@ant-design/pro-components';
import dayjs from 'dayjs';
import { useDispatch, useSelector } from 'react-redux';
import { AppDispatch, RootState } from '../../store';
import { fetchTransactions, updateTransaction, batchDeleteTransactions } from '../../store/slices/transactionSlice';
import { fetchCategories } from '../../store/slices/categorySlice';
import { fetchLedgers } from '../../store/slices/ledgerSlice';
import { Transaction } from '../../services/transactionService';
import ImportTransactionsModal from '../../components/business/ImportTransactionsModal';
import TransferModal from './TransferModal';
import TransactionFormModal from './TransactionFormModal';
import AutomationRulesModal from './AutomationRulesModal';
import './TransactionsPage.css';

// const { RangePicker } = DatePicker;

const TransactionsPage: React.FC = () => {
  const { message, modal } = AntdApp.useApp();
  const dispatch = useDispatch<AppDispatch>();
  const [selectedRowKeys, setSelectedRowKeys] = useState<React.Key[]>([]);
  const [importModalVisible, setImportModalVisible] = useState(false);
  const [transferModalVisible, setTransferModalVisible] = useState(false);
  const [formModalVisible, setFormModalVisible] = useState(false);
  const [automationModalVisible, setAutomationModalVisible] = useState(false);
  const [editingTransaction, setEditingTransaction] = useState<Transaction | null>(null);
  const [activeTab, setActiveTab] = useState<string>('all');
  const [tableSize, setTableSize] = useState<'small' | 'middle' | 'large'>('middle');
  const actionRef = useRef<any>();

  // Selectors
  const { transactions = [], total = 0 } = useSelector((state: RootState) => state.transactions || {});
  const { categories = [] } = useSelector((state: RootState) => state.categories || {});
  const { ledgers = [] } = useSelector((state: RootState) => state.ledger || {});

  // State for filters
  const [filters] = useState<any>({
    page: 1,
    limit: 20,
    sortBy: 'transactionDate',
    sortOrder: 'desc',
  });

  useEffect(() => {
    dispatch(fetchCategories('expense'));
    dispatch(fetchCategories('income'));
    dispatch(fetchLedgers());
  }, [dispatch]);

  // Handle data fetching
  /**
   * 请求并组装交易列表数据
   */
  const requestData = async (params: any) => {
    // 映射 ProTable 的分页参数为后端接受的 page/limit，并移除 current/pageSize
    const page = params?.current || filters.page || 1;
    const limit = params?.pageSize || filters.limit || 20;
    const startDate = params.dateRange?.[0] ? dayjs(params.dateRange[0]).format('YYYY-MM-DD') : undefined;
    const endDate = params.dateRange?.[1] ? dayjs(params.dateRange[1]).format('YYYY-MM-DD') : undefined;
    const type = params.type !== 'all' ? params.type : undefined;
    const queryParams: Record<string, any> = {
      page,
      limit,
      sortBy: filters.sortBy,
      sortOrder: filters.sortOrder,
      startDate,
      endDate,
      type,
      categoryId: params.categoryId,
      ledgerId: params.ledgerId,
      tag: params.tag,
      reconciled: activeTab === 'reconciled' ? true : (activeTab === 'pending' ? false : undefined),
    };
    // 清理空值
    Object.keys(queryParams).forEach((key) => {
      if (queryParams[key] === undefined || queryParams[key] === '') {
        delete queryParams[key];
      }
    });

    await dispatch(fetchTransactions(queryParams));
    
    return {
      data: transactions,
      success: true,
      total: total,
    };
  };

  const handleBatchDelete = async () => {
    if (selectedRowKeys.length === 0) return;
    modal.confirm({
      title: '确认删除',
      content: `确定要删除选中的 ${selectedRowKeys.length} 条记录吗？`,
      onOk: async () => {
        try {
          await dispatch(batchDeleteTransactions(selectedRowKeys as string[])).unwrap();
          message.success('批量删除成功');
          setSelectedRowKeys([]);
          actionRef.current?.reload();
        } catch (error) {
          message.error('删除失败');
        }
      },
    });
  };

  const handleBatchReconcile = async () => {
    if (selectedRowKeys.length === 0) return;
    try {
      // 循环调用 updateTransaction，虽然效率不高但后端没提供批量更新接口，先这样实现
      // 优化建议：后端增加批量更新接口
      await Promise.all(selectedRowKeys.map(id => 
        dispatch(updateTransaction({ 
          id: id as string, 
          data: { reconciled: true } 
        })).unwrap()
      ));
      message.success('批量核对成功');
      setSelectedRowKeys([]);
      actionRef.current?.reload();
    } catch (error) {
      message.error('批量核对失败');
    }
  };

  const handleReconcile = async (record: Transaction) => {
    try {
      await dispatch(updateTransaction({ 
        id: record.id, 
        data: { reconciled: !record.reconciled } 
      })).unwrap();
      message.success(record.reconciled ? '取消核对成功' : '核对成功');
      actionRef.current?.reload();
    } catch (error) {
      message.error('操作失败');
    }
  };

  const columns: ProColumns<Transaction>[] = [
    {
      title: '标签',
      dataIndex: 'tag',
      hideInTable: true,
      valueType: 'text',
      fieldProps: {
        placeholder: '搜索标签',
      },
    },
    {
      title: '状态',
      dataIndex: 'reconciled',
      width: 80,
      render: (_: React.ReactNode, record: Transaction) => (
        <Tooltip title={record.reconciled ? '已核对' : '未核对 (点击核对)'}>
          <div 
            className={`status-indicator ${record.reconciled ? 'reconciled' : 'pending'}`}
            onClick={() => handleReconcile(record)}
          >
            {record.reconciled ? <CheckCircleOutlined /> : <ExclamationCircleOutlined />}
          </div>
        </Tooltip>
      ),
    },
    {
      title: '日期',
      dataIndex: 'transactionDate',
      valueType: 'date',
      width: 120,
      sorter: true,
      render: (_: any, record: Transaction) => dayjs(record.transactionDate).format('YYYY-MM-DD HH:mm'),
    },
    {
      title: '金额',
      dataIndex: 'amount',
      width: 120,
      sorter: true,
      render: (_: React.ReactNode, record: Transaction) => {
        let prefix = '';
        const className = `amount-cell ${record.type}`;
        if (record.type === 'expense') prefix = '-';
        if (record.type === 'income') prefix = '+';
        if (record.type === 'transfer') prefix = '';
        const numericAmount = typeof record.amount === 'number' ? record.amount : parseFloat(String(record.amount));
        if (Number.isNaN(numericAmount)) {
          console.warn('[TransactionsPage] 检测到无效金额值:', record.amount, record);
          return <span className={`${className} error`}>无效金额</span>;
        }
        return <span className={className}>{prefix}{numericAmount.toFixed(2)}</span>;
      },
    },
    {
      title: '商户/描述',
      dataIndex: 'merchant',
      render: (_: React.ReactNode, record: Transaction) => (
        <div className="merchant-cell">
          <div className="merchant-name">
            {record.type === 'transfer' ? (
              <Space>
                <SwapOutlined style={{ color: '#1890ff' }} />
                <span>资金划转</span>
              </Space>
            ) : (
              record.merchant || '未知商户'
            )}
          </div>
          <div className="description-text">{record.description}</div>
          {record.tags && record.tags.length > 0 && (
            <div className="tags-row">
              {record.tags.map(tag => <Tag key={tag} color="blue">{tag}</Tag>)}
            </div>
          )}
        </div>
      ),
    },
    {
      title: '分类',
      dataIndex: 'categoryId',
      width: 120,
      render: (_: React.ReactNode, record: Transaction) => {
        const categoryId = record.categoryId;
        if (record.type === 'transfer') return <Tag color="blue">转账</Tag>;
        const category = categories.find(c => c.id === categoryId);
        return category ? (
          <Tag color={category.color || 'default'}>{category.name}</Tag>
        ) : '-';
      },
    },
    {
      title: '账户',
      dataIndex: 'ledgerId',
      width: 180,
      render: (_: React.ReactNode, record: Transaction) => {
        const fromLedger = ledgers.find(l => l.id === record.ledgerId);
        const fromName = fromLedger ? fromLedger.name : '-';
        
        if (record.type === 'transfer' && record.toLedgerId) {
          const toLedger = ledgers.find(l => l.id === record.toLedgerId);
          const toName = toLedger ? toLedger.name : '-';
          return (
            <Space size={4}>
              <span>{fromName}</span>
              <SwapOutlined style={{ fontSize: '12px', color: '#9ca3af' }} />
              <span>{toName}</span>
            </Space>
          );
        }
        
        return fromName;
      },
    },
    {
      title: '操作',
      valueType: 'option',
      width: 100,
      render: (_: any, record: Transaction) => [
        <a key="edit" onClick={() => {
          setEditingTransaction(record);
          setFormModalVisible(true);
        }}>编辑</a>,
      ],
    },
  ];

  return (
    <div className="audit-workbench">
      <div className="workbench-header">
        <div className="header-left">
          <h1 className="page-title">审计工作台</h1>
          <div className="view-switcher">
            <span 
              className={`view-option ${activeTab === 'all' ? 'active' : ''}`}
              onClick={() => setActiveTab('all')}
            >
              全部流水
            </span>
            <span 
              className={`view-option ${activeTab === 'pending' ? 'active' : ''}`}
              onClick={() => setActiveTab('pending')}
            >
              待核对
              <Badge count={transactions.filter(t => !t.reconciled).length} offset={[5, -5]} size="small" />
            </span>
            <span 
              className={`view-option ${activeTab === 'reconciled' ? 'active' : ''}`}
              onClick={() => setActiveTab('reconciled')}
            >
              已归档
            </span>
          </div>
        </div>
        <div className="header-right">
          <Space>
            <Segmented
              value={tableSize}
              onChange={(v) => setTableSize(v as 'small' | 'middle' | 'large')}
              options={[
                { label: '紧凑', value: 'small' },
                { label: '默认', value: 'middle' },
                { label: '宽松', value: 'large' },
              ]}
            />
            <Button icon={<RobotOutlined />} onClick={() => setAutomationModalVisible(true)}>自动化规则</Button>
            <Button icon={<SwapOutlined />} onClick={() => setTransferModalVisible(true)}>资金划转</Button>
            <Button icon={<ImportOutlined />} onClick={() => setImportModalVisible(true)}>导入</Button>
            <Button type="primary" icon={<PlusOutlined />} onClick={() => {
              setEditingTransaction(null);
              setFormModalVisible(true);
            }}>记一笔</Button>
          </Space>
        </div>
      </div>

      <div className="workbench-content">
        <div className="main-table-area">
          <ProTable<Transaction>
            actionRef={actionRef}
            rowKey="id"
            columns={columns}
            request={requestData}
            cardBordered={false}
            cardProps={{ bordered: false, ghost: true }}
            pagination={{
              pageSize: 20,
              showSizeChanger: true,
            }}
            rowSelection={{
              selectedRowKeys,
              onChange: setSelectedRowKeys,
            }}
            tableAlertRender={({ selectedRowKeys, onCleanSelected }) => (
              <Space size={24}>
                <span>
                  已选 {selectedRowKeys.length} 项
                  <a style={{ marginLeft: 8 }} onClick={onCleanSelected}>
                    取消选择
                  </a>
                </span>
                <span>
                  <a onClick={handleBatchDelete} style={{ color: '#ff4d4f' }}>
                    批量删除
                  </a>
                </span>
                <span>
                  <a onClick={handleBatchReconcile}>
                    批量核对
                  </a>
                </span>
              </Space>
            )}
            search={{
              labelWidth: 'auto',
              defaultCollapsed: false,
            }}
            options={{
              density: false,
              fullScreen: true,
              reload: true,
              setting: true,
            }}
            size={tableSize}
            className="audit-table glass-table"
          />
        </div>
      </div>

      <ImportTransactionsModal
        visible={importModalVisible}
        onClose={() => setImportModalVisible(false)}
        onSuccess={() => actionRef.current?.reload()}
      />
      <TransferModal
        visible={transferModalVisible}
        onClose={() => setTransferModalVisible(false)}
        onSuccess={() => actionRef.current?.reload()}
      />
      <TransactionFormModal
        visible={formModalVisible}
        onClose={() => setFormModalVisible(false)}
        onSuccess={() => actionRef.current?.reload()}
        editingTransaction={editingTransaction}
      />
      <AutomationRulesModal
        visible={automationModalVisible}
        onClose={() => setAutomationModalVisible(false)}
        transactions={transactions}
        onSuccess={() => actionRef.current?.reload()}
      />
    </div>
  );
};

export default TransactionsPage;
