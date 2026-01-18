import React, { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import ReactMarkdown from 'react-markdown';
import { aiService } from '../../services/aiService';
import { useDesignSystem } from '../design-system/DesignSystemContext';
import './AiAssistant.css';

/**
 * AI 财务助手悬浮窗组件
 * 依赖设计系统的 Design Tokens 构建配色，避免直接访问 theme.colors 导致的 undefined
 */
const AiAssistant: React.FC = () => {
  const { tokens, theme } = useDesignSystem();
  // 基于 Design Tokens 构造本组件使用的颜色表
  const colors = {
    primary: tokens.theme[theme].color.primary['600'],
    surface: tokens.theme[theme].color.background.elevated,
    background: tokens.theme[theme].color.background.secondary,
    border: tokens.theme[theme].color.border.default,
    text: tokens.theme[theme].color.text.primary,
    textSecondary: tokens.theme[theme].color.text.secondary,
  };
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [messages, setMessages] = useState<{ role: 'user' | 'assistant'; content: string }[]>([
    { role: 'assistant', content: '您好！我是您的智能财务助手。您可以问我“上个月花了多少钱”或“最近有什么大额支出”等问题。' }
  ]);
  const [isLoading, setIsLoading] = useState(false);
  const [status, setStatus] = useState<{ state: string; progress?: number; message?: string } | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [fastMode, setFastMode] = useState(true);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, isOpen]);

  // 轮询服务状态
  useEffect(() => {
    if (!isOpen) return;
    const checkStatus = async () => {
      const s = await aiService.getStatus();
      setStatus(s);
    };
    checkStatus();
    const timer = setInterval(checkStatus, 3000);
    return () => clearInterval(timer);
  }, [isOpen]);

  /**
   * 提交用户问题并请求后端 NLQ 接口
   * 启用 fastMode 时优先走规则回退快速路径，提升响应速度
   */
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!query.trim() || isLoading) return;

    const userMessage = query.trim();
    setMessages(prev => [...prev, { role: 'user', content: userMessage }]);
    setQuery('');
    setIsLoading(true);

    try {
      const result = await aiService.query(userMessage, { fast: fastMode });
      const answer = result.success 
        ? (result.answer || '抱歉，我没有找到相关数据。') 
        : (result.message || '系统繁忙，请稍后再试。');
      
      setMessages(prev => [...prev, { role: 'assistant', content: answer }]);
    } catch (error) {
      setMessages(prev => [...prev, { role: 'assistant', content: '连接失败，请检查网络或本地服务。' }]);
    } finally {
      setIsLoading(false);
    }
  };

  // 悬浮球样式
  const fabStyle = {
    position: 'fixed' as const,
    top: '50%',
    right: '30px',
    width: '60px',
    height: '60px',
    borderRadius: '30px',
    backgroundColor: colors.primary,
    color: '#fff',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    cursor: 'pointer',
    boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
    zIndex: 1000,
    transition: 'transform 0.2s',
    transform: 'translateY(-50%)',
    pointerEvents: 'auto' as const,
  };

  // 聊天窗口样式
  const windowStyle = {
    position: 'fixed' as const,
    top: '50%',
    right: '100px',
    width: '350px',
    height: '500px',
    backgroundColor: colors.surface,
    borderRadius: '16px',
    boxShadow: '0 8px 24px rgba(0,0,0,0.12)',
    display: isOpen ? 'flex' : 'none',
    flexDirection: 'column' as const,
    zIndex: 1000,
    overflow: 'hidden',
    border: `1px solid ${colors.border}`,
    transform: 'translateY(-50%)',
    pointerEvents: isOpen ? ('auto' as const) : ('none' as const),
  };

  return createPortal(
    <>
      {/* 悬浮按钮 */}
      <div 
        style={fabStyle} 
        role="button"
        aria-label="打开 AI 财务助手"
        onClick={() => {
          const next = !isOpen;
          console.log('[AiAssistant] toggle window', next);
          setIsOpen(next);
        }}
        onMouseEnter={(e) => e.currentTarget.style.transform = 'translateY(-50%) scale(1.1)'}
        onMouseLeave={(e) => e.currentTarget.style.transform = 'translateY(-50%) scale(1)'}
      >
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
        </svg>
      </div>
      {/* 对话窗口 */}
      <div style={windowStyle}>
        {/* 标题栏 */}
        <div style={{
          padding: '16px',
          backgroundColor: colors.primary,
          color: '#fff',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center'
        }}>
          <div>
            <span style={{ fontWeight: 600 }}>AI 财务助手 (Local)</span>
            {status && status.state !== 'ready' && (
              <div style={{ fontSize: '12px', opacity: 0.8, marginTop: '2px' }}>
                {status.state === 'downloading' ? `下载模型中 ${status.progress || 0}%` : status.message || 'Connecting...'}
              </div>
            )}
          </div>
          <span 
            onClick={() => setIsOpen(false)} 
            style={{ cursor: 'pointer', fontSize: '20px' }}
          >×</span>
        </div>

        {/* 消息列表 */}
        <div style={{
          flex: 1,
          padding: '16px',
          overflowY: 'auto',
          backgroundColor: colors.background,
          display: 'flex',
          flexDirection: 'column',
          gap: '12px'
        }}>
          {messages.map((msg, idx) => (
            <div key={idx} style={{
              alignSelf: msg.role === 'user' ? 'flex-end' : 'flex-start',
              maxWidth: '85%',
              padding: '10px 14px',
              borderRadius: '12px',
              backgroundColor: msg.role === 'user' ? colors.primary : colors.surface,
              color: msg.role === 'user' ? '#fff' : colors.text,
              boxShadow: '0 1px 2px rgba(0,0,0,0.05)',
              fontSize: '14px',
              lineHeight: '1.5',
              borderTopRightRadius: msg.role === 'user' ? '2px' : '12px',
              borderTopLeftRadius: msg.role === 'assistant' ? '2px' : '12px',
            }}>
              {msg.role === 'assistant' ? (
                <ReactMarkdown>{msg.content}</ReactMarkdown>
              ) : (
                msg.content
              )}
            </div>
          ))}
          {isLoading && (
            <div style={{
              alignSelf: 'flex-start',
              backgroundColor: colors.surface,
              padding: '8px 16px',
              borderRadius: '12px',
              fontSize: '12px',
              color: colors.textSecondary
            }}>
              思考中...
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* 输入框 */}
        <form onSubmit={handleSubmit} style={{
          padding: '12px',
          borderTop: `1px solid ${colors.border}`,
          display: 'flex',
          gap: '8px',
          backgroundColor: colors.surface
        }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: colors.textSecondary }}>
            <input
              type="checkbox"
              checked={fastMode}
              onChange={(e) => setFastMode(e.target.checked)}
            />
            极速模式
          </label>
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="输入您的问题..."
            style={{
              flex: 1,
              padding: '10px 14px',
              borderRadius: '20px',
              border: `1px solid ${colors.border}`,
              outline: 'none',
              backgroundColor: colors.background,
              color: colors.text
            }}
          />
          <button 
            type="submit" 
            disabled={isLoading || !query.trim()}
            style={{
              padding: '0 16px',
              borderRadius: '20px',
              backgroundColor: colors.primary,
              color: '#fff',
              border: 'none',
              cursor: isLoading ? 'not-allowed' : 'pointer',
              opacity: isLoading ? 0.7 : 1
            }}
          >
            发送
          </button>
        </form>
      </div>
    </>,
    document.body
  );
};

export default AiAssistant;
