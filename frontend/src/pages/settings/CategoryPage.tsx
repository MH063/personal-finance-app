import React, { useEffect, useState, useCallback } from 'react';
import { Typography, Button, Row, Col, Card, Table, Tag, Space, Modal, Form, Input, Select, App as AntdApp, Popconfirm, ColorPicker } from 'antd';
import { PlusOutlined, EditOutlined, DeleteOutlined, TagsOutlined } from '@ant-design/icons';
import { useDispatch, useSelector } from 'react-redux';
import { RootState, AppDispatch } from '../../store';
import { fetchCategories, createCategory, updateCategory, deleteCategory, Category } from '../../store/slices/categorySlice';
import { collaborativeService } from '../../services/collaborativeService';
import './CategoryPage.css';

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
    
    return () => {
      collaborativeService.off('ledgerUpdate', handleUpdate);
      collaborativeService.off('globalUpdate', handleUpdate);
    };
  }, [dispatch]);

  const handleAdd = useCallback(() => {
    setEditingCategory(null);
    setModalVisible(true);
    form.resetFields();
    form.setFieldsValue({ type: 'expense', color: '#1677ff' });
  }, [form]);

  const handleEdit = useCallback((category: Category) => {
    setEditingCategory(category);
    setModalVisible(true);
    form.setFieldsValue({
      name: category.name,
      type: category.type,
      icon: category.icon,
      color: category.color || '#1677ff',
    });
  }, [form]);

  const handleDelete = useCallback(async (id: string) => {
    try {
      await dispatch(deleteCategory(id)).unwrap();
      message.success('分类已删除');
    } catch (error: any) {
      message.error(error.message || '删除失败');
    }
  }, [dispatch, message]);

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
            description="删除分类不会删除已有的交易记录，但这些记录将显示为“未分类”。"
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
          <Button 
            type="primary" 
            icon={<PlusOutlined />} 
            onClick={handleAdd}
            size="large"
          >
            创建新分类
          </Button>
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
      >
        <Form form={form} layout="vertical" onFinish={handleModalSubmit}>
          <Form.Item name="name" label="分类名称" rules={[{ required: true, message: '请输入分类名称' }]}>
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
    </div>
  );
};

export default CategoryPage;
