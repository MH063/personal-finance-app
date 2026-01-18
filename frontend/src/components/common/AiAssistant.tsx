import React, { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { aiService } from '../../services/aiService';
import { createSession, getCurrentSession, setCurrentSessionId, appendMessage, setPaused, listSessions, deleteSessions } from '../../services/aiSessionService';
import type { AiMessage } from '../../db/db';
import { useDesignSystem } from '../design-system/DesignSystemContext';
import './AiAssistant.css';
import { Tooltip, Modal } from 'antd';

/**
 * AI 财务助手悬浮窗组件
 * 依赖设计系统的 Design Tokens 构建配色，避免直接访问 theme.colors 导致的 undefined
 */
const AiAssistant: React.FC = () => {
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
  const [messages, setMessages] = useState<{ role: 'user' | 'assistant'; content: string }[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [status, setStatus] = useState<{ state: string; progress?: number; message?: string } | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const [fastMode, setFastMode] = useState(true);
  const [isPaused, setIsPaused] = useState(true);
  const [currentSessionId, setCurrentSession] = useState<string | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [sessions, setSessions] = useState<any[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [stickBottom, setStickBottom] = useState(true);
  const [showJumpBtn, setShowJumpBtn] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmLoading, setConfirmLoading] = useState(false);
  const snapshotMessages = React.useCallback((msgs: { role: 'user' | 'assistant'; content: string }[], sid: string | null) => {
    try {
      localStorage.setItem('aiSnapshotMessages', JSON.stringify(msgs));
      if (sid) localStorage.setItem('aiSnapshotSessionId', sid);
      const last = msgs[msgs.length - 1];
      if (last) {
        localStorage.setItem('aiLastMessageRole', last.role);
        localStorage.setItem('aiSessionUpdatedAt', String(Date.now()));
      }
    } catch (e) {
      console.warn('[AiAssistant] 快照写入失败', e);
    }
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem('aiLoadingState', isLoading ? '1' : '0');
    } catch (e) {
      console.warn('[AiAssistant] 写入加载状态失败', e);
    }
  }, [isLoading]);

  useEffect(() => {
    try {
      const hasInput = !!query.trim();
      if (hasInput) {
        localStorage.setItem('aiUnsavedInput', '1');
      } else {
        localStorage.removeItem('aiUnsavedInput');
      }
    } catch (e) {
      console.warn('[AiAssistant] 写入未发送输入失败', e);
    }
  }, [query]);

  // 记录助手开闭状态用于异常退出判断
  useEffect(() => {
    try {
      localStorage.setItem('aiAssistantOpen', isOpen ? '1' : '0');
      if (!isOpen) {
        // 正常关闭时清除异常退出标记
        localStorage.removeItem('aiAbnormalExit');
        localStorage.removeItem('aiPendingAtExit');
      }
    } catch (e) {
      console.warn('[AiAssistant] 写入开闭状态失败', e);
    }
  }, [isOpen]);

  // 监听页面卸载，如果助手仍处于打开状态则标记为异常退出
  useEffect(() => {
    const onBeforeUnload = () => {
      try {
        const open = localStorage.getItem('aiAssistantOpen') === '1';
        if (open) {
          localStorage.setItem('aiAbnormalExit', '1');
          const loading = localStorage.getItem('aiLoadingState') === '1';
          const lastRole = localStorage.getItem('aiLastMessageRole');
          const hasInput = localStorage.getItem('aiUnsavedInput') === '1';
          const pending = loading || lastRole === 'user' || hasInput;
          localStorage.setItem('aiPendingAtExit', pending ? '1' : '0');
        } else {
          localStorage.removeItem('aiAbnormalExit');
          localStorage.removeItem('aiPendingAtExit');
        }
      } catch (e) {
        console.warn('[AiAssistant] 标记异常退出失败', e);
      }
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, []);

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
    if (!currentSessionId && !query.trim()) return;
    const checkStatus = async () => {
      const s = await aiService.getStatus();
      setStatus(s);
    };
    checkStatus();
    const timer = setInterval(checkStatus, 3000);
    return () => clearInterval(timer);
  }, [isOpen, isPaused, currentSessionId, query]);

  // 打开时加载当前会话与历史（不自动创建新会话）
  useEffect(() => {
    const init = async () => {
      if (!isOpen) return;
      const session = await getCurrentSession();
      if (session) {
        setCurrentSession(session.id);
        setIsPaused(session.status === 'paused');
        setMessages(session.messages.map(m => ({ role: m.role, content: m.content })));
        snapshotMessages(session.messages.map(m => ({ role: m.role, content: m.content })), session.id);
      }
      const list = await listSessions();
      setSessions(list);
      if (!session && list.length === 0) {
        try {
          const disableRestore = localStorage.getItem('aiDisableAutoRestore') === '1';
          const abnormalExit = localStorage.getItem('aiAbnormalExit') === '1';
          const pendingExit = localStorage.getItem('aiPendingAtExit') === '1';
          if (disableRestore || !abnormalExit || !pendingExit) return;
          const snap = JSON.parse(localStorage.getItem('aiSnapshotMessages') || '[]');
          if (Array.isArray(snap) && snap.length > 0) {
            const created = await createSession(snap.map((m: any) => ({ role: m.role, content: m.content, timestamp: Date.now() })));
            setCurrentSession(created.id);
            setCurrentSessionId(created.id);
            setMessages(snap);
            setIsPaused(true);
            localStorage.removeItem('aiSnapshotMessages');
            localStorage.removeItem('aiSnapshotSessionId');
            localStorage.removeItem('aiAbnormalExit');
            localStorage.removeItem('aiPendingAtExit');
          }
        } catch (e) {
          console.warn('[AiAssistant] 快照恢复失败', e);
        }
      }
    };
    init();
  }, [isOpen, snapshotMessages]);

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
    snapshotMessages([...messages, { role: 'user', content: userMessage }], currentSessionId);
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
      snapshotMessages(initialMsgs.map(m => ({ role: m.role, content: m.content })), created.id);
    } else {
      const msg: AiMessage = { role: 'user', content: userMessage, timestamp: Date.now() };
      appendMessage(currentSessionId, msg);
    }

    try {
      const result = await aiService.query(userMessage, { fast: fastMode });
      const answer = result.success
        ? (result.answer || '抱歉，我没有找到相关数据。')
        : (result.message || '系统繁忙，请稍后再试。');
      const looksLikeQuery = /(最近|多少|明细|列表|统计|合计|查询|查看|有哪些|什么|\?|？)/.test(userMessage);
      const isBookingIntent = !!(result?.debug && typeof result.debug === 'object' && /booking/.test(String(result.debug.intent || '')));
      // 只在查询场景回复是否有数据
      if (!isBookingIntent && looksLikeQuery) {
        const rawResult = (result?.debug && Array.isArray(result.debug.rawResult)) ? (result.debug.rawResult as any[]) : ([] as any[]);
        const hasData = rawResult.length > 0;
        const fmt = (d: any) => {
          try {
            const t = d?.transaction_date || d?.transactionDate;
            const dt = t ? new Date(t) : null;
            const y = dt ? dt.getFullYear() : '';
            const m = dt ? String(dt.getMonth() + 1).padStart(2, '0') : '';
            const day = dt ? String(dt.getDate()).padStart(2, '0') : '';
            const pm = d?.payment_method || d?.paymentMethod || '';
            const pmText =
              pm === 'cash' ? '现金' :
              pm === 'bank_card' ? '银行卡' :
              pm === 'credit_card' ? '信用卡' :
              pm === 'wechat' ? '微信' :
              pm === 'alipay' ? '支付宝' :
              pm ? String(pm) : '未提供';
            const cat = d?.category || '未分类';
            const amt = typeof d?.amount === 'number' ? d.amount : Number(d?.amount || 0);
            return { date: `${y}-${m}-${day}`, amount: amt.toFixed(2), category: cat, payment: pmText };
          } catch {
            return { date: '', amount: '', category: '', payment: '' };
          }
        };
        const end = new Date();
        const start = new Date(end.getTime() - 7 * 24 * 3600 * 1000);
        const fmtDate = (x: Date) => `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`;
        if (!hasData) {
          const concise = `时间范围：${fmtDate(start)} 至 ${fmtDate(end)}\n\n没有查询到数据。`;
          setMessages(prev => [...prev, { role: 'assistant', content: concise }]);
          snapshotMessages([...messages, { role: 'assistant', content: concise }], currentSessionId);
          if (currentSessionId) {
            const ts = Date.now();
            appendMessage(currentSessionId, { role: 'assistant', content: concise, timestamp: ts } as AiMessage);
          }
        } else {
          const rows: { date: string; amount: string; category: string; payment: string }[] = (rawResult as any[]).map(fmt);
          const headers = ['日期', '金额(元)', '收入来源分类', '支付方式'];
          const headerMd = `| **${headers[0]}** | **${headers[1]}** | **${headers[2]}** | **${headers[3]}** |\n| :--- | :--- | :--- | :--- |`;
          const dataMd = rows.map(r => `| ${r.date} | ${r.amount} | ${r.category} | ${r.payment} |`).join('\n');
          const anomalies: string[] = [];
          if (rawResult.some((d: any) => !d?.category)) anomalies.push('存在未分类记录');
          if (rawResult.some((d: any) => !(d?.payment_method || d?.paymentMethod))) anomalies.push('存在支付方式缺失记录');
          const extra = anomalies.length ? `\n\n异常说明：${anomalies.join('；')}。` : '';
          const content =
            `时间范围：${fmtDate(start)} 至 ${fmtDate(end)}\n\n` +
            `${headerMd}\n${dataMd}` +
            extra;
          setMessages(prev => [...prev, { role: 'assistant', content }]);
          snapshotMessages([...messages, { role: 'assistant', content }], currentSessionId);
          if (currentSessionId) {
            const ts = Date.now();
            appendMessage(currentSessionId, { role: 'assistant', content, timestamp: ts } as AiMessage);
          }
        }
      } else {
        setMessages(prev => [...prev, { role: 'assistant', content: answer }]);
        snapshotMessages([...messages, { role: 'assistant', content: answer }], currentSessionId);
        if (currentSessionId) {
          const ts = Date.now();
          appendMessage(currentSessionId, { role: 'assistant', content: answer, timestamp: ts } as AiMessage);
        }
      }
    } catch (error) {
      setMessages(prev => [...prev, { role: 'assistant', content: '连接失败，请检查网络或本地服务。' }]);
      snapshotMessages([...messages, { role: 'assistant', content: '连接失败，请检查网络或本地服务。' }], currentSessionId);
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
                backgroundColor: '#ffffff',
                color: colors.text,
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
                <ReactMarkdown remarkPlugins={[remarkGfm]}>{msg.content}</ReactMarkdown>
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
                    setConfirmOpen(true);
                  }}
                  style={{
                    padding: '6px 10px',
                    borderRadius: 12,
                    border: selectedIds.length ? 'none' : `1px solid ${colors.border}`,
                    cursor: selectedIds.length ? 'pointer' : 'not-allowed',
                    backgroundColor: selectedIds.length ? '#ff4d4f' : '#f2f3f5',
                    color: selectedIds.length ? '#fff' : '#666',
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
                    backgroundColor: '#ffffff',
                    color: colors.text,
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
            <Modal
              open={confirmOpen}
              title="确认删除所选会话？"
              okText="删除"
              cancelText="取消"
              confirmLoading={confirmLoading}
              destroyOnHidden
              onOk={async () => {
                try {
                  setConfirmLoading(true);
                  const count = await deleteSessions(selectedIds);
                  console.log(`[AiAssistant] 批量删除会话 count=${count}`);
                  const list = await listSessions();
                  setSessions(list);
                  setSelectedIds([]);
                  if (currentSessionId && selectedIds.includes(currentSessionId)) {
                    setCurrentSession(null);
                    setMessages([]);
                    setIsPaused(true);
                  }
                  setConfirmOpen(false);
                } finally {
                  setConfirmLoading(false);
                }
              }}
              onCancel={() => setConfirmOpen(false)}
            >
              删除后不可恢复，且会释放本地存储空间。
            </Modal>
          </div>
        )}
      </div>
    </>,
    document.body
  );
};

export default AiAssistant;
