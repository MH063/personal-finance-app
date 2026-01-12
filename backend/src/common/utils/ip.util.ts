import { networkInterfaces } from 'os';

/**
 * 获取本机所有 IPv4 和 IPv6 地址
 * @returns { v4: string[], v6: string[] } 包含 IPv4 和 IPv6 地址的对象
 */
export function getLocalIPs(): { v4: string[]; v6: string[] } {
  const interfaces = networkInterfaces();
  const v4: string[] = [];
  const v6: string[] = [];

  for (const name of Object.keys(interfaces)) {
    const iface = interfaces[name];
    if (!iface) continue;

    for (const info of iface) {
      // 忽略回环地址和非有效地址
      if (info.internal) continue;

      if (info.family === 'IPv4') {
        v4.push(info.address);
      } else if (info.family === 'IPv6') {
        v6.push(info.address);
      }
    }
  }

  return { v4, v6 };
}

/**
 * 获取第一个有效的本机 IPv4 地址
 * @returns {string} IPv4 地址，如果未找到则返回 '127.0.0.1'
 */
export function getPrimaryIP(): string {
  const { v4 } = getLocalIPs();
  return v4.length > 0 ? v4[0] : '127.0.0.1';
}

/**
 * 对 IP 地址进行脱敏掩码处理
 * 例如: ***.***.**.** -> ***.***.*.*
 * @param ip 原始 IP 地址
 * @returns 脱敏后的 IP 地址
 */
export function maskIP(ip: string): string {
  if (!ip) return ip;

  // IPv4 匹配正则表达式
  const ipv4Regex = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;
  const v4Match = ip.match(ipv4Regex);

  if (v4Match) {
    return v4Match
      .slice(1)
      .map((segment) => '*'.repeat(segment.length))
      .join('.');
  }

  // IPv6 简单脱敏 (由于 IPv6 格式复杂，这里仅对非回环地址做简单处理)
  if (ip.includes(':') && ip !== '::1') {
    return ip
      .split(':')
      .map((segment) => (segment.length > 0 ? '*'.repeat(Math.min(segment.length, 4)) : ''))
      .join(':');
  }

  return ip;
}

/**
 * 字符串中的 IP 地址脱敏处理
 * 用于全局日志脱敏
 * @param message 包含 IP 的字符串消息
 * @returns 脱敏后的消息
 */
export function maskIPInString(message: string): string {
  if (typeof message !== 'string') return message;

  // IPv4 正则匹配 (全局)
  const ipv4GlobalRegex = /\b(?:\d{1,3}\.){3}\d{1,3}\b/g;

  let maskedMessage = message.replace(ipv4GlobalRegex, (match) => {
    return maskIP(match);
  });

  // UUID 脱敏
  const uuidGlobalRegex = /\b[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}\b/g;
  maskedMessage = maskedMessage.replace(uuidGlobalRegex, '********-****-****-****-************');

  // Socket.io ID 脱敏 (20位字符，包含字母数字下划线连字符)
  // 注意：这个正则可能会误伤其他类似格式的 ID，但在日志场景下通常是可以接受的
  // 仅匹配日志中常见的模式，如 "用户已连接: xxxxx (SocketID)"
  const socketIdRegex = /([a-zA-Z0-9_-]{20})/g;
  maskedMessage = maskedMessage.replace(socketIdRegex, (match) => {
      // 避免误伤常用的短单词，只脱敏那些看起来像 ID 的随机字符串
      if (match.length === 20) {
        return '********************';
      }
      return match;
  });

  // Terminal ID 脱敏 (例如: Terminal#1009-1010)
  const terminalIdRegex = /Terminal#\d+-\d+/g;
  maskedMessage = maskedMessage.replace(terminalIdRegex, '*');

  return maskedMessage;
}

/**
 * 验证 IP 地址是否属于本机接口
 * @param ip 要验证的 IP 地址
 * @returns {boolean} 是否为本机地址
 */
export function isLocalIP(ip: string): boolean {
  if (ip === 'localhost' || ip === '127.0.0.1' || ip === '::1') return true;
  const { v4, v6 } = getLocalIPs();
  return v4.includes(ip) || v6.includes(ip);
}
