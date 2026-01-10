import React, { useEffect } from 'react';
import { Layout, Menu, Avatar, Dropdown, Badge, Button, Space, Typography, Spin, Input } from 'antd';
import {
  DashboardOutlined,
  RiseOutlined,
  FallOutlined,
  AccountBookOutlined,
  BarChartOutlined,
  SettingOutlined,
  DatabaseOutlined,
  BellOutlined,
  UserOutlined,
  SecurityScanOutlined,
  GlobalOutlined,
  LogoutOutlined,
  SettingFilled,
  WalletOutlined,
} from '@ant-design/icons';
import { Outlet, useNavigate, useLocation } from 'react-router-dom';
import { useDispatch, useSelector } from 'react-redux';
import type { UnknownAction } from '@reduxjs/toolkit';
import { RootState } from '../../store';
import { logout } from '../../store/slices/authSlice';
import { useSafeBackground } from '../../hooks/useSafeBackground';
import './MainLayout.css';

const { Header, Sider, Content } = Layout;
const { Text } = Typography;

/**
 * 应用主布局组件
 * 包含侧边栏导航、顶部工具栏（搜索、消息通知、主题切换、用户登出）和内容区域
 */
const MainLayout: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const dispatch = useDispatch();

  const { overdueDebts } = useSelector((state: RootState) => state.debts.statistics);
  const { loading: globalLoading } = useSelector((state: RootState) => state.app);
  const { user } = useSelector((state: RootState) => state.auth);

  // 安全加载全局背景图片
  const pageBg = useSafeBackground('https://images.unsplash.com/photo-1579621970563-ebec7560ff3e?auto=format&fit=crop&w=1920&q=80');

  // 使用稳定的种子生成头像，并通过 SafeBackground 处理
  const avatarSeed = user?.id || user?.username || 'default';
  const avatarUrl = useSafeBackground(`https://api.dicebear.com/7.x/avataaars/svg?seed=${avatarSeed}`);

  const coreItems = [
    { key: '/', icon: <DashboardOutlined />, label: '仪表盘' },
    { key: '/income', icon: <RiseOutlined />, label: '收入管理' },
    { key: '/expense', icon: <FallOutlined />, label: '支出管理' },
    { key: '/debt', icon: <AccountBookOutlined />, label: '债务管理' },
  ];

  const toolItems = [
    { key: '/statistics', icon: <BarChartOutlined />, label: '数据统计' },
    { key: '/backup', icon: <DatabaseOutlined />, label: '备份恢复' },
  ];

  const settingItems = [
    { 
      key: 'settings', 
      icon: <SettingOutlined />, 
      label: '系统设置',
      children: [
        { key: '/profile', icon: <UserOutlined />, label: '个人资料' },
        { key: '/security', icon: <SecurityScanOutlined />, label: '密码安全' },
        { key: '/notifications', icon: <BellOutlined />, label: '通知设置' },
        { key: '/preferences', icon: <GlobalOutlined />, label: '偏好设置' },
      ]
    },
  ];

  const handleLogout = () => {
    dispatch(logout() as unknown as UnknownAction);
    navigate('/login');
  };

  const userMenuItems = [
    { key: 'logout', icon: <LogoutOutlined />, label: '退出登录', danger: true },
  ];

  const notificationItems = overdueDebts > 0 ? [
    { 
      key: 'overdue-debt', 
      label: (
        <div className="notification-item" onClick={() => navigate('/debt')}>
          <Text strong type="danger">逾期提醒</Text><br />
          <Text>您有 {overdueDebts} 笔债务已逾期或即将到期</Text>
        </div>
      ) 
    }
  ] : [
    { 
      key: 'no-notifications', 
      label: <div className="notification-item"><Text type="secondary">暂无新通知</Text></div> 
    }
  ];

  return (
    <Layout 
      className="main-layout"
      style={{ '--page-bg-image': pageBg ? `url(${pageBg})` : 'none' } as React.CSSProperties}
    >
      <Sider
        trigger={null}
        collapsible={false}
        collapsed={false}
        className="app-sider"
        width={260}
        theme="dark"
      >
        <div className="logo">
          <WalletOutlined className="logo-icon" />
          <span className="logo-text">财富管家</span>
        </div>
        
        <div className="menu-wrapper" style={{ overflowY: 'auto', overflowX: 'hidden', flex: 1 }}>
          <div className="menu-group-title">核心功能</div>
          <Menu
            theme="dark"
            mode="inline"
            selectedKeys={[location.pathname]}
            items={coreItems}
            onClick={({ key }) => navigate(key)}
            className="side-menu"
          />

          <div className="menu-group-title">数据与工具</div>
          <Menu
            theme="dark"
            mode="inline"
            selectedKeys={[location.pathname]}
            items={toolItems}
            onClick={({ key }) => navigate(key)}
            className="side-menu"
          />

          <div className="menu-group-title">系统配置</div>
          <Menu
            theme="dark"
            mode="inline"
            selectedKeys={[location.pathname]}
            items={settingItems}
            onClick={({ key }) => navigate(key)}
            className="side-menu"
          />
        </div>
      </Sider>

      <Layout className="site-layout">
        <Header className="app-header">
          <div className="header-right-actions">
            <Badge count={overdueDebts || 0} size="small" offset={[-2, 4]}>
              <BellOutlined className="header-action-icon" onClick={() => navigate('/notifications')} />
            </Badge>
            <SettingFilled className="header-action-icon" onClick={() => navigate('/preferences')} />
            
            <Dropdown
              menu={{
                items: userMenuItems,
                onClick: ({ key }) => {
                  if (key === 'logout') handleLogout();
                },
              }}
              placement="bottomRight"
              trigger={['click']}
            >
              <div className="user-avatar-wrapper">
                <Avatar 
                  src={avatarUrl} 
                  size={40}
                  icon={<UserOutlined />}
                />
              </div>
            </Dropdown>
          </div>
        </Header>

        <Content className="app-content">
          <Spin spinning={globalLoading} size="large" wrapperClassName="content-spin-wrapper" tip="加载中...">
            <div 
              className="page-content-wrapper" 
              key={location.pathname}
              style={{ willChange: 'transform, opacity' }}
            >
              <Outlet />
            </div>
          </Spin>
        </Content>
      </Layout>
    </Layout>
  );
};

export default MainLayout;
