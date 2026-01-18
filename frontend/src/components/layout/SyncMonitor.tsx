import type React from 'react';
import { useState, useEffect, useRef, useCallback } from 'react';
import { Tag, Typography, Badge, Button, Space, Alert, Empty, Row, Col, Progress, Collapse } from 'antd';
import { SyncOutlined, CheckCircleOutlined, ExclamationCircleOutlined, CloudSyncOutlined, CloseOutlined, MinusOutlined } from '@ant-design/icons';
import { collaborativeService } from '../../services/collaborativeService';
import { offlineSyncService, SyncListener } from '../../services/offlineSyncService';
import { saveAs } from 'file-saver';
import { db } from '../../db/db';

const { Text, Title } = Typography;
const { Panel } = Collapse;

interface SyncLog {
  id: string;
  type: string;
  timestamp: string;
  status: 'success' | 'failure' | 'syncing';
  data?: any;
}

/**
 * 实时同步监控面板组件
 * 显示最近的数据同步记录和系统同步状态
 */
type SyncMonitorProps = { visible: boolean; onClose: () => void };

function SyncMonitor({ visible, onClose }: SyncMonitorProps) {
  const [logs, setLogs] = useState<SyncLog[]>([]);
  const [syncInfo, setSyncInfo] = useState(collaborativeService.getSyncInfo());
  const [pendingCount, setPendingCount] = useState<number>(0);
  const [isMinimized, setIsMinimized] = useState<boolean>(false);

  // 窗口位置与尺寸（满足拖拽与缩放）
  const [windowPos, setWindowPos] = useState<{ x: number; y: number }>({
    x: Math.max(0, window.innerWidth - Math.min(600, Math.round(window.innerWidth * 0.5)) - 40),
    y: 80
  });
  const [windowSize, setWindowSize] = useState<{ width: number; height: number }>({
    width: Math.min(600, Math.round(window.innerWidth * 0.5)),
    height: Math.min(560, Math.round(window.innerHeight * 0.6))
  });
  const dragState = useRef<{ dragging: boolean; offsetX: number; offsetY: number }>({ dragging: false, offsetX: 0, offsetY: 0 });
  const resizeState = useRef<{
    resizing: boolean;
    dir: 'nw' | 'ne' | 'sw' | 'se' | null;
    startX: number;
    startY: number;
    startW: number;
    startH: number;
    startPosX: number;
    startPosY: number;
  }>({ resizing: false, dir: null, startX: 0, startY: 0, startW: 0, startH: 0, startPosX: 0, startPosY: 0 });

  // 音频上下文复用
  const audioCtxRef = useRef<AudioContext | null>(null);
  
  // 错误计数引用，用于触发告警
  const prevErrorCountRef = useRef(0);

  // 进度与耗时统计
  const [isSyncing, setIsSyncing] = useState<boolean>(false);
  const [totalToSync, setTotalToSync] = useState<number>(0);
  const [processedCount, setProcessedCount] = useState<number>(0);
  const [syncStartMs, setSyncStartMs] = useState<number | null>(null);
  const [lastSyncStats, setLastSyncStats] = useState<{ total: number; durationMs: number } | null>(null);
  const [, setTick] = useState(0); // 用于触发耗时刷新

  const syncStartMsRef = useRef(syncStartMs);
  const totalToSyncRef = useRef(totalToSync);
  useEffect(() => { syncStartMsRef.current = syncStartMs; }, [syncStartMs]);
  useEffect(() => { totalToSyncRef.current = totalToSync; }, [totalToSync]);

  const containerRef = useRef<HTMLDivElement | null>(null);

  // 播放提示音
  const beepWarning = useCallback(() => {
    try {
      if (!audioCtxRef.current) {
        audioCtxRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
      }
      const ctx = audioCtxRef.current;
      if (ctx.state === 'suspended') {
        ctx.resume();
      }
      const oscillator = ctx.createOscillator();
      const gainNode = ctx.createGain();
      oscillator.type = 'sine';
      oscillator.frequency.setValueAtTime(880, ctx.currentTime);
      gainNode.gain.setValueAtTime(0.001, ctx.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.1, ctx.currentTime + 0.01);
      oscillator.connect(gainNode);
      gainNode.connect(ctx.destination);
      oscillator.start();
      setTimeout(() => {
        oscillator.stop();
        // ctx.close(); // 复用 context，不关闭
      }, 200);
    } catch (e) {
      console.warn('[SyncMonitor] 播放提示音失败', e);
    }
  }, []);

  /**
   * 计算并限制窗口尺寸与位置，确保不超过视口可用空间
   */
  const clampSizeAndPos = useCallback((w: number, h: number, x: number, y: number) => {
    const margin = 16;
    const maxW = Math.max(480, window.innerWidth - margin * 2);
    const maxH = Math.max(200, window.innerHeight - margin * 2);
    const minW = 480;
    const minH = 240;
    const width = Math.min(Math.max(w, minW), maxW);
    const height = Math.min(Math.max(h, minH), maxH);
    const posX = Math.min(Math.max(x, margin), Math.max(margin, window.innerWidth - width - margin));
    const posY = Math.min(Math.max(y, margin), Math.max(margin, window.innerHeight - height - margin));
    return { width, height, x: posX, y: posY };
  }, []);

  /**
   * 触发全局尺寸变化事件，通知数据可视化等组件重绘
   */
  const emitSizeChange = useCallback((w: number, h: number) => {
    try {
      const evt = new CustomEvent('sync-monitor-size-change', { detail: { width: w, height: h } });
      window.dispatchEvent(evt);
      console.debug('[SyncMonitor] 尺寸更新:', w, h);
    } catch (e) {
      console.warn('[SyncMonitor] 尺寸事件派发失败', e);
    }
  }, []);

  /**
   * 拖拽过程中计算新的尺寸与位置
   */
  const handleResizeMove = useCallback((e: MouseEvent) => {
    if (!resizeState.current.resizing || !resizeState.current.dir) return;
    const dx = e.clientX - resizeState.current.startX;
    const dy = e.clientY - resizeState.current.startY;
    let nextW = resizeState.current.startW;
    let nextH = resizeState.current.startH;
    let nextX = resizeState.current.startPosX;
    let nextY = resizeState.current.startPosY;
    const dir = resizeState.current.dir;
    if (dir === 'se') {
      nextW = resizeState.current.startW + dx;
      nextH = resizeState.current.startH + dy;
    } else if (dir === 'sw') {
      nextW = resizeState.current.startW - dx;
      nextH = resizeState.current.startH + dy;
      nextX = resizeState.current.startPosX + dx;
    } else if (dir === 'ne') {
      nextW = resizeState.current.startW + dx;
      nextH = resizeState.current.startH - dy;
      nextY = resizeState.current.startPosY + dy;
    } else if (dir === 'nw') {
      nextW = resizeState.current.startW - dx;
      nextH = resizeState.current.startH - dy;
      nextX = resizeState.current.startPosX + dx;
      nextY = resizeState.current.startPosY + dy;
    }
    const clamped = clampSizeAndPos(nextW, nextH, nextX, nextY);
    setWindowSize({ width: clamped.width, height: clamped.height });
    setWindowPos({ x: clamped.x, y: clamped.y });
    emitSizeChange(clamped.width, clamped.height);
  }, [clampSizeAndPos, emitSizeChange]);

  /**
   * 结束拖拽调整大小
   */
  const handleResizeEnd = useCallback(() => {
    if (!resizeState.current.resizing) return;
    resizeState.current.resizing = false;
    resizeState.current.dir = null;
    window.removeEventListener('mousemove', handleResizeMove);
    window.removeEventListener('mouseup', handleResizeEnd);
    console.log('[SyncMonitor] 结束调整大小');
  }, [handleResizeMove]);

  /**
   * 窗口四角开始拖拽调整大小
   */
  const handleResizeStart = useCallback((dir: 'nw' | 'ne' | 'sw' | 'se', e: React.MouseEvent) => {
    e.preventDefault();
    resizeState.current.resizing = true;
    resizeState.current.dir = dir;
    resizeState.current.startX = e.clientX;
    resizeState.current.startY = e.clientY;
    resizeState.current.startW = windowSize.width;
    resizeState.current.startH = windowSize.height;
    resizeState.current.startPosX = windowPos.x;
    resizeState.current.startPosY = windowPos.y;
    window.addEventListener('mousemove', handleResizeMove);
    window.addEventListener('mouseup', handleResizeEnd);
    console.log('[SyncMonitor] 开始调整大小', dir);
  }, [windowSize.width, windowSize.height, windowPos.x, windowPos.y, handleResizeMove, handleResizeEnd]);

  // 初始化获取同步状态
  useEffect(() => {
    if (visible) {
      setSyncInfo(collaborativeService.getSyncInfo());
      // 获取当前队列大小作为初始状态（如果没在同步的话）
      if (!offlineSyncService.isSyncing) {
        collaborativeService.getPendingQueueSize().then(count => {
          setTotalToSync(count);
          setProcessedCount(0);
        });
      }
    }
  }, [visible]);

  // 监听 offlineSyncService 事件
  useEffect(() => {
    const handleSyncEvent: SyncListener = (event, data) => {
      if (event === 'start') {
        setIsSyncing(true);
        setTotalToSync(data?.total || 0);
        setProcessedCount(0);
        setSyncStartMs(Date.now());
      } else if (event === 'progress') {
        if (data?.processed !== undefined) setProcessedCount(data.processed);
        if (data?.item) {
          // 添加同步日志
          const newLog: SyncLog = {
            id: Math.random().toString(36).substring(7),
            type: `${data.item.entity}_${data.item.action}`,
            timestamp: new Date().toLocaleTimeString(),
            status: data.success ? 'success' : 'failure',
            data: data.item.data
          };
          setLogs(prev => [newLog, ...prev].slice(0, 50));
        }
      } else if (event === 'complete') {
        // 记录本次同步统计（毫秒级）
        const start = syncStartMsRef.current;
        const durationMs = start ? Math.max(0, Date.now() - start) : 0;
        const finalTotal = data?.total !== undefined ? data.total : totalToSyncRef.current;
        setLastSyncStats({ total: finalTotal, durationMs });

        setIsSyncing(false);
        setSyncStartMs(null);
        if (data?.total !== undefined) setProcessedCount(data.total);
        // 同步完成后，重置 pending
        setTotalToSync(0);
        setProcessedCount(0);
      }
    };

    offlineSyncService.on(handleSyncEvent);
    return () => offlineSyncService.off(handleSyncEvent);
  }, []); // 依赖为空，使用 ref 访问最新状态

  // 监听 collaborativeService 事件 (Socket 消息)
  useEffect(() => {
    const handleUpdate = async (data: any) => {
      console.log('[SyncMonitor] 收到更新通知:', data);
      const newLog: SyncLog = {
        id: Math.random().toString(36).substring(7),
        type: data.type || 'DATA_UPDATE',
        timestamp: new Date().toLocaleTimeString(),
        status: data.status || 'success',
        data: data.data || data, // Rule 5: 兼容直接数据或嵌套数据
      };
      setLogs(prev => [newLog, ...prev].slice(0, 50));
      setSyncInfo(collaborativeService.getSyncInfo());

      if (data?.type === 'MANUAL_FORCE_SYNC' || data?.type === 'RECONNECTED_SYNC') {
        try {
          const [c, l, b, d, t] = await Promise.all([
            db.categories.count(),
            db.ledgers.count(),
            db.budgets.count(),
            db.debts.count(),
            db.transactions.count()
          ]);
          const total = [c, l, b, d, t].reduce((acc, n) => acc + (Number(n) || 0), 0);
          const start = syncStartMsRef.current;
          const durationMs = start ? Math.max(0, Date.now() - start) : 0;
          setLastSyncStats({ total, durationMs });
          setIsSyncing(false);
          setSyncStartMs(null);
          setPendingCount(0);
          setTotalToSync(0);
          setProcessedCount(0);
          console.log('[SyncMonitor] 全量刷新统计:', { total, durationMs });
        } catch (e) {
          console.warn('[SyncMonitor] 统计本地数据量失败', e);
        }
      }
    };

    const handleConnect = () => {
      setSyncInfo(collaborativeService.getSyncInfo());
      if (!syncStartMsRef.current) {
        const now = Date.now();
        syncStartMsRef.current = now;
        setSyncStartMs(now);
      }
      setLogs(prev => [{
        id: Math.random().toString(36).substring(7),
        type: 'SYSTEM_CONNECTED',
        timestamp: new Date().toLocaleTimeString(),
        status: 'success' as const,
      }, ...prev].slice(0, 50));
    };

    const handleDisconnect = () => {
      setSyncInfo(collaborativeService.getSyncInfo());
      setLogs(prev => [{
        id: Math.random().toString(36).substring(7),
        type: 'SYSTEM_DISCONNECTED',
        timestamp: new Date().toLocaleTimeString(),
        status: 'failure' as const,
      }, ...prev].slice(0, 50));
      beepWarning();
    };

    collaborativeService.on('ledgerUpdate', handleUpdate);
    collaborativeService.on('globalUpdate', handleUpdate);
    collaborativeService.on('settingsUpdate', handleUpdate);
    collaborativeService.on('connect', handleConnect);
    collaborativeService.on('disconnect', handleDisconnect);

    // 监听离线同步服务的详细进度
    const handleSyncEvent: SyncListener = (event, data) => {
      if (event === 'start') {
        setTotalToSync(data?.total || 0);
        setPendingCount(data?.total || 0);
        if (!syncStartMs) setSyncStartMs(Date.now());
      } else if (event === 'progress') {
        const processed = data?.processed || 0;
        const total = data?.total || totalToSync;
        // 更新待处理数量
        setPendingCount(Math.max(0, total - processed));
        
        // 记录成功或失败项
        if (data?.item) {
          const typeStr = `${data.item.entity}_${data.item.action}`;
          const newLog: SyncLog = {
            id: Math.random().toString(36).substring(7),
            type: typeStr,
            timestamp: new Date().toLocaleTimeString(),
            status: data?.success ? 'success' : 'failure',
            data: { id: data.item.entityId }
          };
          setLogs(prev => [newLog, ...prev].slice(0, 50));
        }
      } else if (event === 'complete') {
        setSyncStartMs(null);
        setPendingCount(0);
        setTotalToSync(0);
        setSyncInfo(collaborativeService.getSyncInfo());
      } else if (event === 'error') {
        const newLog: SyncLog = {
          id: Math.random().toString(36).substring(7),
          type: 'SYNC_ERROR',
          timestamp: new Date().toLocaleTimeString(),
          status: 'failure',
          data
        };
        setLogs(prev => [newLog, ...prev].slice(0, 50));
      }
    };
    offlineSyncService.on(handleSyncEvent);

    // 较慢的轮询仅用于更新队列数量（当不处于同步状态时）和检查连接状态
    const timer = setInterval(async () => {
      const info = collaborativeService.getSyncInfo();
      setSyncInfo(info);
      
      // 仅在非同步状态下检查队列，避免冲突
      if (!offlineSyncService.isSyncing) {
        const count = await collaborativeService.getPendingQueueSize();
        setPendingCount(count);
      }

      // 检测错误计数变化并触发声音告警
      const currentErrCount = info.errors.length;
      if (currentErrCount > prevErrorCountRef.current) {
        beepWarning();
      }
      prevErrorCountRef.current = currentErrCount;
    }, 2000);

    return () => {
      collaborativeService.off('ledgerUpdate', handleUpdate);
      collaborativeService.off('globalUpdate', handleUpdate);
      collaborativeService.off('settingsUpdate', handleUpdate);
      collaborativeService.off('connect', handleConnect);
      collaborativeService.off('disconnect', handleDisconnect);
      offlineSyncService.off(handleSyncEvent);
      clearInterval(timer);
    };
  }, [visible, syncStartMs, beepWarning, totalToSync]);

  // 耗时定时器
  useEffect(() => {
    let timer: any;
    if (isSyncing) {
      timer = setInterval(() => {
        setTick(t => t + 1);
      }, 1000);
    }
    return () => clearInterval(timer);
  }, [isSyncing]);

  // 移除 ResizeObserver，因为它会导致与 box-sizing: border-box 的冲突，造成窗口自动缩小的动画效果
  // 窗口尺寸完全由 state 和 window resize 事件控制

  /**
   * 浏览器窗口变化时，自动适配并限制窗口尺寸与位置
   */
  useEffect(() => {
    const onWinResize = () => {
      const clamped = clampSizeAndPos(windowSize.width, windowSize.height, windowPos.x, windowPos.y);
      setWindowSize({ width: clamped.width, height: clamped.height });
      setWindowPos({ x: clamped.x, y: clamped.y });
      emitSizeChange(clamped.width, clamped.height);
      console.log('[SyncMonitor] 视口变化，已自动适配');
    };
    window.addEventListener('resize', onWinResize);
    return () => window.removeEventListener('resize', onWinResize);
  }, [clampSizeAndPos, emitSizeChange, windowSize.width, windowSize.height, windowPos.x, windowPos.y]);

  /**
   * 尺寸变更时同步通知
   */
  useEffect(() => {
    emitSizeChange(windowSize.width, windowSize.height);
  }, [windowSize.width, windowSize.height, emitSizeChange]);

  const handleForceSync = async () => {
    try {
      const now = Date.now();
      syncStartMsRef.current = now;
      setSyncStartMs(now);
      await collaborativeService.forceSync();
    } catch (err) {
      console.error('[SyncMonitor] 强制同步失败:', err);
    }
  };

  const handleExportLogs = () => {
    try {
      const blob = new Blob([JSON.stringify(logs, null, 2)], { type: 'application/json;charset=utf-8' });
      const filename = `sync-logs-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
      saveAs(blob, filename);
    } catch (error) {
      console.error('[SyncMonitor] 导出日志失败:', error);
    }
  };

  const handleDragStart = (e: React.MouseEvent) => {
    dragState.current.dragging = true;
    dragState.current.offsetX = e.clientX - windowPos.x;
    dragState.current.offsetY = e.clientY - windowPos.y;
    window.addEventListener('mousemove', handleDragMove);
    window.addEventListener('mouseup', handleDragEnd);
  };

  const handleDragMove = (e: MouseEvent) => {
    if (!dragState.current.dragging) return;
    const nextX = Math.min(Math.max(0, e.clientX - dragState.current.offsetX), window.innerWidth - windowSize.width);
    // 修复：防止标题栏移出屏幕上方，同时防止底部移出屏幕太远（至少保留 48px 可见）
    const nextY = Math.min(Math.max(0, e.clientY - dragState.current.offsetY), window.innerHeight - 48);
    setWindowPos({ x: nextX, y: nextY });
  };

  const handleDragEnd = () => {
    dragState.current.dragging = false;
    window.removeEventListener('mousemove', handleDragMove);
    window.removeEventListener('mouseup', handleDragEnd);
  };

  const formatSyncType = (type: string) => {
    const upperType = type.toUpperCase();
    const staticMap: Record<string, string> = {
      'MANUAL_FORCE_SYNC': '手动强制同步',
      'SYSTEM_CONNECTED': '系统已连接',
      'SYSTEM_DISCONNECTED': '系统已断开',
      'DATA_UPDATE': '数据更新',
      'RECONNECTED_SYNC': '重连同步',
    };
    if (staticMap[upperType]) return staticMap[upperType];

    const entityMap: Record<string, string> = {
      'TRANSACTION': '交易',
      'CATEGORY': '分类',
      'DEBT': '债务',
      'BUDGET': '预算',
      'LEDGER': '账本',
      'SETTINGS': '设置',
      'USER': '用户',
      'DEBT_PAYMENT': '债务还款',
    };
    
    const actionMap: Record<string, string> = {
      'CREATED': '新增',
      'UPDATED': '更新',
      'DELETED': '删除',
      'BATCH_DELETED': '批量删除',
      'BATCH_UPDATED': '批量更新',
      'REORDERED': '排序调整',
      'ADDED': '添加',
      'REMOVED': '移除',
      'CREATE': '新增',
      'UPDATE': '更新',
      'DELETE': '删除',
    };

    for (const actionKey in actionMap) {
      if (upperType.endsWith('_' + actionKey)) {
        const entityKey = upperType.replace('_' + actionKey, '');
        if (entityMap[entityKey]) {
          return `${entityMap[entityKey]}${actionMap[actionKey]}`;
        }
      }
    }
    return type;
  };

  if (!visible) return null;

  // 进度计算优化
  const currentPercent = totalToSync > 0 ? Math.min(100, Math.round((processedCount / totalToSync) * 100)) : 0;
  const currentElapsedSec = syncStartMs ? Math.max(0, Math.round((Date.now() - syncStartMs) / 1000)) : 0;
  const currentElapsedMs = syncStartMs ? Math.max(0, Date.now() - syncStartMs) : 0;

  // 显示逻辑：如果正在同步，显示实时数据；如果未同步且有上次记录，显示上次记录；否则显示 0
  const displayPercent = isSyncing ? currentPercent : (lastSyncStats ? 100 : 0);
  const displayTotal = isSyncing ? totalToSync : (lastSyncStats?.total || 0);
  // 耗时文案：优先显示秒；不足1秒时显示毫秒
  const displayElapsedText = isSyncing
    ? (currentElapsedSec >= 1 ? `${currentElapsedSec}s` : `${currentElapsedMs}ms`)
    : (lastSyncStats
        ? (lastSyncStats.durationMs >= 1000 ? `${Math.round(lastSyncStats.durationMs / 1000)}s` : `${lastSyncStats.durationMs}ms`)
        : '0s');
  // 剩余数量：始终显示当前队列真实条数（包括非同步状态下的轮询结果）
  const displayPending = pendingCount;

  return (
    <div
      ref={containerRef}
      style={{
        position: 'fixed',
        left: windowPos.x,
        top: windowPos.y,
        width: windowSize.width,
        height: isMinimized ? 48 : windowSize.height,
        minWidth: 480,
        minHeight: isMinimized ? 48 : 400,
        background: 'var(--color-bg-elevated)',
        backdropFilter: 'var(--glass-blur)',
        WebkitBackdropFilter: 'var(--glass-blur)' as any,
        border: '1px solid var(--color-glass-border)',
        borderRadius: '12px',
        boxShadow: 'var(--shadow-xl)',
        zIndex: 1200,
        resize: 'none',
        overflow: 'hidden',
        transition: 'none' // 禁止任何自动过渡动画
      }}
    >
      <div
        style={{
          position: 'absolute',
          left: -4,
          top: -4,
          width: 12,
          height: 12,
          cursor: 'nwse-resize',
          zIndex: 2
        }}
        onMouseDown={(e) => handleResizeStart('nw', e)}
      />
      <div
        style={{
          position: 'absolute',
          right: -4,
          top: -4,
          width: 12,
          height: 12,
          cursor: 'nesw-resize',
          zIndex: 2
        }}
        onMouseDown={(e) => handleResizeStart('ne', e)}
      />
      <div
        style={{
          position: 'absolute',
          left: -4,
          bottom: -4,
          width: 12,
          height: 12,
          cursor: 'nesw-resize',
          zIndex: 2
        }}
        onMouseDown={(e) => handleResizeStart('sw', e)}
      />
      <div
        style={{
          position: 'absolute',
          right: -4,
          bottom: -4,
          width: 12,
          height: 12,
          cursor: 'nwse-resize',
          zIndex: 2
        }}
        onMouseDown={(e) => handleResizeStart('se', e)}
      />
      {/* 标题栏 */}
      <div
        style={{
          height: 48,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0 12px',
          borderBottom: '1px solid var(--color-glass-border)',
          cursor: 'move',
          userSelect: 'none',
          background: 'var(--color-bg-glass)'
        }}
        onMouseDown={handleDragStart}
      >
        <Space>
          <SyncOutlined spin={isSyncing} style={{ color: isSyncing ? 'var(--color-primary)' : (syncInfo.isConnected ? 'var(--color-success)' : 'var(--color-error)') }} />
          <Text strong style={{ fontSize: 14, color: 'var(--color-text-primary)' }}>系统数据同步监控</Text>
        </Space>
        <Space>
          {pendingCount > 0 && (
            <Badge count={pendingCount} size="small" style={{ backgroundColor: 'var(--color-info)' }}>
              <Text type="secondary" style={{ fontSize: 12 }}>待处理</Text>
            </Badge>
          )}
          <Button size="small" type="text" icon={<MinusOutlined />} onClick={() => setIsMinimized(!isMinimized)} />
          <Button size="small" type="text" icon={<CloseOutlined />} onClick={onClose} />
        </Space>
      </div>

      {!isMinimized && (
        <div style={{ height: `calc(100% - 48px)`, overflow: 'auto', padding: 12 }}>
          {/* 状态概览 */}
          <div style={{ marginBottom: 16 }}>
            <Row gutter={[16, 16]}>
              <Col span={8}>
                <Text type="secondary">连接状态</Text>
                <div><Badge status={syncInfo.isConnected ? 'success' : 'error'} text={syncInfo.isConnected ? '已连接' : '已断开'} /></div>
              </Col>
              <Col span={8}>
                <Text type="secondary">最近同步</Text>
                <div><Text strong>{syncInfo.lastSyncTime ? syncInfo.lastSyncTime.toLocaleTimeString() : '从未同步'}</Text></div>
              </Col>
              <Col span={8}>
                <Text type="secondary">错误计数</Text>
                <div>
                  {(() => {
                    const errorCount = (Array.isArray(syncInfo.errors) ? syncInfo.errors.length : 0) + logs.filter(l => l.status === 'failure').length;
                    return <Badge showZero count={errorCount} style={{ backgroundColor: 'var(--color-error)' }} />;
                  })()}
                </div>
              </Col>
              <Col span={24}>
                <Text type="secondary">客户端 ID</Text>
                <div><Text code style={{ fontSize: 11 }}>{syncInfo.socketId || '未分配'}</Text></div>
              </Col>
            </Row>
          </div>

          {/* 进度条 */}
          <div style={{ marginBottom: 16 }}>
            <Row gutter={[16, 16]} align="middle">
              <Col span={18}>
                <Progress percent={displayPercent} status={isSyncing ? 'active' : (displayPercent === 100 ? 'success' : 'normal')} />
              </Col>
              <Col span={6}>
                <Space direction="vertical" size={2}>
                  <Text type="secondary" style={{ fontSize: 12 }}>总量: {displayTotal}</Text>
                  <Text type="secondary" style={{ fontSize: 12 }}>剩余: {displayPending}</Text>
                  <Text type="secondary" style={{ fontSize: 12 }}>耗时: {displayElapsedText}</Text>
                </Space>
              </Col>
            </Row>
          </div>

          {/* 操作按钮 */}
          <div style={{ marginBottom: 12 }}>
            <Space>
              <Button size="small" icon={<CloudSyncOutlined />} onClick={handleForceSync} loading={isSyncing}>强制同步</Button>
              <Button size="small" onClick={() => setLogs([])}>清除日志</Button>
              <Button size="small" onClick={handleExportLogs}>导出日志</Button>
            </Space>
          </div>

          {/* 异常告警 (使用折叠面板避免占用过多空间) */}
          {syncInfo.errors.length > 0 && (
            <div style={{ marginBottom: 12 }}>
              <Collapse ghost size="small">
                <Panel header={<Text type="danger">异常告警 ({syncInfo.errors.length})</Text>} key="1">
                   {syncInfo.errors.slice(-5).reverse().map((err, idx) => (
                    <Alert
                      key={idx}
                      message={err}
                      type="error"
                      showIcon
                      style={{ marginBottom: 8 }}
                    />
                  ))}
                  {syncInfo.errors.length > 5 && <Text type="secondary">...更多错误请查看控制台或导出日志</Text>}
                </Panel>
              </Collapse>
            </div>
          )}

          <Title level={5}>实时同步流水 ({logs.length})</Title>
          {logs.length === 0 ? (
            <Empty description="暂无同步记录" />
          ) : (
            <div>
              {logs.map((item) => (
                <div
                  key={item.id}
                  style={{
                    display: 'flex',
                    gap: 12,
                    alignItems: 'flex-start',
                    padding: '8px 0',
                    borderBottom: '1px solid rgba(255,255,255,0.1)'
                  }}
                >
                  <div style={{ fontSize: 16, lineHeight: '24px' }}>
                    {item.type === 'RECONNECTED_SYNC' ? (
                      <CloudSyncOutlined style={{ color: '#1890ff' }} />
                    ) : item.status === 'success' ? (
                      <CheckCircleOutlined style={{ color: '#52c41a' }} />
                    ) : (
                      <ExclamationCircleOutlined style={{ color: '#f5222d' }} />
                    )}
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <Text strong>{formatSyncType(item.type)}</Text>
                      {item.type === 'RECONNECTED_SYNC' && <Tag color="blue">数据补偿</Tag>}
                      {item.type === 'MANUAL_FORCE_SYNC' && <Tag color="purple">强制刷新</Tag>}
                    </div>
                    <div style={{ marginTop: 4 }}>
                      <Space direction="vertical" size={0} style={{ width: '100%' }}>
                        <Text type="secondary" style={{ fontSize: 12 }}>时间: {item.timestamp}</Text>
                        {item.data && item.data.id && (
                          <Text type="secondary" style={{ fontSize: 11, display: 'block' }}>
                            数据ID: {item.data.id}
                          </Text>
                        )}
                        <Tag color={item.type.includes('SYNC') ? 'processing' : 'green'}>
                          {item.type.includes('SYNC') ? '全量刷新成功' : '增量更新成功'}
                        </Tag>
                      </Space>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default SyncMonitor;
