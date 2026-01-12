import React, { useEffect, useState } from 'react';
import { Card, Switch, Divider, Typography, Button, App as AntdApp, Spin } from 'antd';
import { SaveOutlined } from '@ant-design/icons';
import { useDispatch, useSelector } from 'react-redux';
import { RootState, AppDispatch } from '@store/index';
import { fetchSettings, updateSettings } from '@store/slices/settingsSlice';
import './SettingsPage.css';

const { Title, Text } = Typography;

/**
 * 通知设置页面组件
 * 用户可以开启或关闭各种系统提醒和邮件通知
 */
const NotificationPage: React.FC = () => {
  const { message } = AntdApp.useApp();
  const dispatch = useDispatch<AppDispatch>();
  const settingsState = useSelector((state: RootState) => state.settings) || { settings: null, loading: false };
  const { settings, loading } = settingsState;
  const [localSettings, setLocalSettings] = useState<any>(null);

  useEffect(() => {
    if (!settings) {
      dispatch(fetchSettings());
    } else {
      setLocalSettings(settings.notificationSettings);
    }
  }, [dispatch, settings]);

  /**
   * 处理通知设置保存
   */
  const handleSave = async () => {
    try {
      await dispatch(updateSettings({ notificationSettings: localSettings })).unwrap();
      message.success('通知设置已保存');
    } catch (error: any) {
      message.error(typeof error === 'string' ? error : (error?.message || '保存失败'));
    }
  };

  const handleToggle = (key: string, checked: boolean) => {
    setLocalSettings((prev: any) => ({
      ...prev,
      [key]: checked,
    }));
  };

  if (loading && !localSettings) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', height: '300px', gap: '16px' }}>
        <Spin size="large" />
        <Text style={{ color: 'rgba(255, 255, 255, 0.65)' }}>正在加载设置...</Text>
      </div>
    );
  }

  return (
    <div className="settings-section">
      <div className="settings-header">
        <Title level={2} className="page-title">通知设置</Title>
        <Text style={{ color: 'rgba(255, 255, 255, 0.7)' }}>配置您希望接收的消息提醒类型和方式</Text>
      </div>

      <Card className="settings-main-card glass-card" variant="borderless">
        <div className="notification-content-inner">
          <div className="setting-item-group">
            <div className="setting-item">
              <div>
                <Text strong style={{ fontSize: '16px', color: 'white' }}>债务到期提醒</Text><br />
                <Text style={{ color: 'rgba(255, 255, 255, 0.65)' }}>在债务到期前收到系统通知和邮件提醒</Text>
              </div>
              <Switch 
                checked={localSettings?.debtReminder} 
                onChange={(checked) => handleToggle('debtReminder', checked)} 
              />
            </div>
            <Divider />
            <div className="setting-item">
              <div>
                <Text strong style={{ fontSize: '16px', color: 'white' }}>预算超支提醒</Text><br />
                <Text style={{ color: 'rgba(255, 255, 255, 0.65)' }}>当本月支出超出设定预算时及时通知</Text>
              </div>
              <Switch 
                checked={localSettings?.budgetAlert} 
                onChange={(checked) => handleToggle('budgetAlert', checked)} 
              />
            </div>
            <Divider />
            <div className="setting-item">
              <div>
                <Text strong style={{ fontSize: '16px', color: 'white' }}>每周财务报告</Text><br />
                <Text style={{ color: 'rgba(255, 255, 255, 0.65)' }}>每周一发送上周的财务收支汇总报告</Text>
              </div>
              <Switch 
                checked={localSettings?.weeklyReport} 
                onChange={(checked) => handleToggle('weeklyReport', checked)} 
              />
            </div>
            <Divider />
            <div className="setting-item">
              <div>
                <Text strong style={{ fontSize: '16px', color: 'white' }}>月度详细报表</Text><br />
                <Text style={{ color: 'rgba(255, 255, 255, 0.65)' }}>每月初发送上月的详细财务分析报表</Text>
              </div>
              <Switch 
                checked={localSettings?.monthlyReport} 
                onChange={(checked) => handleToggle('monthlyReport', checked)} 
              />
            </div>
          </div>
          
          <div className="save-btn-container">
            <Button 
              type="primary" 
              icon={<SaveOutlined />} 
              size="large" 
              onClick={handleSave}
              loading={loading}
              block
              className="save-btn"
            >
              保存设置
            </Button>
          </div>
        </div>
      </Card>
    </div>
  );
};

export default NotificationPage;
