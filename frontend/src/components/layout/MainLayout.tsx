import React, { useState } from 'react';
import { Layout, Menu, Avatar, Dropdown, Badge, Button, Space, Typography, theme, Spin } from 'antd';
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
  MenuFoldOutlined,
  MenuUnfoldOutlined,
  MoonOutlined,
  SunOutlined,
} from '@ant-design/icons';
import { Outlet, useNavigate, useLocation } from 'react-router-dom';
import { useDispatch, useSelector } from 'react-redux';
import { RootState } from '../../store';
import { logout } from '../../store/slices/authSlice';
import { toggleDarkMode } from '../../store/slices/appSlice';
import './MainLayout.css';

const { Header, Sider, Content } = Layout;
const { Text } = Typography;

/**
 * 应用主布局组件
 * 包含侧边栏导航、顶部工具栏（消息通知、主题切换、用户登出）和内容区域
 */
const MainLayout: React.FC = () => {
  const [collapsed, setCollapsed] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  const dispatch = useDispatch();
  const { overdueDebts } = useSelector((state: RootState) => state.debts.statistics);
  const { loading: globalLoading, darkMode } = useSelector((state: RootState) => state.app);
  const {
    token: { colorBgContainer },
  } = theme.useToken();


  const menuItems = [
    { key: '/', icon: <DashboardOutlined />, label: '仪表盘' },
    { key: '/income', icon: <RiseOutlined />, label: '收入管理' },
    { key: '/expense', icon: <FallOutlined />, label: '支出管理' },
    { key: '/debt', icon: <AccountBookOutlined />, label: '债务管理' },
    { key: '/statistics', icon: <BarChartOutlined />, label: '数据统计' },
    { key: '/backup', icon: <DatabaseOutlined />, label: '备份恢复' },
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
    dispatch(logout());
    navigate('/login');
  };

  /**
   * 用户下拉菜单项
   * 仅保留退出登录功能，个人资料和安全设置已移至侧边栏系统设置
   */
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
    <Layout className={`main-layout ${darkMode ? 'dark-mode' : ''}`}>
      <Sider
        trigger={null}
        collapsible
        collapsed={collapsed}
        className="app-sider"
        width={260}
        theme={darkMode ? 'dark' : 'light'}
      >
        <div className="logo">
          <div className="logo-content">
            <span className="logo-icon" role="img" aria-label="logo">💰</span>
            {!collapsed && <span className="logo-text">智慧财务</span>}
          </div>
        </div>
        
        <div className="menu-wrapper">
          <Menu
            theme={darkMode ? 'dark' : 'light'}
            mode="inline"
            selectedKeys={[location.pathname]}
            defaultOpenKeys={['settings']}
            items={menuItems}
            onClick={({ key }) => navigate(key)}
            className="side-menu"
          />
        </div>

        {!collapsed && (
          <div className="sider-footer">
            <div className="user-profile-card">
              <Avatar size={40} icon={<UserOutlined />} className="user-avatar" />
              <div className="user-info">
                <Text strong className="user-name">管理员</Text>
                <Text type="secondary" className="user-role">个人账户</Text>
              </div>
            </div>
          </div>
        )}
      </Sider>

      <Layout className="site-layout">
        <Header className="app-header">
          <div className="header-left">
            <Button
              type="text"
              icon={collapsed ? <MenuUnfoldOutlined /> : <MenuFoldOutlined />}
              onClick={() => setCollapsed(!collapsed)}
              className="collapse-button"
            />
            <div className="page-breadcrumb">
              <Text type="secondary">首页</Text>
              <Text className="breadcrumb-separator">/</Text>
              <Text strong>
                {menuItems.find(item => item.key === location.pathname)?.label || 
                 menuItems.find(item => item.children?.some(child => child.key === location.pathname))?.label || 
                 '仪表盘'}
              </Text>
            </div>
          </div>

          <div className="header-right">
            <Space size="middle">
              <Button
                type="text"
                icon={darkMode ? <SunOutlined /> : <MoonOutlined />}
                onClick={() => dispatch(toggleDarkMode())}
                className="action-btn"
              />

              <Dropdown
                menu={{ items: notificationItems }}
                placement="bottomRight"
                trigger={['click']}
              >
                <Badge count={overdueDebts || 0} size="small" offset={[-2, 4]}>
                  <Button type="text" icon={<BellOutlined />} className="action-btn" />
                </Badge>
              </Dropdown>

              <Dropdown
                menu={{
                  items: userMenuItems,
                  onClick: ({ key }) => {
                    if (key === 'logout') handleLogout();
                    else navigate(key);
                  },
                }}
                placement="bottomRight"
                trigger={['click']}
              >
                <Space className="user-dropdown-trigger">
                  <Avatar icon={<UserOutlined />} style={{ backgroundColor: '#1890ff' }} />
                  {!collapsed && <Text strong className="user-display-name">管理员</Text>}
                </Space>
              </Dropdown>
            </Space>
          </div>
        </Header>

        <Content className="app-content">
          <Spin spinning={globalLoading} size="large" wrapperClassName="content-spin-wrapper" tip="加载中...">
            <div className="page-content-wrapper">
              <Outlet />
            </div>
          </Spin>
        </Content>
      </Layout>
    </Layout>
  );
};

export default MainLayout;
