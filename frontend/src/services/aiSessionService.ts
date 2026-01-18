import { db, AiSession, AiMessage } from '../db/db';
import { v4 as uuidv4 } from 'uuid';

/**
 * 创建新的会话，并持久化到本地存储
 */
export async function createSession(initialMessages: AiMessage[] = []): Promise<AiSession> {
  const now = Date.now();
  const session: AiSession = {
    id: uuidv4(),
    title: initialMessages[0]?.content?.slice(0, 20) || '新会话',
    createdAt: now,
    updatedAt: now,
    status: 'active',
    messageCount: initialMessages.length,
    messages: [...initialMessages],
  };
  try {
    await db.transaction('rw', [db.aiSessions, db.aiClientLogs], async () => {
      await db.aiSessions.add(session);
      await db.aiClientLogs.add({
        action: 'CREATE_SESSION',
        sessionId: session.id,
        timestamp: now,
        detail: `title=${session.title}`,
      });
      localStorage.setItem('aiCurrentSessionId', session.id);
    });
  } catch (e) {
    const key = 'aiSessions_fallback';
    const list = JSON.parse(localStorage.getItem(key) || '[]');
    list.push(session);
    localStorage.setItem(key, JSON.stringify(list));
    localStorage.setItem('aiCurrentSessionId', session.id);
    const logsKey = 'aiClientLogs_fallback';
    const logs = JSON.parse(localStorage.getItem(logsKey) || '[]');
    logs.push({ action: 'CREATE_SESSION', sessionId: session.id, timestamp: now, detail: `title=${session.title}` });
    localStorage.setItem(logsKey, JSON.stringify(logs));
  }
  return session;
}

/**
 * 读取当前会话，如果没有则返回 null
 */
export async function getCurrentSession(): Promise<AiSession | null> {
  const id = localStorage.getItem('aiCurrentSessionId');
  if (!id) return null;
  try {
    const session = await db.aiSessions.get(id);
    return session || null;
  } catch {
    const list = JSON.parse(localStorage.getItem('aiSessions_fallback') || '[]');
    return list.find((s: AiSession) => s.id === id) || null;
  }
}

/**
 * 设置当前会话 ID
 */
export function setCurrentSessionId(id: string) {
  localStorage.setItem('aiCurrentSessionId', id);
}

/**
 * 在会话中追加一条消息（原子化持久化）
 */
export async function appendMessage(sessionId: string, message: AiMessage): Promise<void> {
  const now = Date.now();
  try {
    await db.transaction('rw', [db.aiSessions, db.aiClientLogs], async () => {
      const s = await db.aiSessions.get(sessionId);
      if (!s) return;
      s.messages.push(message);
      s.messageCount = s.messages.length;
      s.updatedAt = now;
      await db.aiSessions.put(s);
      await db.aiClientLogs.add({
        action: 'APPEND_MESSAGE',
        sessionId,
        timestamp: now,
        detail: `role=${message.role},len=${message.content.length}`,
      });
    });
  } catch {
    const key = 'aiSessions_fallback';
    const list: AiSession[] = JSON.parse(localStorage.getItem(key) || '[]');
    const idx = list.findIndex(s => s.id === sessionId);
    if (idx >= 0) {
      list[idx].messages.push(message);
      list[idx].messageCount = list[idx].messages.length;
      list[idx].updatedAt = now;
      localStorage.setItem(key, JSON.stringify(list));
    }
    const logsKey = 'aiClientLogs_fallback';
    const logs = JSON.parse(localStorage.getItem(logsKey) || '[]');
    logs.push({ action: 'APPEND_MESSAGE', sessionId, timestamp: now });
    localStorage.setItem(logsKey, JSON.stringify(logs));
  }
}

/**
 * 切换会话的暂停/继续状态
 */
export async function setPaused(sessionId: string, paused: boolean): Promise<void> {
  const now = Date.now();
  try {
    await db.transaction('rw', [db.aiSessions, db.aiClientLogs], async () => {
      const s = await db.aiSessions.get(sessionId);
      if (!s) return;
      s.status = paused ? 'paused' : 'active';
      s.updatedAt = now;
      await db.aiSessions.put(s);
      await db.aiClientLogs.add({
        action: paused ? 'PAUSE' : 'RESUME',
        sessionId,
        timestamp: now,
      });
    });
  } catch {
    const key = 'aiSessions_fallback';
    const list: AiSession[] = JSON.parse(localStorage.getItem(key) || '[]');
    const idx = list.findIndex(s => s.id === sessionId);
    if (idx >= 0) {
      list[idx].status = paused ? 'paused' : 'active';
      list[idx].updatedAt = now;
      localStorage.setItem(key, JSON.stringify(list));
    }
    const logsKey = 'aiClientLogs_fallback';
    const logs = JSON.parse(localStorage.getItem(logsKey) || '[]');
    logs.push({ action: paused ? 'PAUSE' : 'RESUME', sessionId, timestamp: now });
    localStorage.setItem(logsKey, JSON.stringify(logs));
  }
}

/**
 * 获取历史会话列表，按更新时间倒序
 */
export async function listSessions(): Promise<AiSession[]> {
  try {
    const all = await db.aiSessions.toArray();
    return all.sort((a, b) => b.updatedAt - a.updatedAt);
  } catch {
    const list: AiSession[] = JSON.parse(localStorage.getItem('aiSessions_fallback') || '[]');
    return list.sort((a, b) => b.updatedAt - a.updatedAt);
  }
}

/**
 * 批量删除会话（原子化），并释放存储
 */
export async function deleteSessions(ids: string[]): Promise<number> {
  const now = Date.now();
  try {
    let deleted = 0;
    await db.transaction('rw', [db.aiSessions, db.aiClientLogs], async () => {
      await db.aiSessions.where('id').anyOf(ids).delete();
      deleted = ids.length;
      await db.aiClientLogs.add({
        action: 'DELETE_BATCH',
        timestamp: now,
        detail: `count=${ids.length}`,
      });
    });
    const current = localStorage.getItem('aiCurrentSessionId');
    if (current && ids.includes(current)) {
      localStorage.removeItem('aiCurrentSessionId');
    }
    return deleted;
  } catch {
    const key = 'aiSessions_fallback';
    const list: AiSession[] = JSON.parse(localStorage.getItem(key) || '[]');
    const remain = list.filter(s => !ids.includes(s.id));
    const deleted = list.length - remain.length;
    localStorage.setItem(key, JSON.stringify(remain));
    const logsKey = 'aiClientLogs_fallback';
    const logs = JSON.parse(localStorage.getItem(logsKey) || '[]');
    logs.push({ action: 'DELETE_BATCH', timestamp: now, detail: `count=${ids.length}` });
    localStorage.setItem(logsKey, JSON.stringify(logs));
    const current = localStorage.getItem('aiCurrentSessionId');
    if (current && ids.includes(current)) {
      localStorage.removeItem('aiCurrentSessionId');
    }
    return deleted;
  }
}

/**
 * 删除单个会话
 */
export async function deleteSession(id: string): Promise<boolean> {
  return (await deleteSessions([id])) > 0;
}

