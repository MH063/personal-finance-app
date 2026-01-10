import React, { useEffect, useState, useRef } from 'react';
import { Card, Form, Input, Button, Divider, App, Upload, Avatar, Typography, Modal, Spin } from 'antd';
import { UserOutlined, MailOutlined, SaveOutlined, UploadOutlined, CameraOutlined, LoadingOutlined } from '@ant-design/icons';
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
  const { message, modal } = App.useApp();
  const [loading, setLoading] = useState(false);
  const [avatarLoading, setAvatarLoading] = useState(false);
  const [form] = Form.useForm();
  const dispatch = useDispatch<AppDispatch>();
  const { user } = useSelector((state: RootState) => state.auth);
  const uploadRef = useRef<any>(null);

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
   * 手动处理头像区域点击
   */
  const handleAvatarClick = (e: React.MouseEvent) => {
    if (avatarLoading) return;
    
    // 阻止事件冒泡，防止触发 Upload 的默认行为（虽然已经设置了 openFileDialogOnClick={false}）
    e.stopPropagation();

    modal.confirm({
      title: '更换头像',
      content: '确定要选择一张新图片作为头像吗？',
      okText: '确认',
      cancelText: '取消',
      centered: true,
      className: 'glass-modal',
      onOk: () => {
        // 确认后，通过 ref 找到隐藏的 input 并模拟点击
        const uploadElement = document.querySelector('.avatar-section .ant-upload input[type="file"]') as HTMLInputElement;
        if (uploadElement) {
          uploadElement.click();
        }
      },
    });
  };

  /**
   * 处理头像上传前的状态
   */
  const beforeUpload = (file: File) => {
    setAvatarLoading(true);
    return true;
  };

  /**
   * 处理头像上传
   * @param info 上传状态信息
   */
  const handleAvatarUpload = (info: any) => {
    if (info.file.status === 'done') {
      setAvatarLoading(false);
      message.success('头像上传成功');
      dispatch(getProfile() as any);
    } else if (info.file.status === 'error') {
      setAvatarLoading(false);
      message.error('头像上传失败');
    }
  };

  return (
    <div className="settings-section">
      <div className="settings-header">
        <Title level={2} className="page-title">个人资料</Title>
        <Text type="secondary">管理您的公开信息和账户联系方式</Text>
      </div>
      
      <Card className="settings-main-card glass-card" variant="borderless">
        <div className="settings-content-inner">
          <Form form={form} layout="vertical" onFinish={handleSubmit}>
            <div className="avatar-section">
              <Upload 
                showUploadList={false} 
                action="/api/upload/avatar" 
                beforeUpload={beforeUpload}
                onChange={handleAvatarUpload}
                disabled={avatarLoading}
                openFileDialogOnClick={false}
              >
                <div 
                  className={`avatar-wrapper ${avatarLoading ? 'loading' : ''}`}
                  onClick={handleAvatarClick}
                >
                  <Spin spinning={avatarLoading} indicator={<LoadingOutlined style={{ fontSize: 24, color: 'white' }} spin />}>
                    <Avatar size={120} icon={<UserOutlined />} src={user?.avatar} style={{ border: 'none' }} />
                  </Spin>
                  {!avatarLoading && (
                    <div className="avatar-overlay">
                      <CameraOutlined />
                    </div>
                  )}
                </div>
              </Upload>
              <div style={{ marginTop: 24, textAlign: 'center' }}>
                <Title level={4} style={{ marginBottom: 4, fontWeight: 700, color: 'white', textShadow: '0 1px 2px rgba(0,0,0,0.3)' }}>{user?.fullName || '未设置姓名'}</Title>
                <Text style={{ fontSize: '14px', fontWeight: 500, color: 'rgba(255, 255, 255, 0.9)', textShadow: '0 1px 1px rgba(0,0,0,0.2)' }}>{user?.email}</Text>
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
            
            <Form.Item 
              name="email" 
              label="邮箱"
              rules={[
                { required: true, message: '请输入邮箱' },
                { type: 'email', message: '请输入有效的邮箱地址' }
              ]}
            >
              <Input 
                placeholder="您的邮箱" 
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
