import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  Logger,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { LedgerGateway } from '../../ledgers/ledger.gateway';

/**
 * 数据更新生命周期日志拦截器
 * 记录从请求开始到数据写入完成再到推送通知的全过程
 */
@Injectable()
export class UpdateLifecycleInterceptor implements NestInterceptor {
  private readonly logger = new Logger('UpdateLifecycle');

  constructor(private readonly ledgerGateway: LedgerGateway) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const request = context.switchToHttp().getRequest();
    const { method, url, user } = request;
    const startTime = Date.now();
    const requestId = Math.random().toString(36).substring(7);

    // 只记录写操作
    const isWriteOperation = ['POST', 'PUT', 'PATCH', 'DELETE'].includes(method);
    if (!isWriteOperation) {
      return next.handle();
    }

    this.logger.log(`[${requestId}] 开始处理更新请求: ${method} ${url} (用户: ${user?.username || 'anonymous'})`);

    return next.handle().pipe(
      tap(() => {
        const endTime = Date.now();
        const duration = endTime - startTime;
        
        this.logger.log(`[${requestId}] 数据库写入完成, 耗时: ${duration}ms`);
        
        // 500ms 写入性能监控
        if (duration > 500) {
          this.logger.warn(`[${requestId}] 警告: 数据库写入耗时超过 500ms (${duration}ms)`);
        }
      }),
    );
  }
}
