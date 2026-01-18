import React, { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import ReactMarkdown from 'react-markdown';
import { aiService } from '../../services/aiService';
import { createSession, getCurrentSession, setCurrentSessionId, appendMessage, setPaused, listSessions, deleteSessions } from '../../services/aiSessionService';
import type { AiMessage } from '../../db/db';
import { useDesignSystem } from '../design-system/DesignSystemContext';
import './AiAssistant.css';
import { Tooltip, App as AntdApp } from 'antd';

/**
 * AI 财务助手悬浮窗组件
 * 依赖设计系统的 Design Tokens 构建配色，避免直接访问 theme.colors 导致的 undefined
 */
const AiAssistant: React.FC = () => {
  const { modal } = AntdApp.useApp();
  const { tokens, theme } = useDesignSystem();
  // 基于 Design Tokens 构造本组件使用的颜色表
  const colors = {
    primary: ((tokens.theme[theme].color as any).primary?.['600']) ?? tokens.theme.light.color.primary['600'],
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
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const [fastMode, setFastMode] = useState(true);
  const [isPaused, setIsPaused] = useState(false);
  const [currentSessionId, setCurrentSession] = useState<string | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [sessions, setSessions] = useState<any[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [stickBottom, setStickBottom] = useState(true);
  const [showJumpBtn, setShowJumpBtn] = useState(false);

  const scrollToBottom = React.useCallback(() => {
    if (!stickBottom) return;
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [stickBottom]);

  useEffect(() => {
    scrollToBottom();
    if (!stickBottom) {
      setShowJumpBtn(true);
      console.log('[AiAssistant] 非粘底时收到新消息，显示“回到底部”浮标');
    } else {
      setShowJumpBtn(false);
    }
  }, [messages, isOpen, scrollToBottom, stickBottom]);

  // 轮询服务状态
  useEffect(() => {
    if (!isOpen || isPaused) return;
    const checkStatus = async () => {
      const s = await aiService.getStatus();
      setStatus(s);
    };
    checkStatus();
    const timer = setInterval(checkStatus, 3000);
    return () => clearInterval(timer);
  }, [isOpen, isPaused]);

  // 打开时加载当前会话与历史（不自动创建新会话）
  useEffect(() => {
    const init = async () => {
      if (!isOpen) return;
      const session = await getCurrentSession();
      if (session) {
        setCurrentSession(session.id);
        setIsPaused(session.status === 'paused');
        setMessages(session.messages.map(m => ({ role: m.role, content: m.content })));
      }
      const list = await listSessions();
      setSessions(list);
    };
    init();
  }, [isOpen]);

  /**
   * 提交用户问题并请求后端 NLQ 接口
   * 启用 fastMode 时优先走规则回退快速路径，提升响应速度
   */
  const handleSubmit = async (e?: React.FormEvent) => {
    if (e?.preventDefault) e.preventDefault();
    if (!query.trim() || isLoading) return;
    if (isPaused) {
      setIsPaused(false);
      if (currentSessionId) {
        await setPaused(currentSessionId, false);
      }
    }

    const userMessage = query.trim();
    setMessages(prev => [...prev, { role: 'user', content: userMessage }]);
    setQuery('');
    setIsLoading(true);
    if (!currentSessionId) {
      const initialMsgs: AiMessage[] = [
        ...messages.map(m => ({ role: m.role, content: m.content, timestamp: Date.now() } as AiMessage)),
        { role: 'user', content: userMessage, timestamp: Date.now() },
      ];
      const created = await createSession(initialMsgs);
      setCurrentSession(created.id);
      setCurrentSessionId(created.id);
    } else {
      const msg: AiMessage = { role: 'user', content: userMessage, timestamp: Date.now() };
      appendMessage(currentSessionId, msg);
    }

    try {
      const result = await aiService.query(userMessage, { fast: fastMode });
      const answer = result.success 
        ? (result.answer || '抱歉，我没有找到相关数据。') 
        : (result.message || '系统繁忙，请稍后再试。');
      
      setMessages(prev => [...prev, { role: 'assistant', content: answer }]);
      if (currentSessionId) {
        const msg: AiMessage = { role: 'assistant', content: answer, timestamp: Date.now() };
        appendMessage(currentSessionId, msg);
      }
    } catch (error) {
      setMessages(prev => [...prev, { role: 'assistant', content: '连接失败，请检查网络或本地服务。' }]);
      if (currentSessionId) {
        const msg: AiMessage = { role: 'assistant', content: '连接失败，请检查网络或本地服务。', timestamp: Date.now() };
        appendMessage(currentSessionId, msg);
      }
    } finally {
      setIsLoading(false);
      setIsPaused(true);
      if (currentSessionId) {
        await setPaused(currentSessionId, true);
      }
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
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <button
              aria-label="历史记录"
              onClick={async () => {
                const list = await listSessions();
                setSessions(list);
                setHistoryOpen(true);
              }}
              style={{
                padding: '6px 10px',
                borderRadius: 12,
                border: `1px solid ${colors.border}`,
                cursor: 'pointer',
                backgroundColor: colors.surface,
                color: '#fff',
                fontSize: 12
              }}
            >
              历史
            </button>
            <span 
              onClick={() => setIsOpen(false)} 
              style={{ cursor: 'pointer', fontSize: '20px' }}
            >×</span>
          </div>
        </div>

        {/* 消息列表 */}
        <div ref={messagesContainerRef} onScroll={(e) => {
          const el = e.currentTarget;
          const dist = el.scrollHeight - el.scrollTop - el.clientHeight;
          const nextStick = dist < 40;
          setStickBottom(nextStick);
          if (nextStick) {
            setShowJumpBtn(false);
          }
        }} style={{
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
        {showJumpBtn && (
          <Tooltip title="回到底部">
            <button
              aria-label="回到底部"
              onClick={() => {
                setStickBottom(true);
                setShowJumpBtn(false);
                console.log('[AiAssistant] 点击“回到底部”浮标');
                messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
              }}
              style={{
                position: 'absolute',
                left: '50%',
                transform: 'translateX(-50%)',
                bottom: 96,
                width: 44,
                height: 36,
                borderRadius: 12,
                backgroundColor: 'rgba(255,255,255,0.85)',
                color: colors.text,
                border: 'none',
                boxShadow: '0 6px 18px rgba(0,0,0,0.15)',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                zIndex: 1001
              }}
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 16l-6-6h12z"></path>
              </svg>
            </button>
          </Tooltip>
        )}

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
          <textarea
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                if (e.ctrlKey) {
                  console.log('[AiAssistant] Ctrl+Enter 插入换行');
                  // 允许默认行为（插入换行）
                } else {
                  e.preventDefault();
                  console.log('[AiAssistant] Enter 触发发送');
                  handleSubmit();
                }
              }
            }}
            placeholder="输入您的问题..."
            rows={2}
            style={{
              flex: 1,
              padding: '10px 14px',
              borderRadius: '12px',
              border: `1px solid ${colors.border}`,
              outline: 'none',
              backgroundColor: colors.background,
              color: colors.text,
              resize: 'none'
            }}
          />
          <Tooltip title={isPaused ? (query.trim() ? '继续运行（不自动发送）' : '请输入内容后继续运行') : '暂停运行'}>
            <button
              aria-label={isPaused ? '继续运行' : '暂停运行'}
              aria-pressed={isPaused}
              aria-disabled={isPaused && !query.trim() ? 'true' : undefined}
              onClick={async () => {
                if (isPaused) {
                  if (!query.trim()) {
                    console.log('[AiAssistant] 继续运行被阻止：输入为空');
                    return;
                  }
                  setIsPaused(false);
                  if (currentSessionId) {
                    await setPaused(currentSessionId, false);
                  }
                  // 不自动发送，保留由 Enter 发送
                } else {
                  setIsPaused(true);
                  if (currentSessionId) {
                    await setPaused(currentSessionId, true);
                  }
                }
              }}
              style={{
                width: 40,
                height: 40,
                borderRadius: 12,
                backgroundColor: isPaused ? (query.trim() ? '#52c41a' : '#94d79f') : '#ff4d4f',
                color: '#fff',
                border: 'none',
                cursor: isPaused && !query.trim() ? 'not-allowed' : 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}
            >
              {isPaused ? (
                <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M8 5v14l11-7z"></path>
                </svg>
              ) : (
                <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                  <rect x="6" y="5" width="4" height="14"></rect>
                  <rect x="14" y="5" width="4" height="14"></rect>
                </svg>
              )}
            </button>
          </Tooltip>
        </form>
        {/* 历史记录面板 */}
        {historyOpen && (
          <div role="dialog" aria-modal="true" aria-label="历史会话管理" style={{
            position: 'absolute',
            top: 60,
            right: 0,
            width: '100%',
            height: 'calc(100% - 60px)',
            backgroundColor: colors.background,
            borderTop: `1px solid ${colors.border}`,
            display: 'flex',
            flexDirection: 'column'
          }}>
            <div style={{ padding: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ color: colors.text, fontWeight: 600 }}>历史会话</span>
              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  aria-label="删除选择"
                  onClick={() => {
                    if (selectedIds.length === 0) return;
                    modal.confirm({
                      title: '确认删除所选会话？',
                      content: '删除后不可恢复，且会释放本地存储空间。',
                      okText: '删除',
                      cancelText: '取消',
                      onOk: async () => {
                        const count = await deleteSessions(selectedIds);
                        console.log(`[AiAssistant] 批量删除会话 count=${count}`);
                        const list = await listSessions();
                        setSessions(list);
                        setSelectedIds([]);
                        if (currentSessionId && selectedIds.includes(currentSessionId)) {
                          setCurrentSession(null);
                          setMessages([{ role: 'assistant', content: '您好！我是您的智能财务助手。您可以问我“上个月花了多少钱”或“最近有什么大额支出”等问题。' }]);
                          setIsPaused(false);
                        }
                      },
                      destroyOnHidden: true
                    });
                  }}
                  style={{
                    padding: '6px 10px',
                    borderRadius: 12,
                    border: 'none',
                    cursor: selectedIds.length ? 'pointer' : 'not-allowed',
                    backgroundColor: selectedIds.length ? '#ff4d4f' : '#aaa',
                    color: '#fff',
                    fontSize: 12
                  }}
                >
                  删除选择
                </button>
                <button
                  aria-label="关闭历史"
                  onClick={() => setHistoryOpen(false)}
                  style={{
                    padding: '6px 10px',
                    borderRadius: 12,
                    border: `1px solid ${colors.border}`,
                    cursor: 'pointer',
                    backgroundColor: colors.surface,
                    color: '#fff',
                    fontSize: 12
                  }}
                >
                  关闭
                </button>
              </div>
            </div>
            <div style={{ flex: 1, overflowY: 'auto', padding: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
              {sessions.map(s => (
                <label key={s.id} style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  backgroundColor: colors.surface,
                  border: `1px solid ${colors.border}`,
                  borderRadius: 8,
                  padding: 8,
                  color: colors.text
                }}>
                  <input
                    type="checkbox"
                    aria-label={`选择会话 ${s.title || s.id}`}
                    checked={selectedIds.includes(s.id)}
                    onChange={(e) => {
                      const checked = e.target.checked;
                      setSelectedIds(prev => checked ? [...prev, s.id] : prev.filter(id => id !== s.id));
                    }}
                  />
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 13, fontWeight: 600 }}>{s.title || '未命名会话'}</div>
                    <div style={{ fontSize: 12, opacity: 0.7 }}>
                      {new Date(s.updatedAt).toLocaleString()} · {s.messageCount} 条消息 · {s.status === 'paused' ? '已暂停' : '运行中'}
                    </div>
                  </div>
                  <button
                    aria-label="切换到此会话"
                    onClick={async () => {
                      setCurrentSessionId(s.id);
                      setCurrentSession(s.id);
                      setIsPaused(s.status === 'paused');
                      setMessages(s.messages.map((m: AiMessage) => ({ role: m.role, content: m.content })));
                      setHistoryOpen(false);
                    }}
                    style={{
                      padding: '4px 8px',
                      borderRadius: 8,
                      border: `1px solid ${colors.border}`,
                      cursor: 'pointer',
                      backgroundColor: colors.background,
                      color: colors.text,
                      fontSize: 12
                    }}
                  >
                    进入
                  </button>
                </label>
              ))}
              {sessions.length === 0 && (
                <div style={{ color: colors.textSecondary, fontSize: 12 }}>暂无历史会话</div>
              )}
            </div>
          </div>
        )}
      </div>
    </>,
    document.body
  );
};

export default AiAssistant;
