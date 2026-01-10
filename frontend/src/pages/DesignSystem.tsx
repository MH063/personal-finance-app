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
    { name: 'Primary (Brand)', hex: '#6366f1', desc: '用于主按钮、链接、状态激活等', token: '--gradient-primary' },
    { name: 'Glass Card BG', hex: 'rgba(255,255,255,0.05)', desc: '深色玻璃拟态容器背景，带模糊', token: 'var(--color-bg-glass)' },
    { name: 'Glass Border', hex: 'rgba(255,255,255,0.1)', desc: '玻璃态边框颜色', token: 'var(--color-glass-border)' },
    { name: 'Text Primary', hex: '#FFFFFF', desc: '主标题与核心文字颜色', token: 'white' },
  ];

  const typography = [
    { level: 'Page Title', size: '32px', weight: '800', desc: '大型页面标题，加粗并带负间距' },
    { level: 'Card Title', size: '18px', weight: '700', desc: '卡片标题，带玻璃态感官' },
    { level: 'Statistic Value', size: '24px', weight: '700', desc: '关键统计数值，高亮显示' },
    { level: 'Body Text', size: '14px', weight: '400', desc: '正文内容，高对比度显示' },
  ];

  return (
    <div style={{ padding: '32px', maxWidth: '1400px', margin: '0 auto', animation: 'fadeIn 0.5s ease-out' }}>
      <div className="page-header-section" style={{ marginBottom: 48 }}>
        <div className="header-left">
          <Title level={2} className="page-title" style={{ color: 'white' }}>
            <FormatPainterOutlined style={{ marginRight: 12, color: 'var(--primary-500)' }} />
            设计系统 (Design System)
          </Title>
          <Text style={{ fontSize: '16px', color: 'rgba(255, 255, 255, 0.7)' }}>
            本项目采用 Magic Glass (魔法玻璃) 设计语言，旨在通过透明度、模糊和光影效果打造轻量、现代且具有深度的交互体验。
          </Text>
        </div>
      </div>

      {/* 色彩系统 */}
      <section style={{ marginBottom: 80 }}>
        <Title level={3} className="section-title" style={{ color: 'white' }}><SkinOutlined style={{ marginRight: 8 }} /> 核心色彩与材质</Title>
        <Divider style={{ borderColor: 'var(--color-glass-border)' }} />
        <Row gutter={[24, 24]}>
          {colors.map((color) => (
            <Col xs={24} sm={12} lg={6} key={color.name}>
              <Card 
                variant="borderless"
                className="glass-card"
                cover={<div style={{ height: 120, background: color.hex.startsWith('rgba') ? color.hex : `var(--gradient-primary)`, borderRadius: '20px 20px 0 0', backdropFilter: 'blur(20px)' }} />}
                style={{ borderRadius: 20 }}
              >
                <Card.Meta 
                  title={<span style={{ color: 'white' }}>{color.name}</span>} 
                  description={
                    <Space direction="vertical" size={4}>
                      <Text strong style={{ color: 'rgba(255, 255, 255, 0.9)' }}>{color.hex}</Text>
                      <Text style={{ fontSize: 12, color: 'rgba(255, 255, 255, 0.6)' }}>{color.desc}</Text>
                      <Tag color="blue" style={{ marginTop: 8, borderRadius: '6px', border: 'none', background: 'rgba(99, 102, 241, 0.2)', color: '#818cf8' }}>{color.token}</Tag>
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
        <Title level={3} className="section-title" style={{ color: 'white' }}><AppstoreOutlined style={{ marginRight: 8 }} /> 视觉规范与交互</Title>
        <Divider style={{ borderColor: 'var(--color-glass-border)' }} />
        <Row gutter={[32, 32]}>
          <Col xs={24} lg={12}>
            <Card className="glass-card" variant="borderless" title={<span style={{ color: 'white' }}>玻璃拟态卡片 (Glass Card)</span>}>
              <Paragraph style={{ color: 'rgba(255, 255, 255, 0.8)' }}>
                核心 CSS 实现：
                <pre style={{ background: 'rgba(255, 255, 255, 0.05)', padding: '16px', borderRadius: '12px', marginTop: '12px', color: '#a5b4fc', border: '1px solid var(--color-glass-border)' }}>
{`background: var(--color-bg-glass);
backdrop-filter: var(--glass-blur);
border: 1px solid var(--color-glass-border);
border-radius: 24px;`}
                </pre>
              </Paragraph>
            </Card>
          </Col>
          <Col xs={24} lg={12}>
            <Card className="glass-card" variant="borderless" title={<span style={{ color: 'white' }}>交互动效 (Animations)</span>}>
              <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap' }}>
                <Button type="primary" size="large" className="hover-lift" style={{ background: 'var(--gradient-primary)', border: 'none' }}>悬浮提升效果</Button>
                <div className="pulse-dot" style={{ width: '12px', height: '12px', background: 'var(--primary-500)', borderRadius: '50%', boxShadow: '0 0 0 rgba(99, 102, 241, 0.4)', animation: 'pulse 2s infinite' }}></div>
              </div>
              <Paragraph style={{ marginTop: '20px', color: 'rgba(255, 255, 255, 0.8)' }}>
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
        <Title level={3} className="section-title" style={{ color: 'white' }}><FontSizeOutlined style={{ marginRight: 8 }} /> 字体排版系统</Title>
        <Divider style={{ borderColor: 'var(--color-glass-border)' }} />
        <Card className="glass-card" variant="borderless" styles={{ body: { padding: 0 } }}>
          <Table 
            pagination={false}
            dataSource={typography}
            className="glass-table"
            columns={[
              { title: <span style={{ color: 'rgba(255, 255, 255, 0.7)' }}>层级</span>, dataIndex: 'level', key: 'level', width: '20%', render: (text) => <span style={{ color: 'white', fontWeight: 600 }}>{text}</span> },
              { title: <span style={{ color: 'rgba(255, 255, 255, 0.7)' }}>示例</span>, key: 'example', render: (_, record) => (
                <span style={{ fontSize: record.size, fontWeight: record.weight, color: 'white', letterSpacing: record.level === 'Page Title' ? '-0.02em' : 'normal' }}>
                  Financial Master 财务大师
                </span>
              )},
              { title: <span style={{ color: 'rgba(255, 255, 255, 0.7)' }}>规范</span>, key: 'specs', render: (_, record) => (
                <Text style={{ color: 'rgba(255, 255, 255, 0.6)' }}>{record.size} / {record.weight}</Text>
              )},
              { title: <span style={{ color: 'rgba(255, 255, 255, 0.7)' }}>用途</span>, dataIndex: 'desc', key: 'desc', render: (text) => <span style={{ color: 'rgba(255, 255, 255, 0.8)' }}>{text}</span> },
            ]}
          />
        </Card>
      </section>

      {/* 响应式断点 */}
      <section>
        <Card style={{ background: 'linear-gradient(135deg, #6366f1 0%, #a855f7 100%)', borderRadius: 24, padding: '20px' }} variant="borderless">
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
