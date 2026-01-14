import React, { useEffect, useState, useMemo, useCallback } from 'react';
import { Typography, Button, Card, Table, Tag, Space, Modal, Form, Input, Select, App as AntdApp, Popconfirm, Badge, Tooltip } from 'antd';
import { PlusOutlined, TeamOutlined, EditOutlined, DeleteOutlined, UserAddOutlined, SafetyCertificateOutlined } from '@ant-design/icons';
import { useDispatch, useSelector } from 'react-redux';
import { RootState, AppDispatch } from '../../store';
import { fetchLedgers, createLedger, updateLedger, deleteLedger } from '../../store/slices/ledgerSlice';
import { ledgerService, Ledger } from '../../services/ledgerService';
import { collaborativeService } from '../../services/collaborativeService';
import './LedgerPage.css';

const { Title, Text, Paragraph } = Typography;
const { Option } = Select;
const { TextArea } = Input;

/**
 * 账本管理页面
 */
const LedgerPage: React.FC = () => {
  const { message } = AntdApp.useApp();
  const dispatch = useDispatch<AppDispatch>();
  const { ledgers, loading } = useSelector((state: RootState) => state.ledger);
  const { user } = useSelector((state: RootState) => state.auth);
  
  const [modalVisible, setModalVisible] = useState(false);
  const [memberModalVisible, setMemberModalVisible] = useState(false);
  const [editingLedger, setEditingLedger] = useState<Ledger | null>(null);
  const [currentLedgerForMembers, setCurrentLedgerForMembers] = useState<Ledger | null>(null);
  const [form] = Form.useForm();
  const [memberForm] = Form.useForm();
  const [submitLoading, setSubmitLoading] = useState(false);

  useEffect(() => {
    dispatch(fetchLedgers());
    
    // 监听更新
    const handleUpdate = (data: any) => {
      console.log('监听到实时更新:', data);
      // 账本更新或重连同步时刷新
      if (data.type?.includes('LEDGER') || data.type?.includes('MEMBER') || data.type === 'RECONNECTED_SYNC') {
        dispatch(fetchLedgers());
      }
    };
    
    collaborativeService.on('ledgerUpdate', handleUpdate);
    collaborativeService.on('globalUpdate', handleUpdate);
    
    return () => {
      collaborativeService.off('ledgerUpdate', handleUpdate);
      collaborativeService.off('globalUpdate', handleUpdate);
      // 注意：这里不执行 disconnect，以保持全局连接活跃
    };
  }, [dispatch]);

  const handleAddLedger = useCallback(() => {
    setEditingLedger(null);
    setModalVisible(true);
  }, []);

  const handleEditLedger = useCallback((ledger: Ledger) => {
    setEditingLedger(ledger);
    setModalVisible(true);
  }, []);

  // 当 Modal 显示且编辑数据变化时，更新表单值
  useEffect(() => {
    if (modalVisible) {
      // 使用 setTimeout 确保 Form 组件已挂载并连接到 useForm 实例
      const timer = setTimeout(() => {
        if (editingLedger) {
          form.setFieldsValue({
            name: editingLedger.name,
            description: editingLedger.description,
            type: editingLedger.type,
          });
        } else {
          form.resetFields();
          form.setFieldsValue({ type: 'shared' });
        }
      }, 0);
      return () => clearTimeout(timer);
    }
  }, [modalVisible, editingLedger, form]);

  const handleDeleteLedger = useCallback(async (id: string) => {
    try {
      await dispatch(deleteLedger(id)).unwrap();
      message.success('账本已删除');
      // 删除后刷新列表，确保统计数据更新
      dispatch(fetchLedgers());
    } catch (error: any) {
      message.error(typeof error === 'string' ? error : (error?.message || '删除失败'));
    }
  }, [dispatch, message]);

  const handleModalSubmit = useCallback(async (values: any) => {
    setSubmitLoading(true);
    try {
      if (editingLedger) {
        await dispatch(updateLedger({ id: editingLedger.id, data: values })).unwrap();
        message.success('账本已更新');
      } else {
        await dispatch(createLedger(values)).unwrap();
        message.success('账本已创建');
      }
      setModalVisible(false);
      // 重新获取账本列表以确保数据同步（包含统计字段、成员信息等）
      dispatch(fetchLedgers());
    } catch (error: any) {
      message.error(typeof error === 'string' ? error : (error?.message || '操作失败'));
    } finally {
      setSubmitLoading(false);
    }
  }, [dispatch, editingLedger, message]);

  const handleManageMembers = useCallback((ledger: Ledger) => {
    setCurrentLedgerForMembers(ledger);
    setMemberModalVisible(true);
  }, []);

  // 成员管理 Modal
  
  const currentUserRole = useMemo(() => {
    if (!currentLedgerForMembers || !user) return null;
    if (currentLedgerForMembers.ownerId === user.id) return 'owner';
    return currentLedgerForMembers.members?.find(m => m.userId === user.id)?.role || null;
  }, [currentLedgerForMembers, user]);

  const canManageMembers = currentUserRole === 'owner' || currentUserRole === 'admin';

  const handleAddMember = async (values: any) => {
    if (!currentLedgerForMembers) return;
    setSubmitLoading(true);
    try {
      await ledgerService.addMember(currentLedgerForMembers.id, values.userId, values.role);
      message.success('成员已添加');
      dispatch(fetchLedgers()); // 刷新列表以获取最新成员信息
      memberForm.resetFields();
    } catch (error: any) {
      message.error(typeof error === 'string' ? error : (error.response?.data?.message || error.message || '添加失败'));
    } finally {
      setSubmitLoading(false);
    }
  };

  const handleRemoveMember = async (ledgerId: string, userId: string) => {
    try {
      await ledgerService.removeMember(ledgerId, userId);
      message.success('成员已移除');
      dispatch(fetchLedgers());
    } catch (error: any) {
      message.error(typeof error === 'string' ? error : (error.response?.data?.message || error.message || '移除失败'));
    }
  };

  // 过滤并去重账本列表
  const displayLedgers = useMemo(() => {
    const uniqueLedgers = new Map<string, Ledger>();
    
    // 按更新时间排序
    const sortedLedgers = [...ledgers].sort((a, b) => {
      const timeA = new Date(a.updatedAt || 0).getTime();
      const timeB = new Date(b.updatedAt || 0).getTime();
      return timeB - timeA; // 最新的在前面
    });

    sortedLedgers.forEach(ledger => {
      // 使用 ID 作为唯一键，而不是名称，防止同名账本被过滤
      if (!uniqueLedgers.has(ledger.id)) {
        uniqueLedgers.set(ledger.id, ledger);
      }
    });

    return Array.from(uniqueLedgers.values());
  }, [ledgers]);

  const columns = useMemo(() => [
    {
      title: '账本名称',
      dataIndex: 'name',
      key: 'name',
      render: (text: string, record: Ledger) => (
        <Space>
          <span style={{ fontWeight: 600 }}>{text}</span>
          {record.isDefault && <Tag color="blue">默认</Tag>}
          {record.type === 'shared' ? <Tag color="green">共享</Tag> : <Tag color="orange">私有</Tag>}
        </Space>
      ),
    },
    {
      title: '描述',
      dataIndex: 'description',
      key: 'description',
      ellipsis: true,
    },
    {
      title: '所有者',
      key: 'owner',
      render: (_: any, record: Ledger) => (
        <span>{record.owner?.fullName || record.owner?.username || '未知'}</span>
      ),
    },
    {
      title: '成员数',
      key: 'memberCount',
      render: (_: any, record: Ledger) => (
        <Badge count={record.members?.length || 0} showZero color="#ff4d4f" />
      ),
    },
    {
      title: '操作',
      key: 'actions',
      render: (_: any, record: Ledger) => {
        const userRole = record.ownerId === user?.id || !record.ownerId 
          ? 'owner' 
          : record.members?.find(m => m.userId === user?.id)?.role;
        
        const isOwner = userRole === 'owner';
        const isAdmin = userRole === 'admin';
        const canEdit = isOwner || isAdmin;
        const isDefault = record.isDefault === true;

        return (
          <Space size="small" wrap>
            <Button 
              type="text" 
              icon={<EditOutlined />} 
              onClick={() => handleEditLedger(record)}
              disabled={!canEdit}
            >
              编辑
            </Button>
            <Button 
              type="text" 
              icon={<TeamOutlined />} 
              onClick={() => handleManageMembers(record)}
            >
              成员
            </Button>
            {isDefault ? (
              <Tooltip title="默认账本不能删除，您可以创建新账本并设置为默认">
                <Button 
                  type="text" 
                  danger 
                  icon={<DeleteOutlined />} 
                  disabled
                >
                  删除
                </Button>
              </Tooltip>
            ) : (
              <Popconfirm
                title="确定要删除该账本吗？"
                description="删除账本将同时删除其中的所有交易记录。"
                onConfirm={() => handleDeleteLedger(record.id)}
                disabled={!isOwner}
                okText="确定"
                cancelText="取消"
              >
                <Tooltip title={!isOwner ? "只有所有者可以删除账本" : ""}>
                  <Button 
                    type="text" 
                    danger 
                    icon={<DeleteOutlined />} 
                    disabled={!isOwner}
                  >
                    删除
                  </Button>
                </Tooltip>
              </Popconfirm>
            )}
          </Space>
        );
      },
    },
  ], [user, handleEditLedger, handleManageMembers, handleDeleteLedger]);

  return (
    <div className="ledger-page">
      <div className="page-header-section">
        <div className="header-left">
          <Title level={2} className="page-title">账本管理</Title>
          <Text type="secondary">管理您的私有账本和与家人共享的账本</Text>
        </div>
        <div className="header-actions">
          <Button 
            type="primary" 
            icon={<PlusOutlined />} 
            onClick={handleAddLedger}
            size="large"
          >
            创建新账本
          </Button>
        </div>
      </div>

      <Card variant="borderless" className="glass-card">
        <Table 
            columns={columns} 
            dataSource={displayLedgers} 
            rowKey="id" 
            loading={loading}
            pagination={{
              pageSize: 5,
              total: displayLedgers.length,
              showSizeChanger: true,
              showTotal: (total) => `共 ${total} 个账本`,
              position: ['bottomRight']
            }}
            className="glass-table"
          />
      </Card>

      {/* 创建/编辑账本 Modal */}
      <Modal
        title={editingLedger ? '编辑账本' : '创建新账本'}
        open={modalVisible}
        onOk={() => form.submit()}
        onCancel={() => setModalVisible(false)}
        confirmLoading={submitLoading}
        destroyOnClose
        className="custom-modal"
        centered
        maskClosable={true}
        keyboard={true}
      >
        <Form form={form} layout="vertical" onFinish={handleModalSubmit}>
          <Form.Item name="name" label="账本名称" rules={[{ required: true, message: '请输入账本名称' }]}>
            <Input placeholder="例如：家庭开支、装修基金" maxLength={50} />
          </Form.Item>
          <Form.Item name="type" label="账本类型" rules={[{ required: true }]}>
            <Select>
              <Option value="private">私有 (仅自己可见)</Option>
              <Option value="shared">共享 (可邀请成员)</Option>
            </Select>
          </Form.Item>
          <Form.Item name="description" label="备注说明">
            <TextArea rows={3} placeholder="添加一些关于这个账本的描述..." maxLength={200} />
          </Form.Item>
        </Form>
      </Modal>

      {/* 成员管理 Modal */}
      <Modal
        title={`管理成员 - ${currentLedgerForMembers?.name}`}
        open={memberModalVisible}
        onCancel={() => setMemberModalVisible(false)}
        footer={null}
        width={600}
        destroyOnClose
        className="custom-modal"
        centered
        maskClosable={true}
        keyboard={true}
      >
        <div className="member-management">
          {canManageMembers && (
            <div className="add-member-section">
              <Title level={5}><UserAddOutlined /> 添加新成员</Title>
              <Form form={memberForm} layout="inline" onFinish={handleAddMember}>
                <Form.Item name="userId" rules={[{ required: true, message: '请输入用户ID' }]}>
                  <Input placeholder="输入用户ID (UUID)" style={{ width: 250 }} />
                </Form.Item>
                <Form.Item name="role" initialValue="member">
                  <Select style={{ width: 100 }}>
                    {currentUserRole === 'owner' && <Option value="admin">管理员</Option>}
                    <Option value="member">成员</Option>
                    <Option value="viewer">观察者</Option>
                  </Select>
                </Form.Item>
                <Form.Item>
                  <Button type="primary" htmlType="submit" loading={submitLoading}>
                    添加
                  </Button>
                </Form.Item>
              </Form>
              <Paragraph type="secondary" style={{ marginTop: 8 }}>
                提示：目前需要通过用户唯一标识 (ID) 来添加。未来将支持通过邮箱搜索。
                {currentUserRole === 'admin' && <div style={{ color: '#faad14' }}>作为管理员，您只能添加普通成员或观察者。</div>}
              </Paragraph>
            </div>
          )}

          <div className="member-list-section" style={{ marginTop: 24 }}>
            <Title level={5}><TeamOutlined /> 当前成员</Title>
            <Table
              dataSource={currentLedgerForMembers?.members}
              rowKey="id"
              pagination={false}
              size="small"
              columns={[
                {
                  title: '成员',
                  key: 'user',
                  render: (_: any, record: any) => (
                    <div>
                      <div style={{ fontWeight: 600 }}>{record.user?.fullName || record.user?.username} {record.userId === user?.id && <Tag size="small">我</Tag>}</div>
                      <div style={{ fontSize: 12, color: '#999' }}>{record.user?.email}</div>
                    </div>
                  )
                },
                {
                  title: '角色',
                  dataIndex: 'role',
                  key: 'role',
                  render: (role: string) => {
                    const roles: any = {
                      owner: { label: '所有者', color: 'gold' },
                      admin: { label: '管理员', color: 'blue' },
                      member: { label: '成员', color: 'green' },
                      viewer: { label: '观察者', color: 'default' }
                    };
                    const config = roles[role] || roles.member;
                    return <Tag color={config.color}>{config.label}</Tag>;
                  }
                },
                {
                  title: '操作',
                  key: 'action',
                  render: (_: any, record: any) => {
                    if (record.role === 'owner') return <SafetyCertificateOutlined title="所有者" />;
                    
                    // 权限逻辑：
                    // 1. 所有者可以移除任何人（除了自己，已经在 handleRemoveMember 逻辑中处理）
                    // 2. 管理员可以移除普通成员和观察者，但不能移除其他管理员或所有者
                    // 3. 任何人都可以移除自己（退出账本）
                    
                    const isSelf = record.userId === user?.id;
                    const canRemove = isSelf || 
                      (currentUserRole === 'owner') || 
                      (currentUserRole === 'admin' && record.role !== 'admin' && record.role !== 'owner');

                    if (!canRemove) return null;

                    return (
                      <Popconfirm
                        title={isSelf ? "确定要退出该账本吗？" : "确定要移除该成员吗？"}
                        onConfirm={() => handleRemoveMember(currentLedgerForMembers!.id, record.userId)}
                      >
                        <Button type="link" danger size="small">{isSelf ? '退出' : '移除'}</Button>
                      </Popconfirm>
                    );
                  }
                }
              ]}
            />
          </div>
        </div>
      </Modal>
    </div>
  );
};

export default LedgerPage;
