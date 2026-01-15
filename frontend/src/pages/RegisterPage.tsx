import React, { useEffect, useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { Form, Input, Button, App as AntdApp } from 'antd';
import { UserOutlined, LockOutlined, MailOutlined } from '@ant-design/icons';
import { useDispatch } from 'react-redux';
import { register, setTokens } from '@store/slices/authSlice';
import { useSafeBackground } from '../hooks/useSafeBackground';
import WindowControls from '../components/layout/WindowControls';
import { silenceAuthErrors } from '../services/api';
import './RegisterPage.css';

const RegisterPage = () => {
  const { message } = AntdApp.useApp();
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const dispatch = useDispatch();

  const [pageSeed] = useState(() => Math.floor(Math.random() * 1_000_000));
  const [panelSeed] = useState(() => Math.floor(Math.random() * 1_000_000));

  const pageBg = useSafeBackground(`https://picsum.photos/1920/1080?random=${pageSeed}`);
  const panelBg = useSafeBackground(`https://picsum.photos/800/1200?random=${panelSeed}`);

  useEffect(() => {
    silenceAuthErrors(5000);
  }, []);

  const onFinish = async (values: { username: string; email: string; password: string; fullName?: string }) => {
    setLoading(true);
    try {
      const resultAction = await dispatch(register(values) as any);
      if (register.fulfilled.match(resultAction)) {
        dispatch(setTokens({
          accessToken: resultAction.payload.tokens.accessToken,
          refreshToken: resultAction.payload.tokens.refreshToken,
        }));
        message.success('注册成功');
        navigate('/');
      } else {
        const errorMsg = resultAction.payload || '注册失败';
        message.error(typeof errorMsg === 'string' ? errorMsg : (errorMsg?.message || '注册失败'));
      }
    } catch {
      message.error('注册失败，请稍后重试');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div 
      className="register-container"
      style={{ 
        '--page-bg-image': pageBg ? `url(${pageBg})` : 'none',
        '--panel-bg-image': panelBg ? `url(${panelBg})` : 'none'
      } as React.CSSProperties}
    >
      <WindowControls backgroundColor={pageBg || undefined} />
      <div className="register-content">
        <div className="register-side-panel">
          <div className="panel-content">
            <h2 className="panel-title">加入我们<br />开启智慧理财之旅</h2>
            <ul className="panel-features">
              <li>多维度收支统计分析</li>
              <li>智能预算管理与预警</li>
              <li>安全的云端备份恢复</li>
              <li>多端同步的财务账单</li>
            </ul>
          </div>
        </div>

        <div className="register-form-panel">
          <div className="register-header">
            <div className="register-logo">💰</div>
            <h1 className="register-title">创建您的账户</h1>
            <p className="register-subtitle">简单几步，开始掌控您的财务</p>
          </div>

          <Form
            name="register"
            className="register-form"
            onFinish={onFinish}
            layout="vertical"
          >
            <Form.Item
              name="username"
              label={<span className="form-label">用户名</span>}
              rules={[
                { required: true, message: '请输入用户名' },
                { min: 3, message: '用户名至少3个字符' },
                { max: 50, message: '用户名最多50个字符' },
              ]}
            >
              <Input
                prefix={<UserOutlined className="form-icon" aria-hidden="true" />}
                placeholder="设置您的登录用户名"
                aria-label="用户名"
                autoComplete="username"
              />
            </Form.Item>

            <Form.Item
              name="email"
              label={<span className="form-label">电子邮箱</span>}
              rules={[
                { required: true, message: '请输入邮箱' },
                { type: 'email', message: '请输入有效的邮箱地址' },
              ]}
            >
              <Input
                prefix={<MailOutlined className="form-icon" aria-hidden="true" />}
                placeholder="请输入您的常用邮箱"
                aria-label="邮箱地址"
                autoComplete="email"
              />
            </Form.Item>

            <Form.Item
              name="fullName"
              label={<span className="form-label">真实姓名（可选）</span>}
              rules={[{ max: 100, message: '姓名最多100个字符' }]}
            >
              <Input
                prefix={<UserOutlined className="form-icon" aria-hidden="true" />}
                placeholder="请输入您的真实姓名"
                aria-label="真实姓名"
                autoComplete="name"
              />
            </Form.Item>

            <Form.Item
              name="password"
              label={<span className="form-label">设置密码</span>}
              rules={[
                { required: true, message: '请输入密码' },
                { min: 8, message: '密码至少8个字符' },
                { pattern: /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{8,}$/, message: '密码必须包含大小写字母和数字' },
              ]}
            >
              <Input.Password
                prefix={<LockOutlined className="form-icon" aria-hidden="true" />}
                placeholder="8位以上，包含大小写字母和数字"
                aria-label="密码"
                autoComplete="new-password"
              />
            </Form.Item>

            <Form.Item
              name="confirmPassword"
              label={<span className="form-label">确认密码</span>}
              dependencies={['password']}
              rules={[
                { required: true, message: '请确认密码' },
                ({ getFieldValue }) => ({
                  validator(_, value) {
                    if (!value || getFieldValue('password') === value) {
                      return Promise.resolve();
                    }
                    return Promise.reject(new Error('两次输入的密码不一致'));
                  },
                }),
              ]}
            >
              <Input.Password
                prefix={<LockOutlined className="form-icon" aria-hidden="true" />}
                placeholder="请再次输入密码以确认"
                aria-label="确认密码"
                autoComplete="new-password"
              />
            </Form.Item>

            <Form.Item>
              <Button
                type="primary"
                htmlType="submit"
                className="register-form-button"
                loading={loading}
                block
                size="large"
              >
                {loading ? '正在注册...' : '立即注册'}
              </Button>
            </Form.Item>
          </Form>

          <div className="login-link">
            已有账户？<Link to="/login">立即登录</Link>
          </div>
        </div>
      </div>
    </div>
  );
};

export default RegisterPage;
