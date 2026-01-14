import React, { Suspense, lazy } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { useSelector } from 'react-redux';
import { RootState } from '@store/index';
import { Spin } from 'antd';
import MainLayout from '@components/layout/MainLayout';
import { offlineSyncService } from './services/offlineSyncService';

// 核心页面保持直接导入，或者也可以懒加载
import LoginPage from '@pages/LoginPage';
import RegisterPage from '@pages/RegisterPage';
const DashboardPage = lazy(() => import('@pages/dashboard/DashboardPage'));

// 优化点：对统计页、备份页等启用懒加载
const IncomePage = lazy(() => import('@pages/income/IncomePage'));
const ExpensePage = lazy(() => import('@pages/expense/ExpensePage'));
const DebtPage = lazy(() => import('@pages/debt/DebtPage'));
const BudgetPage = lazy(() => import('@pages/budget/BudgetPage'));
const StatisticsPage = lazy(() => import('@pages/statistics/StatisticsPage'));
const ProfilePage = lazy(() => import('@pages/settings/ProfilePage'));
const SecurityPage = lazy(() => import('@pages/settings/SecurityPage'));
const NotificationPage = lazy(() => import('@pages/settings/NotificationPage'));
const PreferencePage = lazy(() => import('@pages/settings/PreferencePage'));
const CategoryPage = lazy(() => import('@pages/settings/CategoryPage'));
const BackupPage = lazy(() => import('@pages/backup/BackupPage'));
const LedgerPage = lazy(() => import('@pages/ledger/LedgerPage'));
const DesignSystemPage = lazy(() => import('@pages/DesignSystem'));

/**
 * 私有路由组件
 */
const PrivateRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { isAuthenticated } = useSelector((state: RootState) => state.auth);
  
  // 认证状态变更时初始化离线同步服务
  React.useEffect(() => {
    if (isAuthenticated) {
      console.log('[App] 用户已认证，初始化离线同步服务');
      offlineSyncService.init().catch(err => console.error('[App] 初始化同步服务失败:', err));
    }
  }, [isAuthenticated]);

  return isAuthenticated ? <>{children}</> : <Navigate to="/login" replace />;
};

/**
 * 全局加载指示器
 */
const PageLoading: React.FC = () => (
  <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', height: '100vh', gap: '16px', background: '#0f172a' }}>
    <Spin size="large" />
    <span style={{ color: 'rgba(255, 255, 255, 0.7)', fontWeight: 500 }}>魔法加载中...</span>
  </div>
);

const App: React.FC = () => {
  const { isAuthenticated } = useSelector((state: RootState) => state.auth);

  return (
    <Suspense fallback={<PageLoading />}>
      <Routes>
        <Route
          path="/login"
          element={!isAuthenticated ? <LoginPage /> : <Navigate to="/" replace />}
        />
        <Route
          path="/register"
          element={!isAuthenticated ? <RegisterPage /> : <Navigate to="/" replace />}
        />
        <Route
          path="/"
          element={
            <PrivateRoute>
              <MainLayout />
            </PrivateRoute>
          }
        >
          <Route index element={<DashboardPage />} />
          <Route path="income" element={<IncomePage />} />
          <Route path="expense" element={<ExpensePage />} />
          <Route path="debt" element={<DebtPage />} />
          <Route path="budget" element={<BudgetPage />} />
          <Route path="statistics" element={<StatisticsPage />} />
          <Route path="profile" element={<ProfilePage />} />
          <Route path="security" element={<SecurityPage />} />
          <Route path="notifications" element={<NotificationPage />} />
          <Route path="preferences" element={<PreferencePage />} />
          <Route path="categories" element={<CategoryPage />} />
          <Route path="backup" element={<BackupPage />} />
          <Route path="ledgers" element={<LedgerPage />} />
          <Route path="design-system" element={<DesignSystemPage />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Suspense>
  );
};

export default App;
