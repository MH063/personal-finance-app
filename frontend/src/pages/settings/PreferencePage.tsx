import React, { useEffect } from 'react';
import { Card, Form, Select, Button, Typography, App, Spin } from 'antd';
import { MoonOutlined, SaveOutlined } from '@ant-design/icons';
import { useDispatch, useSelector } from 'react-redux';
import { RootState, AppDispatch } from '@store/index';
import { fetchSettings, updateSettings } from '@store/slices/settingsSlice';
import './SettingsPage.css';

const { Title, Text } = Typography;
const { Option } = Select;

/**
 * 偏好设置页面组件
 * 用户可以配置应用的语言、货币、日期格式和主题模式等个性化选项
 */
const PreferencePage: React.FC = () => {
  const { message } = App.useApp();
  const dispatch = useDispatch<AppDispatch>();
  const settingsState = useSelector((state: RootState) => state.settings) || { settings: null, loading: false };
  const { settings, loading } = settingsState;
  const [form] = Form.useForm();

  useEffect(() => {
    if (!settings) {
      dispatch(fetchSettings());
    } else {
      form.setFieldsValue({
        currency: settings.currency,
        dateFormat: settings.dateFormat,
        firstDayOfWeek: settings.firstDayOfWeek,
        theme: settings.theme,
      });
    }
  }, [dispatch, settings, form]);

  /**
   * 处理偏好设置保存
   * @param values 表单提交的偏好配置
   */
  const handleSave = async (values: any) => {
    try {
      await dispatch(updateSettings(values)).unwrap();
      message.success('偏好设置已更新');
    } catch (error: any) {
      message.error(error || '保存失败');
    }
  };

  if (loading && !settings) {
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
        <Title level={2} className="page-title">偏好设置</Title>
        <Text style={{ color: 'rgba(255, 255, 255, 0.7)' }}>定制您的应用体验，包括语言、货币和系统配置</Text>
      </div>

      <Card className="settings-main-card glass-card" variant="borderless">
        <div className="settings-content-inner">
          <Form form={form} layout="vertical" onFinish={handleSave}>
            <Form.Item label="首选货币" name="currency">
              <Select size="large">
                <Option value="CNY">人民币 (¥) - CNY</Option>
                <Option value="USD">美元 ($) - USD</Option>
                <Option value="EUR">欧元 (€) - EUR</Option>
                <Option value="JPY">日元 (¥) - JPY</Option>
              </Select>
            </Form.Item>

            <Form.Item label="日期显示格式" name="dateFormat">
              <Select size="large">
                <Option value="YYYY-MM-DD">2026-01-08 (年-月-日)</Option>
                <Option value="MM/DD/YYYY">01/08/2026 (月/日/年)</Option>
                <Option value="DD/MM/YYYY">08/01/2026 (日/月/年)</Option>
              </Select>
            </Form.Item>

            <Form.Item label="每周起始日" name="firstDayOfWeek">
              <Select size="large">
                <Option value={0}>星期日</Option>
                <Option value={1}>星期一</Option>
              </Select>
            </Form.Item>

            <Form.Item className="save-btn-container">
              <Button 
                type="primary" 
                icon={<SaveOutlined />} 
                htmlType="submit" 
                size="large"
                loading={loading}
                block
                className="save-btn"
              >
                保存偏好设置
              </Button>
            </Form.Item>
          </Form>
        </div>
      </Card>
    </div>
  );
};

export default PreferencePage;
