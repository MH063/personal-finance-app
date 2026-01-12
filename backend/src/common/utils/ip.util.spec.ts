import { maskIP, maskIPInString } from './ip.util';

describe('IP 脱敏工具 (ip.util)', () => {
  describe('maskIP', () => {
    it('应该正确脱敏 IPv4 地址 (3.3.1.1 格式)', () => {
      expect(maskIP('192.168.1.1')).toBe('***.***.*.*');
    });

    it('应该正确脱敏 IPv4 地址 (1.2.3.4 格式)', () => {
      expect(maskIP('1.2.3.4')).toBe('*.*.*.*');
    });

    it('应该正确脱敏 IPv4 地址 (10.0.0.255 格式)', () => {
      expect(maskIP('10.0.0.255')).toBe('**.*.*.***');
    });

    it('应该正确处理空值', () => {
      expect(maskIP('')).toBe('');
      expect(maskIP(null as any)).toBe(null);
    });

    it('应该正确脱敏 IPv6 地址', () => {
      const ipv6 = 'fe80::13c3:d758:5860:6c24';
      const masked = maskIP(ipv6);
      expect(masked).toContain(':');
      expect(masked).not.toContain('13c3');
    });

    it('不应脱敏 IPv6 回环地址', () => {
      expect(maskIP('::1')).toBe('::1');
    });
  });

  describe('maskIPInString', () => {
    it('应该脱敏字符串中的所有 IPv4 地址', () => {
      const message = '请求来自 192.168.1.1，目标是 10.0.0.5';
      expect(maskIPInString(message)).toBe('请求来自 ***.***.*.*，目标是 **.*.*.*');
    });

    it('不应影响字符串中的其他内容', () => {
      const message = '用户 123 登录成功，耗时 50ms';
      expect(maskIPInString(message)).toBe(message);
    });

    it('应该处理包含端口号的 IP (仅脱敏 IP 部分)', () => {
      const message = '服务运行在 192.168.1.100:4000';
      // 注意：正则表达式 \b 只匹配单词边界，: 可能被视为边界或非边界，取决于正则定义
      // 我们的正则 \b(?:\d{1,3}\.){3}\d{1,3}\b 应该能匹配到 IP 部分
      expect(maskIPInString(message)).toBe('服务运行在 ***.***.*.***:4000');
    });

    it('应该处理复杂日志消息', () => {
      const message = '[NetworkMonitorService] 检测到的 IPv4 地址: 192.168.68.27, 10.1.1.1';
      expect(maskIPInString(message)).toBe('[NetworkMonitorService] 检测到的 IPv4 地址: ***.***.**.**, **.*.*.*');
    });
  });
});
