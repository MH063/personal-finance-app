import React, { useEffect, useState, useCallback } from 'react';
import { 
  Row, 
  Col, 
  Card, 
  Button, 
  Progress, 
  Space, 
  Typography, 
  Modal, 
  Form, 
  InputNumber, 
  Select, 
  DatePicker, 
  App as AntdApp, 
  Empty, 
  Tag,
  Popconfirm,
  Statistic
} from 'antd';
import { 
  PlusOutlined, 
  EditOutlined, 
  DeleteOutlined, 
  InfoCircleOutlined,
  WalletOutlined,
  CalendarOutlined
} from '@ant-design/icons';
import { useDispatch, useSelector } from 'react-redux';
import dayjs from 'dayjs';
import { useNavigate } from 'react-router-dom';
import { RootState, AppDispatch } from '../../store';
import { 
  fetchBudgets, 
  createBudget, 
  updateBudget, 
  deleteBudget 
} from '../../store/slices/budgetSlice';
import { fetchCategories } from '../../store/slices/categorySlice';
import { collaborativeService } from '../../services/collaborativeService';
import { Budget, BudgetStatus } from '../../types';
import './BudgetPage.css';

const { Title, Text } = Typography;
const { Option } = Select;
const { RangePicker } = DatePicker;

const BudgetPage: React.FC = () => {
  const { message } = AntdApp.useApp();
  const dispatch = useDispatch<AppDispatch>();
  const { budgets } = useSelector((state: RootState) => state.budgets);
  const { categories } = useSelector((state: RootState) => state.categories);
  const navigate = useNavigate();
  
  const [modalVisible, setModalVisible] = useState(false);
  const [submitLoading, setSubmitLoading] = useState(false);
  const [deleteLoading, setDeleteLoading] = useState<string | null>(null);
  const [editingBudget, setEditingBudget] = useState<Budget | null>(null);
  const [form] = Form.useForm();

  useEffect(() => {
    dispatch(fetchBudgets());
    dispatch(fetchCategories('expense'));

    // 监听更新
    const handleUpdate = (data: any) => {
      console.log('[BudgetPage] 监听到实时更新:', data);
      // 预算、分类、交易更新或重连同步时刷新
      if (
        data.type?.includes('BUDGET') || 
        data.type?.includes('CATEGORY') || 
        data.type?.includes('TRANSACTION') || 
        data.type === 'RECONNECTED_SYNC'
      ) {
        dispatch(fetchBudgets());
        dispatch(fetchCategories('expense'));
      }
    };

    collaborativeService.on('ledgerUpdate', handleUpdate);
    collaborativeService.on('globalUpdate', handleUpdate);

    return () => {
      collaborativeService.off('ledgerUpdate', handleUpdate);
      collaborativeService.off('globalUpdate', handleUpdate);
    };
  }, [dispatch]);

  const handleAdd = useCallback(() => {
    if (submitLoading) return;
    setEditingBudget(null);
    form.resetFields();
    setModalVisible(true);
  }, [form, submitLoading]);

  const handleEdit = useCallback((budget: Budget) => {
    if (submitLoading) return;
    setEditingBudget(budget);
    form.setFieldsValue({
      categoryId: budget.categoryId,
      amount: budget.amount,
      dateRange: [dayjs(budget.startDate), dayjs(budget.endDate)],
      status: budget.status
    });
    setModalVisible(true);
  }, [form, submitLoading]);

  const handleDelete = useCallback(async (id: string) => {
    if (deleteLoading) return;
    setDeleteLoading(id);
    try {
      await dispatch(deleteBudget(id)).unwrap();
      message.success('预算已删除');
      // 删除后刷新列表，确保统计数据更新
      dispatch(fetchBudgets());
    } catch (error: any) {
      message.error(typeof error === 'string' ? error : (error?.message || '删除失败'));
    } finally {
      setDeleteLoading(null);
    }
  }, [deleteLoading, dispatch, message]);

  const handleModalOk = useCallback(async () => {
    try {
      const values = await form.validateFields();
      setSubmitLoading(true);
      const data: any = {
        amount: values.amount,
        startDate: values.dateRange[0].format('YYYY-MM-DD'),
        endDate: values.dateRange[1].format('YYYY-MM-DD')
      };

      if (editingBudget) {
        // 更新预算时，通常不允许修改分类，但允许修改状态
        data.status = values.status || BudgetStatus.ACTIVE;
        await dispatch(updateBudget({ id: editingBudget.id, data })).unwrap();
        message.success('预算已更新');
      } else {
        // 创建预算时需要分类 ID，但不允许状态字段
        data.categoryId = values.categoryId;
        await dispatch(createBudget(data)).unwrap();
        message.success('预算已创建');
      }
      setModalVisible(false);
      // 重新获取预算列表以确保所有计算字段（如已用金额、百分比）和关联数据（分类信息）都是最新的
      dispatch(fetchBudgets());
    } catch (error: any) {
      if (error?.errorFields) return; // Form validation failed
      message.error(typeof error === 'string' ? error : (error?.message || '操作失败'));
    } finally {
      setSubmitLoading(false);
    }
  }, [editingBudget, dispatch, form, message]);

  const getStatusColor = useCallback((percentage: number) => {
    if (percentage >= 90) return '#ff4d4f';
    if (percentage >= 70) return '#faad14';
    return '#52c41a';
  }, []);

  const renderBudgetCard = useCallback((budget: Budget) => {
    const isOverBudget = budget.usagePercentage > 100;
    const statusColor = getStatusColor(budget.usagePercentage);

    return (
      <Col xs={24} sm={12} lg={8} xl={6} key={budget.id}>
        <Card className="budget-card" variant="borderless">
          <div className="budget-category-tag">
            <Tag color={budget.category?.color || 'blue'}>
              {budget.category?.name || '未知分类'}
            </Tag>
            {budget.status === BudgetStatus.INACTIVE && <Tag color="default">已禁用</Tag>}
          </div>
          
          <div className="budget-amount-display">
            ¥{Number(budget.amount).toLocaleString()}
          </div>

          <div className="budget-progress-container">
            <Progress 
              percent={Math.min(100, budget.usagePercentage)} 
              strokeColor={statusColor}
              showInfo={false}
              status={isOverBudget ? 'exception' : 'active'}
            />
            <div className="budget-info">
              <Text type="secondary">已用: ¥{Number(budget.usedAmount).toLocaleString()}</Text>
              <Text type={isOverBudget ? 'danger' : 'secondary'}>
                {budget.usagePercentage.toFixed(1)}%
              </Text>
            </div>
          </div>

          <div style={{ marginTop: 16 }}>
            <Space direction="vertical" size={4} style={{ width: '100%' }}>
              <Text type="secondary" size="small">
                <CalendarOutlined /> {dayjs(budget.startDate).format('MM/DD')} - {dayjs(budget.endDate).format('MM/DD')}
              </Text>
              <Text type={budget.remainingAmount <= 0 ? 'danger' : 'success'} strong>
                剩余: ¥{Number(budget.remainingAmount).toLocaleString()}
              </Text>
            </Space>
          </div>

          <div style={{ marginTop: 20, display: 'flex', justifyContent: 'flex-end' }}>
            <Space>
              <Button 
                type="text" 
                icon={<EditOutlined />} 
                onClick={() => handleEdit(budget)} 
              />
              <Popconfirm
                title="确定删除此预算吗？"
                onConfirm={() => handleDelete(budget.id)}
                okText="确定"
                cancelText="取消"
              >
                <Button 
                  type="text" 
                  danger 
                  icon={<DeleteOutlined />} 
                  loading={deleteLoading === budget.id}
                />
              </Popconfirm>
            </Space>
          </div>
        </Card>
      </Col>
    );
  }, [deleteLoading, getStatusColor, handleDelete, handleEdit]);

  return (
    <div className="budget-page">
      <div className="page-header-section">
        <div className="header-left">
          <Title level={2} className="page-title">预算管理</Title>
          <Text type="secondary">规划并监控您的各项支出预算</Text>
        </div>
        <div className="header-actions">
          <Button 
            type="primary" 
            icon={<PlusOutlined />} 
            onClick={handleAdd}
            size="large"
            className="add-btn"
          >
            新增预算
          </Button>
        </div>
      </div>

      <div style={{ display: 'none' }}>
        <Form form={form} />
      </div>

      <Row gutter={[24, 24]} className="budget-stats">
        <Col span={24}>
          <Card className="budget-card" variant="borderless">
            <Row align="middle" gutter={48}>
              <Col>
                <Statistic
                  title={<span style={{ color: 'rgba(255,255,255,0.45)' }}>总预算数</span>}
                  value={budgets.length}
                  prefix={<WalletOutlined />}
                  valueStyle={{ color: '#fff' }}
                />
              </Col>
              <Col>
                <Statistic
                  title={<span style={{ color: 'rgba(255,255,255,0.45)' }}>超支预算</span>}
                  value={budgets.filter(b => b.usagePercentage > 100).length}
                  valueStyle={{ color: '#ff4d4f' }}
                  prefix={<InfoCircleOutlined />}
                />
              </Col>
            </Row>
          </Card>
        </Col>
      </Row>

      {budgets.length > 0 ? (
        <Row gutter={[24, 24]} className="budget-grid">
          {budgets.map(renderBudgetCard)}
        </Row>
      ) : (
        <div className="budget-empty">
          <Empty 
            description={<span style={{ color: 'rgba(255,255,255,0.45)' }}>暂无预算配置，点击右上角开始添加</span>} 
            image={Empty.PRESENTED_IMAGE_SIMPLE} 
          />
        </div>
      )}

      {/* 创建/编辑预算 Modal */}
      <Modal
        title={editingBudget ? '编辑预算' : '创建新预算'}
        open={modalVisible}
        onOk={handleModalOk}
        onCancel={() => setModalVisible(false)}
        okText="保存"
        cancelText="取消"
        confirmLoading={submitLoading}
        destroyOnHidden
        className="custom-modal"
        centered
        maskClosable={false}
        keyboard={false}
      >
        <Form form={form} layout="vertical" initialValues={{ status: BudgetStatus.ACTIVE }}>
          <Form.Item
            name="categoryId"
            label="支出分类"
            rules={[{ required: true, message: '请选择分类' }]}
          >
            <Select 
              placeholder="选择预算适用的支出分类" 
              disabled={!!editingBudget}
              popupRender={(menu) => (
                <>
                  {menu}
                  <Space style={{ padding: '8px', borderTop: '1px solid #f0f0f0' }}>
                    <Button 
                      type="text" 
                      icon={<PlusOutlined />} 
                      onClick={() => navigate('/categories?openCreate=1&type=expense')}
                      block
                    >
                      新增分类
                    </Button>
                  </Space>
                </>
              )}
            >
              {categories.filter(cat => cat && cat.id && cat.type === 'expense').map(cat => (
                <Option key={cat.id} value={cat.id}>{cat.name}</Option>
              ))}
            </Select>
          </Form.Item>

          <Form.Item
            name="amount"
            label="预算金额"
            rules={[
              { required: true, message: '请输入预算金额' },
              { type: 'number', max: 999999999999, message: '金额不能超过 999,999,999,999' }
            ]}
          >
            <InputNumber
              style={{ width: '100%' }}
              formatter={value => `¥ ${value}`.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}
              parser={value => value!.replace(/¥\s?|(,*)/g, '')}
              min={0}
              placeholder="0.00"
            />
          </Form.Item>

          <Form.Item
            name="dateRange"
            label="有效期限"
            rules={[{ required: true, message: '请选择有效期限' }]}
          >
            <RangePicker style={{ width: '100%' }} />
          </Form.Item>

          {editingBudget && (
            <Form.Item name="status" label="预算状态">
              <Select>
                <Option value={BudgetStatus.ACTIVE}>激活</Option>
                <Option value={BudgetStatus.INACTIVE}>禁用</Option>
              </Select>
            </Form.Item>
          )}
        </Form>
      </Modal>
    </div>
  );
};

export default BudgetPage;
