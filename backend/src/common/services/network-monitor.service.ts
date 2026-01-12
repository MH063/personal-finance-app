import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { getLocalIPs, getPrimaryIP, maskIP, maskIPInString } from '../utils/ip.util';

/**
 * 网络监控服务
 * 负责实时监控本机 IP 地址变化，并记录日志
 */
@Injectable()
export class NetworkMonitorService implements OnModuleInit {
  private readonly logger = new Logger(NetworkMonitorService.name);
  private lastIPs: { v4: string[]; v6: string[] } = { v4: [], v6: [] };
  private primaryIP: string = '';

  onModuleInit() {
    this.lastIPs = getLocalIPs();
    this.primaryIP = getPrimaryIP();
    this.logger.log(`网络监控服务已启动。当前主 IP: ${maskIP(this.primaryIP)}`);
    this.logger.debug(`检测到的 IPv4 地址: ${this.lastIPs.v4.map(maskIP).join(', ')}`);
    this.logger.debug(`检测到的 IPv6 地址: ${this.lastIPs.v6.map(maskIP).join(', ')}`);
  }

  /**
   * 每 20 秒检查一次 IP 地址变化
   * 满足用户需求中 "变更响应时间不超过 30 秒" 的要求
   */
  @Interval(20000)
  handleIPCheck() {
    try {
      const currentIPs = getLocalIPs();
      const currentPrimaryIP = getPrimaryIP();

      // 检查 IPv4 列表是否发生变化
      const v4Changed = this.isArrayChanged(this.lastIPs.v4, currentIPs.v4);
      const v6Changed = this.isArrayChanged(this.lastIPs.v6, currentIPs.v6);

      if (v4Changed || v6Changed) {
        this.logger.warn('检测到本机网络接口 IP 地址发生变化！');
        
        if (v4Changed) {
          const oldV4 = this.lastIPs.v4.map(maskIP).join(', ');
          const newV4 = currentIPs.v4.map(maskIP).join(', ');
          this.logger.log(`IPv4 变更: [${oldV4}] -> [${newV4}]`);
        }
        
        if (v6Changed) {
          const oldV6 = this.lastIPs.v6.map(maskIP).join(', ');
          const newV6 = currentIPs.v6.map(maskIP).join(', ');
          this.logger.log(`IPv6 变更: [${oldV6}] -> [${newV6}]`);
        }

        if (this.primaryIP !== currentPrimaryIP) {
          this.logger.warn(`主 IP 已从 ${maskIP(this.primaryIP)} 变更为 ${maskIP(currentPrimaryIP)}`);
          this.primaryIP = currentPrimaryIP;
          
          // 这里可以触发进一步的通知逻辑，例如发送邮件或更新外部服务
          this.notifyIPChange(currentPrimaryIP);
        }

        this.lastIPs = currentIPs;
      }
    } catch (error: any) {
      this.logger.error(`检查 IP 地址时发生错误: ${error.message}`);
      // 故障恢复机制：由于使用了 @Interval，它会自动在下一个周期重试
    }
  }

  /**
   * 模拟 IP 变更通知机制
   */
  private notifyIPChange(newIP: string) {
    this.logger.log(`[通知] 系统已自动适应新的 IP 地址: ${maskIP(newIP)}`);
    // 实际项目中可以调用第三方 Webhook 或发送通知
  }

  /**
   * 比较两个数组是否相同
   */
  private isArrayChanged(oldArr: string[], newArr: string[]): boolean {
    if (oldArr.length !== newArr.length) return true;
    const sortedOld = [...oldArr].sort();
    const sortedNew = [...newArr].sort();
    return sortedOld.some((val, index) => val !== sortedNew[index]);
  }
}
