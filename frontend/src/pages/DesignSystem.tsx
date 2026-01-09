import React from 'react';
import { Typography, Card, Row, Col, Button, Space, Divider, Tag, Table } from 'antd';
import {
  FormatPainterOutlined,
  FontSizeOutlined,
  SkinOutlined,
  AppstoreOutlined,
} from '@ant-design/icons';

const { Title, Text, Paragraph } = Typography;

/**
 * 设计系统规范展示页面
 * 用于展示项目所遵循的视觉层级、色彩搭配、排版规范及交互标准
 */
const DesignSystem: React.FC = () => {
  const colors = [
    { name: 'Primary (Brand)', hex: '#6366f1', desc: '用于主按钮、链接、状态激活等', token: '--primary-500' },
    { name: 'Glass Card BG', hex: 'rgba(255,255,255,0.7)', desc: '玻璃拟态容器背景，带 20px 模糊', token: '.glass-card' },
    { name: 'Success', hex: '#10b981', desc: '用于收入、成功状态等', token: '--success' },
    { name: 'Expense/Danger', hex: '#ef4444', desc: '用于支出、删除、错误状态等', token: '--expense' },
  ];

  const typography = [
    { level: 'Page Title', size: '32px', weight: '800', desc: '大型页面标题，加粗并带负间距' },
    { level: 'Card Title', size: '18px', weight: '700', desc: '卡片标题，通常带有装饰圆点' },
    { level: 'Statistic Value', size: '24px', weight: '700', desc: '关键统计数值' },
    { level: 'Body Text', size: '14px', weight: '400', desc: '正文内容' },
  ];

  return (
    <div style={{ padding: '32px', maxWidth: '1400px', margin: '0 auto', animation: 'fadeIn 0.5s ease-out' }}>
      <div className="page-header-section" style={{ marginBottom: 48 }}>
        <div className="header-left">
          <Title level={2} className="page-title">
            <FormatPainterOutlined style={{ marginRight: 12, color: 'var(--primary-500)' }} />
            设计系统 (Design System)
          </Title>
          <Text type="secondary" style={{ fontSize: '16px' }}>
            本项目采用 Glassmorphism (玻璃拟态) 设计语言，旨在通过透明度、模糊和光影效果打造轻量、现代且具有深度的交互体验。
          </Text>
        </div>
      </div>

      {/* 色彩系统 */}
      <section style={{ marginBottom: 80 }}>
        <Title level={3} className="section-title"><SkinOutlined style={{ marginRight: 8 }} /> 核心色彩与材质</Title>
        <Divider />
        <Row gutter={[24, 24]}>
          {colors.map((color) => (
            <Col xs={24} sm={12} lg={6} key={color.name}>
              <Card 
                bordered={false}
                className="glass-card"
                cover={<div style={{ height: 120, backgroundColor: color.hex, borderRadius: '20px 20px 0 0', backdropFilter: 'blur(20px)' }} />}
                style={{ borderRadius: 20 }}
              >
                <Card.Meta 
                  title={color.name} 
                  description={
                    <Space direction="vertical" size={4}>
                      <Text strong>{color.hex}</Text>
                      <Text type="secondary" size="small">{color.desc}</Text>
                      <Tag color="blue" style={{ marginTop: 8, borderRadius: '6px' }}>{color.token}</Tag>
                    </Space>
                  } 
                />
              </Card>
            </Col>
          ))}
        </Row>
      </section>

      {/* 视觉规范展示 */}
      <section style={{ marginBottom: 80 }}>
        <Title level={3} className="section-title"><AppstoreOutlined style={{ marginRight: 8 }} /> 视觉规范与交互</Title>
        <Divider />
        <Row gutter={[32, 32]}>
          <Col xs={24} lg={12}>
            <Card className="glass-card" bordered={false} title="玻璃拟态卡片 (Glass Card)">
              <Paragraph>
                核心 CSS 实现：
                <pre style={{ background: 'rgba(0,0,0,0.05)', padding: '16px', borderRadius: '12px', marginTop: '12px' }}>
{`background: rgba(255, 255, 255, 0.7);
backdrop-filter: blur(20px);
border: 1px solid rgba(255, 255, 255, 0.5);
border-radius: 24px;`}
                </pre>
              </Paragraph>
            </Card>
          </Col>
          <Col xs={24} lg={12}>
            <Card className="glass-card" bordered={false} title="交互动效 (Animations)">
              <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap' }}>
                <Button type="primary" size="large" className="hover-lift">悬浮提升效果</Button>
                <div className="pulse-dot" style={{ width: '12px', height: '12px', background: 'var(--primary-500)', borderRadius: '50%', boxShadow: '0 0 0 rgba(99, 102, 241, 0.4)', animation: 'pulse 2s infinite' }}></div>
              </div>
              <Paragraph style={{ marginTop: '20px' }}>
                1. <b>FadeIn</b>: 页面加载时的向上平滑淡入。<br />
                2. <b>Hover Lift</b>: 卡片和按钮在悬浮时微弱上移并增强投影。<br />
                3. <b>Pulse</b>: 关键状态指示器的呼吸效果。
              </Paragraph>
            </Card>
          </Col>
        </Row>
      </section>

      {/* 字体排版 */}
      <section style={{ marginBottom: 80 }}>
        <Title level={3} className="section-title"><FontSizeOutlined style={{ marginRight: 8 }} /> 字体排版系统</Title>
        <Divider />
        <Card className="glass-card" bordered={false} bodyStyle={{ padding: 0 }}>
          <Table 
            pagination={false}
            dataSource={typography}
            className="glass-table"
            columns={[
              { title: '层级', dataIndex: 'level', key: 'level', width: '20%' },
              { title: '示例', key: 'example', render: (_, record) => (
                <span style={{ fontSize: record.size, fontWeight: record.weight, letterSpacing: record.level === 'Page Title' ? '-0.02em' : 'normal' }}>
                  Financial Master 财务大师
                </span>
              )},
              { title: '规范', key: 'specs', render: (_, record) => (
                <Text type="secondary">{record.size} / {record.weight}</Text>
              )},
              { title: '用途', dataIndex: 'desc', key: 'desc' },
            ]}
          />
        </Card>
      </section>

      {/* 响应式断点 */}
      <section>
        <Card style={{ background: 'linear-gradient(135deg, #6366f1 0%, #a855f7 100%)', borderRadius: 24, padding: '20px' }} bordered={false}>
          <Title level={3} style={{ color: '#fff', marginBottom: '16px' }}>响应式布局标准 (Breakpoint)</Title>
          <Row gutter={[32, 16]}>
            <Col xs={24} sm={8}>
              <div style={{ color: 'rgba(255,255,255,0.9)' }}>
                <Title level={4} style={{ color: '#fff', marginBottom: '4px' }}>Mobile</Title>
                <Text style={{ color: 'rgba(255,255,255,0.8)' }}>{"< 768px"}</Text>
                <Paragraph style={{ marginTop: '8px', fontSize: '13px' }}>单列布局，标题缩小，隐藏次要装饰元素。</Paragraph>
              </div>
            </Col>
            <Col xs={24} sm={8}>
              <div style={{ color: 'rgba(255,255,255,0.9)' }}>
                <Title level={4} style={{ color: '#fff', marginBottom: '4px' }}>Tablet</Title>
                <Text style={{ color: 'rgba(255,255,255,0.8)' }}>{"768px - 1024px"}</Text>
                <Paragraph style={{ marginTop: '8px', fontSize: '13px' }}>侧边栏收起或简化，网格布局调整为双列。</Paragraph>
              </div>
            </Col>
            <Col xs={24} sm={8}>
              <div style={{ color: 'rgba(255,255,255,0.9)' }}>
                <Title level={4} style={{ color: '#fff', marginBottom: '4px' }}>Desktop</Title>
                <Text style={{ color: 'rgba(255,255,255,0.8)' }}>{"> 1024px"}</Text>
                <Paragraph style={{ marginTop: '8px', fontSize: '13px' }}>完整侧边栏，三列或更多网格布局，最大化展示图表。</Paragraph>
              </div>
            </Col>
          </Row>
        </Card>
      </section>
    </div>
  );
};

export default DesignSystem;
