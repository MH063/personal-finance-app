import React, { useState, useEffect, useMemo } from 'react';
import { Layout, Menu, Avatar, Dropdown, Badge, Button, Typography, Spin, Tooltip, Modal, List, Tag } from 'antd';
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
  WalletOutlined,
  BookOutlined,
  TagsOutlined,
  CloudSyncOutlined,
  SyncOutlined,
} from '@ant-design/icons';
import { Outlet, useNavigate, useLocation } from 'react-router-dom';
import { useDispatch, useSelector } from 'react-redux';
import type { UnknownAction } from '@reduxjs/toolkit';
import { RootState, AppDispatch } from '../../store';
import { logout } from '../../store/slices/authSlice';
import { fetchNotifications, markNotificationAsRead, markAllNotificationsAsRead } from '../../store/slices/notificationSlice';
import { fetchSettings } from '../../store/slices/settingsSlice';
import { fetchDebts } from '../../store/slices/debtSlice';
import { useSafeBackground } from '../../hooks/useSafeBackground';
import { collaborativeService } from '../../services/collaborativeService';
import { cancelPendingRequests, silenceAuthErrors } from '../../services/api';
import WindowControls from './WindowControls';
import SyncMonitor from './SyncMonitor';
import './MainLayout.css';

const { Header, Sider, Content } = Layout;
const { Text } = Typography;

/**
 * 应用主布局组件
 * 包含侧边栏导航、顶部工具栏（搜索、消息通知、主题切换、用户登出）和内容区域
 */
