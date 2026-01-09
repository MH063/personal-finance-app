import React, { useState } from 'react';
import { Card, Form, Input, Button, App, Typography, Divider } from 'antd';
import { SecurityScanOutlined, LockOutlined, SaveOutlined } from '@ant-design/icons';
import axios from 'axios';
import './SettingsPage.css';

const { Title, Text } = Typography;

const API_URL = import.meta.env.VITE_API_URL || 'http://192.168.66.41:4000/api/v1';

/**
 * 密码安全页面组件
 * 用于用户修改登录密码，增强账户安全性
 */
const SecurityPage: React.FC = () => {
  const { message } = App.useApp();
  const [loading, setLoading] = useState(false);
  const [form] = Form.useForm();

  /**
   * 获取认证头
   */
  const getAuthHeader = () => {
    const token = localStorage.getItem('accessToken');
    return { Authorization: `Bearer ${token}` };
  };

  /**
   * 处理密码变更提交
   * @param values 包含当前密码、新密码和确认新密码的表单数据
   */
  const handlePasswordChange = async (values: any) => {
    setLoading(true);
    try {
      await axios.put(`${API_URL}/auth/password`, {
        currentPassword: values.currentPassword,
        newPassword: values.newPassword,
      }, {
        headers: getAuthHeader()
      });
      message.success('密码已成功更改，请妥善保管新密码');
      form.resetFields();
    } catch (error: any) {
      console.error('修改密码失败:', error);
      const errorMsg = error.response?.data?.message || '密码更改失败，请稍后重试';
      message.error(errorMsg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="settings-section">
      <div className="settings-header">
        <Title level={2} className="page-title">密码安全</Title>
        <Text type="secondary">定期更换密码可以有效提高账户安全性</Text>
      </div>

      <Card className="settings-main-card glass-card" bordered={false}>
        <div className="settings-content-inner">
          <Form form={form} layout="vertical" onFinish={handlePasswordChange}>
            <Form.Item 
              name="currentPassword" 
              label="当前密码" 
              rules={[{ required: true, message: '请输入当前密码' }]}
            >
              <Input.Password 
                prefix={<LockOutlined />} 
                placeholder="输入当前密码" 
                size="large" 
              />
            </Form.Item>

            <Divider style={{ margin: '32px 0' }} />

            <Form.Item 
              name="newPassword" 
              label="新密码" 
              rules={[
                { required: true, message: '请输入新密码' },
                { min: 8, message: '密码长度至少8位' }
              ]}
            >
              <Input.Password 
                prefix={<LockOutlined />} 
                placeholder="输入新密码" 
                size="large" 
              />
            </Form.Item>

            <Form.Item 
              name="confirmPassword" 
              label="确认新密码" 
              dependencies={['newPassword']} 
              rules={[
                { required: true, message: '请确认新密码' },
                ({ getFieldValue }) => ({
                  validator(_, value) {
                    if (!value || getFieldValue('newPassword') === value) {
                      return Promise.resolve();
                    }
                    return Promise.reject(new Error('两次输入的密码不一致'));
                  },
                }),
              ]}
            >
              <Input.Password 
                prefix={<LockOutlined />} 
                placeholder="再次输入新密码" 
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
                更新密码
              </Button>
            </Form.Item>
          </Form>
        </div>
      </Card>
    </div>
  );
};

export default SecurityPage;
