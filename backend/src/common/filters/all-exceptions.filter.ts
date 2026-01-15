import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { maskIPInString } from '../utils/ip.util';
import { OptimisticLockVersionMismatchError } from 'typeorm';

/**
 * 全局异常过滤器
 * 统一处理应用中抛出的所有异常，并返回标准化的错误响应
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    let status =
      exception instanceof HttpException ? exception.getStatus() : HttpStatus.INTERNAL_SERVER_ERROR;

    let message = (exception as any).message || 'Internal server error';

    // 处理 TypeORM 乐观锁冲突错误
    if (exception instanceof OptimisticLockVersionMismatchError) {
      status = HttpStatus.CONFLICT;
      message = '数据已被其他操作更新，请刷新后重试';
    } else if (exception instanceof HttpException) {
      const exceptionResponse = exception.getResponse();
      message =
        typeof exceptionResponse === 'object' && 'message' in exceptionResponse
          ? (exceptionResponse as any).message
          : exceptionResponse;
    }

    const errorResponse = {
      success: false,
      statusCode: status,
      timestamp: new Date().toISOString(),
      path: request.url,
      message: Array.isArray(message) ? message[0] : message, // 处理 ValidationPipe 返回的数组
    };

    // 记录错误日志，并对敏感 IP 信息进行脱敏
    const logMessage = maskIPInString(
      `${request.method} ${request.url} - ${status} - ${JSON.stringify(errorResponse)}`,
    );

    if (status >= 500) {
      this.logger.error(logMessage, (exception as Error).stack);
    } else {
      this.logger.warn(maskIPInString(`${request.method} ${request.url} - ${status} - ${message}`));
    }

    response.status(status).json(errorResponse);
  }
}
