import React, { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { Form, Input, Button, App as AntdApp } from 'antd';
import { UserOutlined, LockOutlined } from '@ant-design/icons';
import { useDispatch } from 'react-redux';
import { login } from '@store/slices/authSlice';
import { useSafeBackground } from '../hooks/useSafeBackground';
import WindowControls from '../components/layout/WindowControls';
import './LoginPage.css';

const LoginPage = () => {
  const { message } = AntdApp.useApp();
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const dispatch = useDispatch();

  // 安全加载背景图片
  const pageBg = useSafeBackground('https://picsum.photos/1920/1080?random=1');
  const panelBg = useSafeBackground('https://picsum.photos/900/1200?random=2');

  const onFinish = async (values: { username: string; password: string }) => {
    setLoading(true);
    console.log('正在尝试登录:', values.username);
    try {
      const resultAction = await dispatch(login(values) as any);
      if (login.fulfilled.match(resultAction)) {
        console.log('登录成功，数据:', resultAction.payload);
        message.success('登录成功');
        navigate('/');
      } else {
        const errorMsg = resultAction.payload || '登录失败';
        console.error('登录失败原因:', errorMsg);
        message.error(typeof errorMsg === 'string' ? errorMsg : (errorMsg?.message || '登录失败'));
      }
    } catch (error) {
      console.error('登录异常:', error);
      message.error('登录失败，请稍后重试');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div 
      className="login-container" 
      style={{ 
        '--page-bg-image': pageBg ? `url(${pageBg})` : 'none',
        '--panel-bg-image': panelBg ? `url(${panelBg})` : 'none'
      } as React.CSSProperties}
    >
      <WindowControls backgroundColor={pageBg || undefined} />
      <div className="login-content">
        <div className="login-side-panel">
          <div className="panel-content">
            <h2 className="panel-title">精明理财<br />掌控您的财务未来</h2>
            <p className="panel-desc">
              简单、高效、安全的个人财务管理专家。
              通过深度分析和智能提醒，助您达成理财目标。
            </p>
          </div>
        </div>

        <div className="login-form-panel">
          <div className="login-header">
            <div className="login-logo">💰</div>
            <h1 className="login-title">个人财务管理</h1>
            <p className="login-subtitle">登录您的账户以继续</p>
          </div>

          <Form
            name="login"
            className="login-form"
            onFinish={onFinish}
            layout="vertical"
          >
            <Form.Item
              name="username"
              label={<span className="form-label">用户名</span>}
              rules={[{ required: true, message: '请输入用户名' }]}
            >
              <Input
                prefix={<UserOutlined className="form-icon" aria-hidden="true" />}
                placeholder="请输入您的用户名"
                aria-label="用户名"
                autoComplete="username"
              />
            </Form.Item>

            <Form.Item
              name="password"
              label={<span className="form-label">密码</span>}
              rules={[{ required: true, message: '请输入密码' }]}
            >
              <Input.Password
                prefix={<LockOutlined className="form-icon" aria-hidden="true" />}
                placeholder="请输入您的密码"
                aria-label="密码"
                autoComplete="current-password"
              />
            </Form.Item>

            <Form.Item>
              <Button
                type="primary"
                htmlType="submit"
                className="login-form-button"
                loading={loading}
                block
                size="large"
              >
                {loading ? '正在登录...' : '立即登录'}
              </Button>
            </Form.Item>
          </Form>

          <div className="login-footer">
            还没有账户？<Link to="/register">立即注册</Link>
          </div>
        </div>
      </div>
    </div>
  );
};

export default LoginPage;
