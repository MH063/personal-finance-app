import { useEffect, useState, useImperativeHandle, forwardRef } from 'react';
import { Table, Card, Button, Space, Tag, Modal, Form, Input, InputNumber, Select, DatePicker, App, Row, Col, Popconfirm } from 'antd';
import { PlusOutlined, SearchOutlined, DeleteOutlined, EditOutlined } from '@ant-design/icons';
import { useDispatch, useSelector } from 'react-redux';
import dayjs from 'dayjs';
import { RootState, AppDispatch } from '../../store';
import { fetchTransactions, createTransaction, updateTransaction, deleteTransaction } from '../../store/slices/transactionSlice';
import { fetchCategories, Category } from '../../store/slices/categorySlice';
import type { Transaction } from '../../services/transactionService';
import './TransactionManager.css';

const { Option } = Select;
const { TextArea } = Input;

interface TransactionManagerProps {
  type: 'income' | 'expense';
  title: string;
  themeColor: string;
  showHeader?: boolean;
}

const TransactionManager = forwardRef<any, TransactionManagerProps>(({ type, title, themeColor, showHeader = true }, ref) => {
  const { message } = App.useApp();
  const [loading, setLoading] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  const [editingTransaction, setEditingTransaction] = useState<Transaction | null>(null);
  const [filters, setFilters] = useState({ keyword: '', categoryId: '', startDate: '', endDate: '' });
  const [form] = Form.useForm();

  const dispatch = useDispatch<AppDispatch>();
  const { transactions, total, loading: txLoading } = useSelector((state: RootState) => state.transactions);
  const { categories } = useSelector((state: RootState) => state.categories);

  const filteredCategories = categories.filter((c) => c.type === type);

  useImperativeHandle(ref, () => ({
    handleAdd
  }));

  useEffect(() => {
    console.log(`[TransactionManager] 加载数据: type=${type}, filters=`, filters);
    dispatch(fetchTransactions({ type, ...filters }) as any);
    dispatch(fetchCategories(type) as any);
  }, [dispatch, type, filters]);

  const handleSearch = () => {
    console.log(`[TransactionManager] 执行搜索: filters=`, filters);
    dispatch(fetchTransactions({ type, ...filters }) as any);
  };

  const handleAdd = () => {
    console.log(`[TransactionManager] 打开添加弹窗`);
    setEditingTransaction(null);
    setModalVisible(true);
    setTimeout(() => {
      form.resetFields();
      form.setFieldsValue({ transactionDate: dayjs(), type });
    }, 0);
  };

  const handleEdit = (record: Transaction) => {
    console.log(`[TransactionManager] 打开编辑弹窗: id=${record.id}`);
    setEditingTransaction(record);
    setModalVisible(true);
    setTimeout(() => {
      form.setFieldsValue({
        ...record,
        transactionDate: dayjs(record.transactionDate),
      });
    }, 0);
  };

  const handleDelete = async (id: string) => {
    console.log(`[TransactionManager] 执行删除: id=${id}`);
    try {
      await dispatch(deleteTransaction(id) as any);
      message.success('删除成功');
      dispatch(fetchTransactions({ type, ...filters }) as any);
    } catch (error) {
      console.error(`[TransactionManager] 删除失败:`, error);
      message.error('删除失败');
    }
  };

  const handleSubmit = async (values: any) => {
    console.log(`[TransactionManager] 提交表单: values=`, values);
    setLoading(true);
    try {
      const data = {
        ...values,
        transactionDate: values.transactionDate.format('YYYY-MM-DD'),
      };

      if (editingTransaction) {
        await dispatch(updateTransaction({ id: editingTransaction.id, data }) as any);
        message.success('更新成功');
      } else {
        await dispatch(createTransaction(data) as any);
        message.success('添加成功');
      }

      setModalVisible(false);
      dispatch(fetchTransactions({ type, ...filters }) as any);
    } catch (error) {
      console.error(`[TransactionManager] 提交失败:`, error);
      message.error('操作失败');
    } finally {
      setLoading(false);
    }
  };

  const columns = [
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
          cash: { label: '现金', color: 'orange' }
        };
        const config = methods[method] || { label: method || '其他', color: 'default' };
        return <Tag color={config.color} className="method-tag">{config.label}</Tag>;
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
      render: (_: any, record: Transaction) => (
        <Space size="small">
          <Button 
            type="text" 
            icon={<EditOutlined />} 
            onClick={() => handleEdit(record)}
            className="action-btn edit"
          />
          <Popconfirm 
            title="删除记录" 
            description="确定要删除这条交易记录吗？"
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
  ];

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
        ) : null} 
        extra={showHeader ? (
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
        ) : null}
      >
        <div className="filter-section">
          <Row gutter={[16, 16]} align="middle">
            <Col xs={24} sm={12} md={6}>
              <div className="filter-label">搜索</div>
              <Input 
                placeholder="搜索备注内容..." 
                prefix={<SearchOutlined className="filter-icon" />} 
                value={filters.keyword}
                onChange={(e) => setFilters({ ...filters, keyword: e.target.value })}
                onPressEnter={handleSearch}
                allowClear
                size="large"
              />
            </Col>
            <Col xs={24} sm={12} md={6}>
              <div className="filter-label">分类筛选</div>
              <Select 
                placeholder="全部分类" 
                style={{ width: '100%' }} 
                allowClear
                value={filters.categoryId || undefined}
                onChange={(val) => setFilters({ ...filters, categoryId: val || '' })}
                size="large"
                suffixIcon={<PlusOutlined rotate={45} />}
              >
                {filteredCategories.map(c => <Option key={c.id} value={c.id}>{c.name}</Option>)}
              </Select>
            </Col>
            <Col xs={24} sm={24} md={8}>
              <div className="filter-label">时间范围</div>
              <DatePicker.RangePicker 
                style={{ width: '100%' }}
                size="large"
                onChange={(dates) => setFilters({ 
                  ...filters, 
                  startDate: dates ? dates[0]?.startOf('day').toISOString() || '' : '', 
                  endDate: dates ? dates[1]?.endOf('day').toISOString() || '' : '' 
                })}
                placeholder={['开始日期', '结束日期']}
              />
            </Col>
            <Col xs={24} sm={24} md={4}>
              <div className="filter-label">&nbsp;</div>
              <Button 
                type="primary" 
                onClick={handleSearch} 
                block 
                icon={<SearchOutlined />}
                size="large"
                className="filter-submit-btn"
              >
                执行筛选
              </Button>
            </Col>
          </Row>
        </div>

        <div className="table-container">
          <Table 
            columns={columns} 
            dataSource={transactions} 
            rowKey="id" 
            loading={txLoading}
            pagination={{ 
              total, 
              pageSize: 10,
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
        onOk={() => form.submit()}
        onCancel={() => setModalVisible(false)}
        confirmLoading={loading}
        destroyOnHidden
        className="custom-modal"
        width={520}
        okButtonProps={{ 
          style: { backgroundColor: themeColor, borderColor: themeColor },
          size: 'large',
          className: 'modal-ok-button'
        }}
        cancelButtonProps={{ size: 'large' }}
      >
        <Form form={form} layout="vertical" onFinish={handleSubmit} className="modern-form">
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item name="categoryId" label="分类" rules={[{ required: true, message: '请选择分类' }]}>
                <Select placeholder="选择分类" size="large">
                  {filteredCategories.map(c => <Option key={c.id} value={c.id}>{c.name}</Option>)}
                </Select>
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="transactionDate" label="日期" rules={[{ required: true, message: '请选择日期' }]}>
                <DatePicker style={{ width: '100%' }} size="large" />
              </Form.Item>
            </Col>
          </Row>

          <Form.Item name="amount" label="金额" rules={[{ required: true, message: '请输入金额' }]}>
            <InputNumber 
              style={{ width: '100%' }} 
              min={0.01} 
              precision={2} 
              placeholder="0.00" 
              size="large"
              prefix="¥"
            />
          </Form.Item>

          <Form.Item name="paymentMethod" label="支付方式" rules={[{ required: true, message: '请选择支付方式' }]}>
            <Select placeholder="选择支付方式" size="large">
              <Option value="cash">现金</Option>
              <Option value="alipay">支付宝</Option>
              <Option value="wechat">微信</Option>
              <Option value="bank_card">银行卡</Option>
              <Option value="other">其他</Option>
            </Select>
          </Form.Item>

          <Form.Item name="description" label="备注">
            <TextArea rows={3} placeholder="添加备注信息..." showCount maxLength={200} />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
});

TransactionManager.displayName = 'TransactionManager';

// End of TransactionManager component
export default TransactionManager;
