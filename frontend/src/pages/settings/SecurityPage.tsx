import React, { useState, useEffect } from 'react';
import { Card, Form, Input, Button, App as AntdApp, Typography, Divider, Switch, Row, Col } from 'antd';
import { SaveOutlined, ScanOutlined } from '@ant-design/icons';
import settingsService from '../../services/settingsService';
import './SettingsPage.css';

const { Title, Text } = Typography;

/**
 * 密码安全页面组件
 * 用于用户修改登录密码，增强账户安全性
 */
const SecurityPage: React.FC = () => {
  const { message } = AntdApp.useApp();
  const [loading, setLoading] = useState(false);
  const [biometricEnabled, setBiometricEnabled] = useState(false);
  const [form] = Form.useForm();

  useEffect(() => {
    const enabled = localStorage.getItem('biometric_enabled') === 'true';
    setBiometricEnabled(enabled);
  }, []);

  const handleBiometricChange = async (checked: boolean) => {
    if (checked) {
      // 尝试调用 WebAuthn 验证是否支持
      if (!window.PublicKeyCredential) {
        message.error('您的设备不支持生物识别或未配置');
        return;
      }
      
      try {
        // 简单检测有效性 (在实际生产中应进行完整的注册流程)
        const available = await window.PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
        if (!available) {
             message.error('未检测到可用的生物识别设备 (如 Windows Hello)');
             return;
        }
        localStorage.setItem('biometric_enabled', 'true');
        setBiometricEnabled(true);
        message.success('已启用生物识别解锁');
      } catch (e) {
        console.error(e);
        message.error('启用失败');
      }
    } else {
      localStorage.setItem('biometric_enabled', 'false');
      setBiometricEnabled(false);
      message.success('已关闭生物识别解锁');
    }
  };

  /**
   * 处理密码变更提交
   * @param values 包含当前密码、新密码和确认新密码的表单数据
   */
  const handlePasswordChange = async (values: any) => {
    setLoading(true);
    try {
      await settingsService.changePassword({
        currentPassword: values.currentPassword,
        newPassword: values.newPassword,
      });
      message.success('密码已成功更改，请妥善保管新密码');
      form.resetFields();
    } catch (error: any) {
      console.error('修改密码失败:', error);
      const errorMsg = typeof error === 'string' ? error : (error.response?.data?.message || error.message || '密码更改失败，请稍后重试');
      message.error(errorMsg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="settings-section">
      <div className="settings-header">
        <Title level={2} className="page-title">密码安全</Title>
        <Text style={{ color: 'rgba(255, 255, 255, 0.7)' }}>定期更换密码可以有效提高账户安全性</Text>
      </div>

      <Card className="settings-main-card glass-card" variant="borderless">
        <div className="settings-content-inner">
          <Form form={form} layout="vertical" onFinish={handlePasswordChange}>
            <div style={{ marginBottom: 32 }}>
              <Row align="middle" justify="space-between">
                <Col>
                  <div style={{ display: 'flex', alignItems: 'center' }}>
                    <ScanOutlined style={{ fontSize: 24, marginRight: 16, color: '#1890ff' }} />
                    <div>
                      <Text strong style={{ fontSize: 16, display: 'block' }}>Windows Hello 生物识别解锁</Text>
                      <Text type="secondary">启用后，打开应用时需要验证指纹或面部识别</Text>
                    </div>
                  </div>
                </Col>
                <Col>
                  <Switch 
                    checked={biometricEnabled} 
                    onChange={handleBiometricChange} 
                    checkedChildren="开启"
                    unCheckedChildren="关闭"
                  />
                </Col>
              </Row>
            </div>
            
            <Divider />

            <Form.Item 
              name="currentPassword" 
              label="当前密码" 
              rules={[{ required: true, message: '请输入当前密码' }]}
            >
              <Input 
                type="password"
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
              <Input 
                type="password"
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
              <Input 
                type="password"
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
