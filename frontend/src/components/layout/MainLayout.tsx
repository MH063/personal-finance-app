import React, { useState, useEffect, useMemo } from 'react';
import { Layout, Menu, Avatar, Dropdown, Badge, Button, Typography, Spin, Tooltip, Modal, Tag, message, notification, Form, Input, Alert } from 'antd';
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
  UserDeleteOutlined,
  ExclamationCircleOutlined,
} from '@ant-design/icons';
import { Outlet, useNavigate, useLocation } from 'react-router-dom';
import { useDispatch, useSelector } from 'react-redux';
import type { UnknownAction } from '@reduxjs/toolkit';
import { RootState, AppDispatch } from '../../store';
import { logout, beginLogout } from '../../store/slices/authSlice';
import { fetchNotifications, markNotificationAsRead, markAllNotificationsAsRead } from '../../store/slices/notificationSlice';
import { fetchSettings } from '../../store/slices/settingsSlice';
import { fetchDebts } from '../../store/slices/debtSlice';
import { useSafeBackground } from '../../hooks/useSafeBackground';
import { collaborativeService } from '../../services/collaborativeService';
import { cancelPendingRequests, silenceAuthErrors } from '../../services/api';
import { offlineSyncService, SyncListener } from '../../services/offlineSyncService';
import { resetLoading } from '../../store/slices/appSlice';
import { authService } from '../../services/authService';
import WindowControls from './WindowControls';
import SyncMonitor from './SyncMonitor';
import AiAssistant from '../common/AiAssistant';
import './MainLayout.css';

const { Header, Sider, Content } = Layout;
const { Text } = Typography;

interface DeleteAccountModalProps {
  visible: boolean;
  onCancel: () => void;
  onConfirm: (password: string) => Promise<void>;
}

