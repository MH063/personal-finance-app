import { ConsoleLogger, Injectable } from '@nestjs/common';
import { maskIPInString } from '../utils/ip.util';

/**
 * 自定义脱敏日志类
 * 继承自 NestJS 的 ConsoleLogger，重写日志输出方法以实现 IP 脱敏
 */
@Injectable()
export class MaskedLogger extends ConsoleLogger {
  /**
   * 重写 log 方法
   */
  log(message: any, ...optionalParams: any[]) {
    super.log(this.maskMessage(message), ...optionalParams);
  }

  /**
   * 重写 error 方法
   */
  error(message: any, ...optionalParams: any[]) {
    super.error(this.maskMessage(message), ...optionalParams);
  }

  /**
   * 重写 warn 方法
   */
  warn(message: any, ...optionalParams: any[]) {
    super.warn(this.maskMessage(message), ...optionalParams);
  }

  /**
   * 重写 debug 方法
   */
  debug(message: any, ...optionalParams: any[]) {
    super.debug(this.maskMessage(message), ...optionalParams);
  }

  /**
   * 重写 verbose 方法
   */
  verbose(message: any, ...optionalParams: any[]) {
    super.verbose(this.maskMessage(message), ...optionalParams);
  }

  /**
   * 对消息进行脱敏处理
   * @param message 原始消息
   * @returns 脱敏后的消息
   */
  private maskMessage(message: any): any {
    if (typeof message === 'string') {
      return maskIPInString(message);
    }
    // 如果是对象，则尝试对对象中的字符串进行脱敏（可选，目前主要针对字符串）
    if (typeof message === 'object' && message !== null) {
      try {
        const json = JSON.stringify(message);
        const maskedJson = maskIPInString(json);
        return JSON.parse(maskedJson);
      } catch {
        return message;
      }
    }
    return message;
  }
}