const MainLayout = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const dispatch = useDispatch<AppDispatch>();

  const { notifications, unreadCount } = useSelector((state: RootState) => state.notifications);
  const { loading: globalLoading } = useSelector((state: RootState) => state.app);
  const { user } = useSelector((state: RootState) => state.auth);
  const settings = useSelector((state: RootState) => state.settings.settings);
  const debts = useSelector((state: RootState) => state.debts.debts);

  const [syncStatus, setSyncStatus] = useState<'connected' | 'disconnected' | 'syncing'>('disconnected');
  const [syncMonitorVisible, setSyncMonitorVisible] = useState(false);

  useEffect(() => {
    // 初始化实时协作
    const token = localStorage.getItem('accessToken');
    if (token) {
      collaborativeService.init(token);
    }

    const handleConnect = () => {
      console.log('[MainLayout] Sync Connected');
      setSyncStatus('connected');
    };
    const handleDisconnect = () => {
      console.warn('[MainLayout] Sync Disconnected');
      setSyncStatus('disconnected');
    };
    const handleUpdate = () => {
      setSyncStatus('syncing');
      setTimeout(() => setSyncStatus('connected'), 1000);
    };

    collaborativeService.on('connect', handleConnect);
    collaborativeService.on('disconnect', handleDisconnect);
    collaborativeService.on('ledgerUpdate', handleUpdate);
    collaborativeService.on('globalUpdate', handleUpdate);
    collaborativeService.on('settingsUpdate', handleUpdate);

    // 初始化时检查状态
    // @ts-expect-error - 访问私有 socket 仅用于状态展示
    if (collaborativeService.socket?.connected) {
      setSyncStatus('connected');
    }

    return () => {
      collaborativeService.off('connect', handleConnect);
      collaborativeService.off('disconnect', handleDisconnect);
      collaborativeService.off('ledgerUpdate', handleUpdate);
      collaborativeService.off('globalUpdate', handleUpdate);
      collaborativeService.off('settingsUpdate', handleUpdate);
    };
  }, []);

  useEffect(() => {
    dispatch(fetchNotifications({ limit: 5 }));
    
    // 每分钟轮询一次通知
    const timer = setInterval(() => {
      dispatch(fetchNotifications({ limit: 5 }));
    }, 60000);

    return () => clearInterval(timer);
  }, [dispatch]);

  // 管理背景图片状态
  const [customBg, setCustomBg] = useState<string | null>(null);
  const [isBgConfigLoaded, setIsBgConfigLoaded] = useState(false);

  const toLocalResourceUrl = (filePath: string, version: string) => {
    const raw = String(filePath || '').trim();
    if (!raw) return null;
    const posixPath = raw.replace(/\\/g, '/');
    if (/^[a-zA-Z](:)?\/?$/.test(posixPath)) {
      console.warn('[MainLayout] Invalid background path:', raw);
      return null;
    }
    if (/^[a-zA-Z]:\//.test(posixPath)) {
      const drive = posixPath[0].toLowerCase();
      const rest = posixPath.slice(2);
      const encodedRest = rest.split('/').map((seg) => encodeURIComponent(seg)).join('/');
      const url = `local-resource://${drive}${encodedRest}?v=${encodeURIComponent(version)}`;
      console.log('[MainLayout] Background URL:', url);
      return url;
    }

    const encodedPath = posixPath.split('/').map((seg) => encodeURIComponent(seg)).join('/');
    const url = `local-resource:///${encodedPath}?v=${encodeURIComponent(version)}`;
    console.log('[MainLayout] Background URL:', url);
    return url;
  };

  useEffect(() => {
    const loadBackgroundConfig = async () => {
      if (window.electronAPI?.getBackgroundConfig) {
        try {
          const config = await window.electronAPI.getBackgroundConfig();
          if (config?.currentBackground) {
            // 使用自定义协议加载本地文件
            const version = config.lastUpdated || Date.now().toString();
            setCustomBg(toLocalResourceUrl(config.currentBackground, version));
          }
        } catch (error) {
          console.error('[MainLayout] Failed to load background config:', error);
        } finally {
          setIsBgConfigLoaded(true);
        }
      } else {
        setIsBgConfigLoaded(true);
      }
    };
    loadBackgroundConfig();
  }, []);

  useEffect(() => {
    const handleBackgroundUpdated = async () => {
      if (!window.electronAPI?.getBackgroundConfig) return;
      try {
        const config = await window.electronAPI.getBackgroundConfig();
        console.log('[MainLayout] Background config updated:', config);
        if (config?.currentBackground) {
          const version = config.lastUpdated || Date.now().toString();
          setCustomBg(toLocalResourceUrl(config.currentBackground, version));
        } else {
          setCustomBg(null);
        }
      } catch (error) {
        console.error('[MainLayout] Failed to reload background config:', error);
      }
    };
    window.addEventListener('app:background-updated', handleBackgroundUpdated);
    return () => window.removeEventListener('app:background-updated', handleBackgroundUpdated);
  }, []);

  const repaymentReminder = useMemo(() => {
    const notifSettings = settings?.notificationSettings;
    const reminderEnabled = notifSettings?.debtReminder ?? true;
    const advanceDays = Number(notifSettings?.reminderAdvanceDays ?? 3);
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    if (!reminderEnabled) return { items: [] as any[], advanceDays };
    if (!Array.isArray(debts) || debts.length === 0) return { items: [] as any[], advanceDays };

    const isWeekend = (d: Date) => d.getDay() === 0 || d.getDay() === 6;

    const buildMonthDate = (year: number, month: number, repaymentDay: number, adjustment?: string) => {
      const lastDay = new Date(year, month + 1, 0).getDate();
      const targetDay = Math.min(Number(repaymentDay), lastDay);
      const target = new Date(year, month, targetDay);
      target.setHours(0, 0, 0, 0);

      if (adjustment === 'workday') {
        while (isWeekend(target)) {
          target.setDate(target.getDate() + 1);
          target.setHours(0, 0, 0, 0);
        }
      }

      return target;
    };

    const items = debts
      .filter((d: any) => d && d.repaymentDay && d.status !== 'paid' && d.isReminderEnabled !== false)
      .map((d: any) => {
        const year = today.getFullYear();
        const month = today.getMonth();

        const thisMonthDate = buildMonthDate(year, month, d.repaymentDay, d.repaymentDayAdjustment);
        const nextMonthDate = buildMonthDate(year, month + 1, d.repaymentDay, d.repaymentDayAdjustment);

        const reminderStart = new Date(thisMonthDate);
        reminderStart.setDate(thisMonthDate.getDate() - advanceDays);
        reminderStart.setHours(0, 0, 0, 0);

        const inWindow =
          today.getTime() >= reminderStart.getTime() && today.getTime() <= thisMonthDate.getTime();

        const overdue =
          today.getTime() > thisMonthDate.getTime() && today.getTime() < nextMonthDate.getTime();

        return {
          debt: d,
          repaymentDate: thisMonthDate,
          inWindow,
          overdue,
          advanceDays,
        };
      })
      .filter((x: any) => x.inWindow || x.overdue)
      .sort((a: any, b: any) => a.repaymentDate.getTime() - b.repaymentDate.getTime());

    return { items, advanceDays };
  }, [debts, settings]);

  useEffect(() => {
    if (!user?.id) return;
    if (!settings) dispatch(fetchSettings() as unknown as UnknownAction);
    if (!Array.isArray(debts) || debts.length === 0) dispatch(fetchDebts({ debtType: '', status: '' }) as unknown as UnknownAction);
  }, [debts, dispatch, settings, user?.id]);

  useEffect(() => {
    if (!user?.id) return;
    if (!repaymentReminder.items.length) return;

    const todayKey = new Date().toISOString().slice(0, 10);
    const storageKey = `debtRepaymentPopupShown:${todayKey}`;
    if (localStorage.getItem(storageKey)) return;

    localStorage.setItem(storageKey, '1');

    Modal.info({
      title: '还款提醒',
      width: 520,
      centered: true,
      okText: '知道了',
      content: (
        <div style={{ marginTop: 12 }}>
          <div style={{ marginBottom: 10, color: 'rgba(255,255,255,0.85)' }}>
            提前提醒天数：{repaymentReminder.advanceDays}天
          </div>
          <List
            dataSource={repaymentReminder.items}
            renderItem={(item: any) => {
              const dateText = new Date(item.repaymentDate).toLocaleDateString();
              const amountText = `¥${Number(item.debt?.remainingAmount || 0).toFixed(2)}`;
              return (
                <List.Item
                  style={{ paddingLeft: 0, paddingRight: 0 }}
                  actions={[
                    <Button
                      key="go"
                      type="primary"
                      size="small"
                      onClick={() => {
                        Modal.destroyAll();
                        navigate('/debt', { state: { payDebtId: item.debt.id } });
                      }}
                    >
                      去确认
                    </Button>,
                  ]}
                >
                  <List.Item.Meta
                    title={
                      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                        <span style={{ fontWeight: 600 }}>{item.debt?.debtorName}</span>
                        {item.overdue ? <Tag color="error">已逾期</Tag> : <Tag color="warning">即将到期</Tag>}
                      </div>
                    }
                    description={
                      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                        <span>还款日：{dateText}</span>
                        <span>待还：{amountText}</span>
                      </div>
                    }
                  />
                </List.Item>
              );
            }}
          />
        </div>
      ),
    });
  }, [navigate, repaymentReminder.advanceDays, repaymentReminder.items, user?.id]);

  // 安全加载全局背景图片
  // 只有在配置加载完成后才决定使用哪个背景，避免闪烁
  const bgSource = isBgConfigLoaded ? (customBg || 'https://picsum.photos/1920/1080') : null;
  const pageBg = useSafeBackground(bgSource);

  // 使用稳定的种子生成头像，并通过 SafeBackground 处理
  const avatarSeed = user?.id || user?.username || 'default';
  const avatarUrl = useSafeBackground(`https://api.dicebear.com/7.x/avataaars/svg?seed=${avatarSeed}`);

  const coreItems = [
    { key: '/', icon: <DashboardOutlined />, label: '仪表盘' },
    { key: '/income', icon: <RiseOutlined />, label: '收入管理' },
    { key: '/expense', icon: <FallOutlined />, label: '支出管理' },
    { key: '/debt', icon: <AccountBookOutlined />, label: '债务管理' },
    { key: '/budget', icon: <WalletOutlined />, label: '预算管理' },
    { key: '/ledgers', icon: <BookOutlined />, label: '账本管理' },
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
        { key: '/categories', icon: <TagsOutlined />, label: '分类管理' },
        { key: '/preferences', icon: <GlobalOutlined />, label: '偏好设置' },
      ]
    },
  ];

  const handleLogout = () => {
    silenceAuthErrors(2000);
    cancelPendingRequests('User logout');
    collaborativeService.disconnect();
    navigate('/login', { replace: true });
    dispatch(logout() as unknown as UnknownAction);
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
            <Text strong type={n.priority === 'high' ? 'danger' : undefined}>{n.title}</Text>
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
      style={{ '--page-bg-image': pageBg ? `url("${pageBg}")` : 'none' } as React.CSSProperties}
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
        
        <div className="menu-wrapper" style={{ flex: 1 }}>
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

        <div className="sider-footer">
          <div className="sider-actions">
            <Dropdown
              menu={{
                items: userMenuItems,
                onClick: ({ key }) => {
                  if (key === 'logout') handleLogout();
                },
              }}
              placement="topRight"
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

            <Tooltip title={syncStatus === 'connected' ? '数据同步已连接' : syncStatus === 'syncing' ? '正在同步数据...' : '同步已断开'}>
              <div className="header-action-icon-wrapper" onClick={() => setSyncMonitorVisible(true)}>
                <Badge dot color={syncStatus === 'connected' ? '#52c41a' : syncStatus === 'syncing' ? '#1890ff' : '#f5222d'}>
                  {syncStatus === 'syncing' ? (
                    <SyncOutlined spin className="header-action-icon" />
                  ) : (
                    <CloudSyncOutlined 
                      className={`header-action-icon ${syncStatus === 'connected' ? 'sync-connected' : 'sync-disconnected'}`} 
                    />
                  )}
                </Badge>
              </div>
            </Tooltip>

            <Dropdown
              menu={{ items: notificationItems }}
              placement="topRight"
              trigger={['click']}
              overlayClassName="notification-dropdown"
            >
              <Badge count={unreadCount || 0} size="small" offset={[-2, 4]}>
                <BellOutlined className="header-action-icon" />
              </Badge>
            </Dropdown>
          </div>
        </div>
      </Sider>

      <Layout className="site-layout">
        <Header className="main-header" style={{ background: 'transparent' }}>
          <div className="header-left">
            {/* 顶部左侧区域，可保留为空以维持拖拽区 */}
          </div>
          <WindowControls backgroundColor={pageBg || undefined} />
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

      <SyncMonitor 
        visible={syncMonitorVisible} 
        onClose={() => setSyncMonitorVisible(false)} 
      />
    </Layout>
  );
};

export default MainLayout;