const DeleteAccountModal: React.FC<DeleteAccountModalProps> = ({ visible, onCancel, onConfirm }) => {
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (visible) {
      form.resetFields();
      setError(null);
    }
  }, [visible, form]);

  const handleSubmit = async () => {
    try {
      const values = await form.validateFields();
      setLoading(true);
      setError(null);
      await onConfirm(values.password);
      // Success is handled by parent (closing modal etc)
    } catch (err: any) {
      if (err.errorFields) {
        // Form validation error, ignore
        return;
      }
      console.error('Delete account error:', err);
      setError(err.message || '注销失败，请检查密码是否正确');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal
      title={
        <span style={{ color: '#ff4d4f', display: 'flex', alignItems: 'center' }}>
          <ExclamationCircleOutlined style={{ marginRight: 8 }} />
          注销账号
        </span>
      }
      open={visible}
      onCancel={!loading ? onCancel : undefined}
      onOk={handleSubmit}
      okText="确认注销"
      cancelText="取消"
      okButtonProps={{ danger: true, loading }}
      maskClosable={!loading}
      closable={!loading}
      destroyOnHidden
    >
      <Alert
        message="危险操作警告"
        description="注销账号是不可恢复的操作。您的所有数据（包括交易记录、预算、债务、分类设置等）将被永久删除，且无法找回。请谨慎操作。"
        type="error"
        showIcon
        style={{ marginBottom: 24 }}
      />
      
      <Form form={form} layout="vertical">
        <Form.Item
          name="password"
          label="请输入当前密码以确认身份"
          rules={[{ required: true, message: '请输入密码' }]}
        >
          <Input.Password 
            prefix={<SecurityScanOutlined />} 
            placeholder="请输入您的密码" 
            autoComplete="current-password"
          />
        </Form.Item>
      </Form>

      {error && (
        <Alert
          message={error}
          type="error"
          showIcon
          style={{ marginTop: 16 }}
        />
      )}
    </Modal>
  );
};

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
  const { user, isAuthenticated } = useSelector((state: RootState) => state.auth);
  const settings = useSelector((state: RootState) => state.settings.settings);
  const debts = useSelector((state: RootState) => state.debts.debts);

  const [syncStatus, setSyncStatus] = useState<'connected' | 'disconnected' | 'syncing'>('disconnected');
  const [syncMonitorVisible, setSyncMonitorVisible] = useState(false);
  const [deleteAccountModalVisible, setDeleteAccountModalVisible] = useState(false);

  /**
   * 路由切换清理操作
   * 关闭所有未关闭的 Modal 并重置全局加载状态，避免遮罩层或 Spin 残留导致页面交互“锁定”
   */
  const routeCleanup = React.useCallback(() => {
    try {
      console.log('[MainLayout] 路由切换清理：关闭弹窗/消息/通知并重置加载状态', window.location.pathname);
      Modal.destroyAll();
      try {
        message.destroy();
        notification.destroy();
      } catch (e) {
        console.warn('[MainLayout] 清理消息/通知失败', e);
      }
      dispatch(resetLoading());
    } catch (e) {
      console.warn('[MainLayout] 路由切换清理异常', e);
    }
  }, [dispatch]);

  useEffect(() => {
    routeCleanup();
    // 取消上一页面的未完成请求，避免残留 loading
    try {
      cancelPendingRequests('Route change');
    } catch (e) {
      console.warn('[MainLayout] 取消未完成请求异常', e);
    }
  }, [location.pathname, location.search, location.hash, routeCleanup]);

  useEffect(() => {
    // 初始化实时协作
    const token = localStorage.getItem('accessToken');
    if (token) {
      collaborativeService.init(token);
    }

    const handleConnect = () => {
      console.log('[MainLayout] Sync Connected');
      if (!offlineSyncService.isSyncing) {
        setSyncStatus('connected');
      }
    };
    const handleDisconnect = () => {
      console.warn('[MainLayout] Sync Disconnected');
      setSyncStatus('disconnected');
    };
    
    // 监听离线同步服务的状态变化
    const handleSyncEvent: SyncListener = (event) => {
      if (event === 'start') {
        setSyncStatus('syncing');
      } else if (event === 'complete' || event === 'error') {
        // 同步结束，根据 socket 连接状态恢复
        // @ts-expect-error - 访问私有 socket 仅用于状态展示
        const isConnected = collaborativeService.socket?.connected;
        setSyncStatus(isConnected ? 'connected' : 'disconnected');
      }
    };

    // 仅记录日志，状态由 offlineSyncService 驱动
    const handleUpdate = (data: any) => {
      console.log('[MainLayout] Received data update notification', data);
      if (data?.type === 'NEW_NOTIFICATION') {
        dispatch(fetchNotifications({ limit: 5 }));
        
        // 显示桌面通知（如果支持）
        if (data?.data?.title && data?.data?.content && window.electronAPI?.showNotification) {
           window.electronAPI.showNotification(data.data.title, data.data.content);
        }
      }
    };

    collaborativeService.on('connect', handleConnect);
    collaborativeService.on('disconnect', handleDisconnect);
    collaborativeService.on('ledgerUpdate', handleUpdate);
    collaborativeService.on('globalUpdate', handleUpdate);
    collaborativeService.on('settingsUpdate', handleUpdate);
    
    offlineSyncService.on(handleSyncEvent);

    // 初始化时检查状态
    // @ts-expect-error - 访问私有 socket 仅用于状态展示
    if (collaborativeService.socket?.connected) {
      setSyncStatus('connected');
    }
    
    // 如果正在同步，优先显示同步状态
    if (offlineSyncService.isSyncing) {
      setSyncStatus('syncing');
    }

    return () => {
      collaborativeService.off('connect', handleConnect);
      collaborativeService.off('disconnect', handleDisconnect);
      collaborativeService.off('ledgerUpdate', handleUpdate);
      collaborativeService.off('globalUpdate', handleUpdate);
      collaborativeService.off('settingsUpdate', handleUpdate);
      offlineSyncService.off(handleSyncEvent);
    };
  }, [dispatch]);

  useEffect(() => {
    if (!isAuthenticated || !user?.id) return;
    dispatch(fetchNotifications({ limit: 5 }));
    
    const timer = setInterval(() => {
      dispatch(fetchNotifications({ limit: 5 }));
    }, 60000);

    return () => clearInterval(timer);
  }, [dispatch, isAuthenticated, user?.id]);

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

  const initializedRef = React.useRef(false);

  useEffect(() => {
    if (!user?.id) {
      initializedRef.current = false;
      return;
    }

    if (initializedRef.current) return;
    initializedRef.current = true;

    if (!settings) dispatch(fetchSettings() as unknown as UnknownAction);
    // 仅初始化时加载一次，移除对 debts 的依赖以防止死循环
    if (!Array.isArray(debts) || debts.length === 0) {
      dispatch(fetchDebts({ debtType: '', status: '' }) as unknown as UnknownAction);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dispatch, user?.id]); // 移除 debts 和 settings 依赖，避免死循环

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
          <div>
            {repaymentReminder.items.map((item: any) => {
              const dateText = new Date(item.repaymentDate).toLocaleDateString();
              const amountText = `¥${Number(item.debt?.remainingAmount || 0).toFixed(2)}`;
              return (
                <div key={item.debt?.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                      <span style={{ fontWeight: 600 }}>{item.debt?.debtorName}</span>
                      {item.overdue ? <Tag color="error">已逾期</Tag> : <Tag color="warning">即将到期</Tag>}
                    </div>
                    <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginTop: 4 }}>
                      <span>还款日：{dateText}</span>
                      <span>待还：{amountText}</span>
                    </div>
                  </div>
                  <div>
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
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
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
    { key: '/transactions', icon: <AccountBookOutlined />, label: '交易管理' },
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
    silenceAuthErrors(5000);
    cancelPendingRequests('User logout');
    collaborativeService.disconnect();
    // 关闭离线同步（确保即使有事件也不触发）
    try {
      offlineSyncService.shutdown?.();
    } catch (e) {
      console.warn('[MainLayout] 关闭离线同步失败', e);
    }
    navigate('/login', { replace: true });
    // 先向后端发起登出请求（携带有效令牌），完成后再同步清理本地状态
    // 获取当前 token 并在清理前传递给 logout thunk，确保请求头能携带 Authorization
    const token = localStorage.getItem('accessToken');
    dispatch(logout(token) as unknown as UnknownAction);
    dispatch(beginLogout() as unknown as UnknownAction);
  };

  const handleDeleteAccount = async (password: string) => {
    await authService.deleteAccount(password);
    message.success('账户已成功注销');
    setDeleteAccountModalVisible(false);
    setTimeout(() => {
      handleLogout();
    }, 300);
  };

  const userMenuItems = [
    { key: 'logout', icon: <LogoutOutlined />, label: '退出登录', danger: true },
    { key: 'delete-account', icon: <UserDeleteOutlined />, label: '注销账号', danger: true },
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
                  if (key === 'delete-account') setDeleteAccountModalVisible(true);
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
              classNames={{ root: 'notification-dropdown' }}
            >
              <Badge count={unreadCount || 0} size="small" offset={[-2, 4]}>
                <BellOutlined className="header-action-icon" />
              </Badge>
            </Dropdown>
          </div>
        </div>
      </Sider>

      <Layout className="site-layout">
        <Header className="app-header" style={{ background: 'transparent' }}>
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
      <DeleteAccountModal
        visible={deleteAccountModalVisible}
        onCancel={() => setDeleteAccountModalVisible(false)}
        onConfirm={handleDeleteAccount}
      />
      <AiAssistant />
    </Layout>
  );
};

export default MainLayout;
