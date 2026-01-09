import React, { useEffect, useState } from 'react';
import { Card, Form, Input, Button, Divider, App, Upload, Avatar, Typography } from 'antd';
import { UserOutlined, MailOutlined, SaveOutlined, UploadOutlined } from '@ant-design/icons';
import { useDispatch, useSelector } from 'react-redux';
import { RootState, AppDispatch } from '../../store';
import { getProfile, updateProfile } from '@store/slices/authSlice';
import './SettingsPage.css';

const { Title, Text } = Typography;

/**
 * 个人资料页面组件
 * 用于展示和修改用户的个人信息，包括姓名、邮箱和头像
 */
const ProfilePage: React.FC = () => {
  const { message } = App.useApp();
  const [loading, setLoading] = useState(false);
  const [form] = Form.useForm();
  const dispatch = useDispatch<AppDispatch>();
  const { user } = useSelector((state: RootState) => state.auth);

  useEffect(() => {
    dispatch(getProfile() as any);
  }, [dispatch]);

  useEffect(() => {
    if (user) {
      form.setFieldsValue({
        fullName: user.fullName,
        email: user.email,
      });
    }
  }, [user, form]);

  /**
   * 处理个人资料提交
   * @param values 表单提交的姓名等信息
   */
  const handleSubmit = async (values: any) => {
    setLoading(true);
    try {
      await dispatch(updateProfile(values) as any);
      message.success('个人资料已更新');
    } catch (error) {
      console.error('更新个人资料失败:', error);
      message.error('更新失败');
    } finally {
      setLoading(false);
    }
  };

  /**
   * 处理头像上传
   * @param info 上传状态信息
   */
  const handleAvatarUpload = (info: any) => {
    if (info.file.status === 'done') {
      message.success('头像上传成功');
      dispatch(getProfile() as any);
    }
  };

  return (
    <div className="settings-section">
      <div className="settings-header">
        <Title level={2} className="page-title">个人资料</Title>
        <Text type="secondary">管理您的公开信息和账户联系方式</Text>
      </div>
      
      <Card className="settings-main-card glass-card" bordered={false}>
        <div className="settings-content-inner">
          <Form form={form} layout="vertical" onFinish={handleSubmit}>
            <div className="avatar-section">
              <Upload 
                showUploadList={false} 
                action="/api/upload/avatar" 
                onChange={handleAvatarUpload}
              >
                <div className="avatar-wrapper">
                  <Avatar size={120} icon={<UserOutlined />} src={user?.avatar} style={{ border: 'none', background: 'var(--primary-100)' }} />
                  <div className="avatar-overlay">
                    <UploadOutlined style={{ fontSize: 24 }} />
                    <span style={{ marginTop: 8, fontWeight: 600 }}>更换头像</span>
                  </div>
                </div>
              </Upload>
              <div style={{ marginTop: 24, textAlign: 'center' }}>
                <Title level={4} style={{ marginBottom: 4, fontWeight: 700 }}>{user?.fullName || '未设置姓名'}</Title>
                <Text type="secondary" style={{ fontSize: '14px', fontWeight: 500 }}>{user?.email}</Text>
              </div>
            </div>
            
            <Divider style={{ margin: '32px 0' }} />
            
            <Form.Item 
              name="fullName" 
              label="姓名" 
              rules={[{ required: true, message: '请输入姓名' }]}
            >
              <Input placeholder="您的姓名" size="large" />
            </Form.Item>
            
            <Form.Item name="email" label="邮箱">
              <Input 
                prefix={<MailOutlined />} 
                placeholder="您的邮箱" 
                disabled 
                size="large"
              />
            </Form.Item>
            
            <Form.Item className="save-btn-container">
              <Button 
                type="primary" 
                icon={<SaveOutlined />} 
                htmlType="submit" 
                loading={loading} 
                size="large"
                block
                className="save-btn"
              >
                保存资料修改
              </Button>
            </Form.Item>
          </Form>
        </div>
      </Card>
    </div>
  );
};

export default ProfilePage;
