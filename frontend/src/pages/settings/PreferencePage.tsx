import React, { useEffect, useState } from 'react';
import { Card, Form, Select, Button, Typography, App as AntdApp, Spin, Divider, Space, Tag } from 'antd';
import { SaveOutlined, PictureOutlined, CheckCircleOutlined, UploadOutlined } from '@ant-design/icons';
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
  const { message } = AntdApp.useApp();
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

  const [bgInfo, setBgInfo] = useState<{ path?: string; lastUpdated?: string } | null>(null);
  const [pendingBgPath, setPendingBgPath] = useState<string | null>(null);

  useEffect(() => {
    const loadBgInfo = async () => {
      if (window.electronAPI?.getBackgroundConfig) {
        const config = await window.electronAPI.getBackgroundConfig();
        if (config) setBgInfo(config);
      }
    };
    loadBgInfo();
  }, []);

  /**
   * 用户上传本地背景图片
   */
  const handleUploadBackground = async () => {
    if (!window.electronAPI?.selectBackgroundFile) {
      message.error('当前环境不支持文件上传，请确保在客户端中运行');
      return;
    }

    try {
      const result = await window.electronAPI.selectBackgroundFile();
      if (result.success && result.path) {
        setPendingBgPath(result.path);
        message.success('已选择图片，请点击保存按钮生效');
      } else if (result.error !== 'Cancelled') {
        message.error('选择失败: ' + result.error);
      }
    } catch (error: any) {
      message.error('操作异常: ' + error.message);
    }
  };

  /**
   * 处理偏好设置保存
   * @param values 表单提交的偏好配置
   */
  const handleSave = async (values: any) => {
    try {
      // 1. 如果有待保存的背景图片，先保存背景
      if (pendingBgPath && window.electronAPI?.saveBackground) {
        const bgResult = await window.electronAPI.saveBackground(pendingBgPath, 'file');
        if (bgResult.success) {
           // 更新本地状态和通知应用
           const config = {
             currentBackground: bgResult.path,
             lastUpdated: new Date().toISOString(),
             isCustom: true
           };
           setBgInfo(config);
           setPendingBgPath(null);
           window.dispatchEvent(new CustomEvent('app:background-updated', { detail: config }));
        } else {
          message.error('背景图片保存失败: ' + bgResult.error);
          // 如果背景保存失败，可以选择中断或继续保存其他设置
          // 这里选择继续保存其他设置，但提示错误
        }
      }

      // 2. 保存其他偏好设置
      await dispatch(updateSettings(values)).unwrap();
      message.success('偏好设置已更新');
    } catch (error: any) {
      message.error(typeof error === 'string' ? error : (error?.message || '保存失败'));
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

            <Divider style={{ borderColor: 'rgba(255, 255, 255, 0.1)' }}>背景设置</Divider>
            
            <div className="setting-item-group" style={{ marginBottom: '24px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '16px' }}>
                <div>
                  <Text strong style={{ color: 'white', display: 'block', marginBottom: '4px' }}>
                    <PictureOutlined style={{ marginRight: '8px' }} />
                    自定义背景图片
                  </Text>
                  <Text type="secondary" style={{ fontSize: '13px', color: 'rgba(255, 255, 255, 0.45)' }}>
                    上传本地图片作为系统背景
                  </Text>
                </div>
                {pendingBgPath ? (
                  <Tag color="warning" icon={<CheckCircleOutlined />}>待保存</Tag>
                ) : bgInfo ? (
                  <Tag color="success" icon={<CheckCircleOutlined />}>已设置</Tag>
                ) : null}
              </div>

              <div style={{ 
                background: 'rgba(255, 255, 255, 0.05)', 
                padding: '16px', 
                borderRadius: '12px', 
                border: '1px solid rgba(255, 255, 255, 0.1)',
                marginBottom: '16px'
              }}>
                <Space direction="vertical" style={{ width: '100%' }}>
                  <Space>
                    <Button 
                      icon={<UploadOutlined />} 
                      onClick={handleUploadBackground}
                      style={{ background: 'rgba(255, 255, 255, 0.05)', borderColor: 'rgba(255, 255, 255, 0.2)', color: 'white' }}
                    >
                      {pendingBgPath ? '重新选择图片' : '上传自定义图片'}
                    </Button>
                    {pendingBgPath && <Text style={{ color: 'rgba(255, 255, 255, 0.65)', fontSize: '12px' }}>已选择新图片</Text>}
                  </Space>
                </Space>
              </div>
            </div>

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
