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
import { RootState, AppDispatch } from '../../store';
import { logout } from '../../store/slices/authSlice';
import { fetchNotifications, markNotificationAsRead, markAllNotificationsAsRead } from '../../store/slices/notificationSlice';
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
  const dispatch = useDispatch<AppDispatch>();

  const { notifications, unreadCount } = useSelector((state: RootState) => state.notifications);
  const { loading: globalLoading } = useSelector((state: RootState) => state.app);
  const { user } = useSelector((state: RootState) => state.auth);

  useEffect(() => {
    dispatch(fetchNotifications({ limit: 5 }));
    
    // 每分钟轮询一次通知
    const timer = setInterval(() => {
      dispatch(fetchNotifications({ limit: 5 }));
    }, 60000);

    return () => clearInterval(timer);
  }, [dispatch]);

  // 安全加载全局背景图片
  const pageBg = useSafeBackground('https://picsum.photos/1920/1080');

  // 使用稳定的种子生成头像，并通过 SafeBackground 处理
  const avatarSeed = user?.id || user?.username || 'default';
  const avatarUrl = useSafeBackground(`https://api.dicebear.com/7.x/avataaars/svg?seed=${avatarSeed}`);

  const coreItems = [
    { key: '/', icon: <DashboardOutlined />, label: '仪表盘' },
    { key: '/income', icon: <RiseOutlined />, label: '收入管理' },
    { key: '/expense', icon: <FallOutlined />, label: '支出管理' },
    { key: '/debt', icon: <AccountBookOutlined />, label: '债务管理' },
    { key: '/budget', icon: <WalletOutlined />, label: '预算管理' },
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

  const handleNotificationClick = (notification: any) => {
    if (!notification.isRead) {
      dispatch(markNotificationAsRead(notification.id));
    }
    if (notification.link) {
      navigate(notification.link);
    }
  };

  const handleMarkAllRead = (e: React.MouseEvent) => {
    e.stopPropagation();
    dispatch(markAllNotificationsAsRead());
  };

  const notificationItems = notifications.length > 0 ? [
    {
      key: 'header',
      label: (
        <div className="notification-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 12px', borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
          <Text strong>系统通知</Text>
          <Button type="link" size="small" onClick={handleMarkAllRead}>全部已读</Button>
        </div>
      ),
      disabled: true,
    },
    ...notifications.map((n: any) => ({
      key: n.id,
      label: (
        <div 
          className={`notification-popover-item ${n.isRead ? 'read' : 'unread'}`} 
          onClick={() => handleNotificationClick(n)}
        >
          <div className="notification-item-header">
            <Text strong type={n.priority === 'high' ? 'danger' : 'default'}>{n.title}</Text>
            {!n.isRead && <Badge status="processing" size="small" />}
          </div>
          <div className="notification-item-content">
            <Text>{n.content}</Text>
          </div>
          <div className="notification-item-footer">
            <Text type="secondary" style={{ fontSize: '11px' }}>
              {new Date(n.createdAt).toLocaleString()}
            </Text>
          </div>
        </div>
      )
    })),
    {
      key: 'view-all',
      label: (
        <div style={{ textAlign: 'center', padding: '8px 0', borderTop: '1px solid rgba(255,255,255,0.1)' }}>
          <Text type="secondary" onClick={() => navigate('/notifications')} style={{ cursor: 'pointer' }}>
            查看更多设置
          </Text>
        </div>
      )
    }
  ] : [
    { 
      key: 'no-notifications', 
      label: <div className="notification-popover-item no-data"><Text type="secondary">暂无新通知</Text></div> 
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
            <Dropdown
              menu={{ items: notificationItems }}
              placement="bottomRight"
              trigger={['click']}
              overlayClassName="notification-dropdown"
            >
              <Badge count={unreadCount || 0} size="small" offset={[-2, 4]}>
                <BellOutlined className="header-action-icon" />
              </Badge>
            </Dropdown>
            
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
