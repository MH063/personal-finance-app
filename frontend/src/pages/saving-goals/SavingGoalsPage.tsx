import React, { useEffect, useState } from 'react';
import { Card, Button, Progress, Typography, Modal, Form, Input, InputNumber, DatePicker, Space, App as AntdApp, Statistic, Empty, Row, Col, Switch } from 'antd';
import { PlusOutlined, EditOutlined, DeleteOutlined, BankOutlined, CheckCircleOutlined, WalletOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import { savingGoalService, SavingGoal } from '../../services/savingGoalService';
const { Title } = Typography;

const SavingGoalsPage: React.FC = () => {
  const { message } = AntdApp.useApp();
  const [goals, setGoals] = useState<SavingGoal[]>([]);
  const [loading, setLoading] = useState(false);
  const [isModalVisible, setIsModalVisible] = useState(false);
  const [editingGoal, setEditingGoal] = useState<SavingGoal | null>(null);
  const [depositModalVisible, setDepositModalVisible] = useState(false);
  const [selectedGoal, setSelectedGoal] = useState<SavingGoal | null>(null);
  const [form] = Form.useForm();
  const [depositForm] = Form.useForm();

  const fetchGoals = async () => {
    setLoading(true);
    try {
      console.log('[SavingGoalsPage] 开始获取理财目标');
      const data = await savingGoalService.getSavingGoals();
      setGoals(data);
      console.log('[SavingGoalsPage] 获取理财目标成功', { count: data.length });
    } catch (error) {
      message.error('获取理财目标失败');
      console.error('[SavingGoalsPage] 获取理财目标失败', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchGoals();
  }, []);

  const handleCreateOrUpdate = async (values: any) => {
    try {
      const goalData = {
        ...values,
        deadline: values.deadline ? values.deadline.format('YYYY-MM-DD') : undefined,
      };
      console.log('[SavingGoalsPage] 提交目标数据', goalData);

      if (editingGoal) {
        await savingGoalService.updateSavingGoal(editingGoal.id, goalData);
        message.success('更新成功');
      } else {
        await savingGoalService.createSavingGoal(goalData);
        message.success('创建成功');
      }
      setIsModalVisible(false);
      form.resetFields();
      setEditingGoal(null);
      fetchGoals();
    } catch (error) {
      message.error('操作失败');
    }
  };

  const handleDelete = async (id: string) => {
    Modal.confirm({
      title: '确认删除',
      content: '确定要删除这个理财目标吗？',
      onOk: async () => {
        try {
          await savingGoalService.deleteSavingGoal(id);
          message.success('删除成功');
          fetchGoals();
        } catch (error) {
          message.error('删除失败');
        }
      },
    });
  };

  const handleDeposit = async (values: any) => {
    if (!selectedGoal) return;
    try {
      const amount = Number(values.amount);
      const newAmount = Number(selectedGoal.currentAmount) + amount;
      console.log('[SavingGoalsPage] 存入金额', { goalId: selectedGoal.id, amount, newAmount });
      
      // 检查是否完成
      let status = selectedGoal.status;
      if (newAmount >= selectedGoal.targetAmount && status !== 'completed') {
        status = 'completed';
        message.success('恭喜！您已达成目标！🎉');
      } else {
        message.success('存入成功');
      }

      await savingGoalService.updateSavingGoal(selectedGoal.id, {
        currentAmount: newAmount,
        status
      });
      
      setDepositModalVisible(false);
      depositForm.resetFields();
      setSelectedGoal(null);
      fetchGoals();
    } catch (error) {
      message.error('存入失败');
    }
  };

  const openEditModal = (goal: SavingGoal) => {
    setEditingGoal(goal);
    form.setFieldsValue({
      ...goal,
      deadline: goal.deadline ? dayjs(goal.deadline) : undefined,
    });
    setIsModalVisible(true);
  };

  const openDepositModal = (goal: SavingGoal) => {
    setSelectedGoal(goal);
    depositForm.resetFields();
    setDepositModalVisible(true);
  };

  const getProgressStatus = (goal: SavingGoal) => {
    if (goal.status === 'completed') return 'success';
    if (goal.status === 'abandoned') return 'exception';
    return 'active';
  };

  return (
    <div style={{ padding: '24px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
        <Title level={2} style={{ margin: 0 }}>
          <BankOutlined style={{ marginRight: 12 }} />
          理财目标
        </Title>
        <Button 
          type="primary" 
          icon={<PlusOutlined />} 
          onClick={() => {
            setEditingGoal(null);
            form.resetFields();
            setIsModalVisible(true);
          }}
        >
          新建目标
        </Button>
      </div>

      <Row gutter={[16, 16]}>
        {goals.map(goal => {
          const percent = Math.min(Math.round((Number(goal.currentAmount) / Number(goal.targetAmount)) * 100), 100);
          
          return (
            <Col xs={24} sm={12} md={8} lg={6} key={goal.id}>
              <Card
                hoverable
                actions={[
                  <Button key="deposit" type="text" icon={<WalletOutlined />} onClick={() => openDepositModal(goal)}>存钱</Button>,
                  <Button key="edit" type="text" icon={<EditOutlined />} onClick={() => openEditModal(goal)}>编辑</Button>,
                  <Button key="delete" type="text" danger icon={<DeleteOutlined />} onClick={() => handleDelete(goal.id)}>删除</Button>
                ]}
              >
                <Card.Meta
                  title={
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span>{goal.name}</span>
                      {goal.status === 'completed' && <CheckCircleOutlined style={{ color: '#52c41a' }} />}
                    </div>
                  }
                  description={
                    <div style={{ marginTop: 12 }}>
                      <Statistic 
                        title="当前进度" 
                        value={goal.currentAmount} 
                        suffix={`/ ${goal.targetAmount} ${goal.currency}`} 
                        precision={2}
                        styles={{ content: { fontSize: 16 } }}
                      />
                      <Progress percent={percent} status={getProgressStatus(goal)} format={(p) => `${p}%`} />
                      {goal.deadline && (
                        <div style={{ marginTop: 8, fontSize: 12, color: '#8c8c8c' }}>
                          截止日期: {dayjs(goal.deadline).format('YYYY-MM-DD')}
                        </div>
                      )}
                    </div>
                  }
                />
              </Card>
            </Col>
          );
        })}
        {goals.length === 0 && !loading && (
          <Col span={24}>
            <Empty description="暂无理财目标，快来创建一个吧！" />
          </Col>
        )}
      </Row>

      {/* 创建/编辑 Modal */}
      <Modal
        title={editingGoal ? "编辑目标" : "新建目标"}
        open={isModalVisible}
        onCancel={() => setIsModalVisible(false)}
        onOk={() => form.submit()}
        destroyOnHidden
      >
        <Form form={form} layout="vertical" onFinish={handleCreateOrUpdate}>
          <Form.Item name="name" label="目标名称" rules={[{ required: true, message: '请输入目标名称' }]}>
            <Input placeholder="例如：旅游基金、首付计划" />
          </Form.Item>
          <Form.Item name="targetAmount" label="目标金额" rules={[{ required: true, message: '请输入目标金额' }]}>
            <Space.Compact style={{ width: '100%' }}>
              <InputNumber style={{ width: '100%' }} min={0} precision={2} />
              <span style={{ padding: '0 12px', border: '1px solid #d9d9d9', borderLeft: 'none', borderRadius: '0 6px 6px 0', background: '#fafafa', lineHeight: '32px' }}>CNY</span>
            </Space.Compact>
          </Form.Item>
          <Form.Item name="currentAmount" label="初始金额">
            <Space.Compact style={{ width: '100%' }}>
              <InputNumber style={{ width: '100%' }} min={0} precision={2} />
              <span style={{ padding: '0 12px', border: '1px solid #d9d9d9', borderLeft: 'none', borderRadius: '0 6px 6px 0', background: '#fafafa', lineHeight: '32px' }}>CNY</span>
            </Space.Compact>
          </Form.Item>
          <Form.Item name="deadline" label="预计达成日期">
            <DatePicker style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name="description" label="备注">
            <Input.TextArea rows={3} />
          </Form.Item>
          
          <Form.Item name="autoTransfer" label="自动划转模拟" valuePropName="checked">
            <Switch />
          </Form.Item>
          <Form.Item
            noStyle
            shouldUpdate={(prev, current) => prev.autoTransfer !== current.autoTransfer}
          >
            {({ getFieldValue }) => 
              getFieldValue('autoTransfer') ? (
                <Space style={{ display: 'flex', marginBottom: 8 }} align="baseline">
                  <Form.Item
                    name="autoTransferDay"
                    label="每月几号"
                    rules={[{ required: true, message: '请选择' }]}
                    style={{ width: 120 }}
                  >
                    <InputNumber min={1} max={31} placeholder="日" style={{ width: '100%' }} />
                  </Form.Item>
                  <Form.Item
                    name="autoTransferAmount"
                    label="金额"
                    rules={[{ required: true, message: '请输入' }]}
                    style={{ flex: 1 }}
                  >
                    <Space.Compact style={{ width: '100%' }}>
                      <InputNumber min={0.01} precision={2} style={{ width: '100%' }} />
                      <span style={{ padding: '0 12px', border: '1px solid #d9d9d9', borderLeft: 'none', borderRadius: '0 6px 6px 0', background: '#fafafa', lineHeight: '32px' }}>CNY</span>
                    </Space.Compact>
                  </Form.Item>
                </Space>
              ) : null
            }
          </Form.Item>
        </Form>
      </Modal>

      {/* 存钱 Modal */}
      <Modal
        title={`存入资金 - ${selectedGoal?.name}`}
        open={depositModalVisible}
        onCancel={() => setDepositModalVisible(false)}
        onOk={() => depositForm.submit()}
        destroyOnHidden
      >
        <Form form={depositForm} layout="vertical" onFinish={handleDeposit}>
          <Form.Item 
            name="amount" 
            label="存入金额" 
            rules={[{ required: true, message: '请输入金额' }]}
          >
            <InputNumber style={{ width: '100%' }} min={0.01} precision={2} autoFocus />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
};

export default SavingGoalsPage;
