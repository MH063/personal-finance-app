import { Injectable, NestInterceptor, ExecutionContext, CallHandler, Logger } from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { TransactionLog, LogAction, EntityType } from '../../entities/transaction-log.entity';

/**
 * 审计日志拦截器
 * 用于记录关键业务操作的变更日志
 */
@Injectable()
export class AuditInterceptor implements NestInterceptor {
  private readonly logger = new Logger(AuditInterceptor.name);

  constructor(
    @InjectRepository(TransactionLog)
    private readonly logRepository: Repository<TransactionLog>,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const request = context.switchToHttp().getRequest();
    const { method, url, user, body, ip, headers } = request;

    // 只记录修改操作
    if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) {
      return next.handle();
    }

    return next.handle().pipe(
      tap(async (data) => {
        try {
          if (!user) return;

          const action = this.mapMethodToAction(method);
          const entityInfo = this.parseEntityInfo(url);

          if (!entityInfo) return;

          const log = this.logRepository.create({
            userId: user.id,
            action,
            entityType: entityInfo.type,
            entityId: data?.id || body?.id || entityInfo.id || 'unknown',
            newData: method !== 'DELETE' ? data || undefined : undefined,
            oldData: undefined, // 在拦截器中获取旧数据较复杂，通常在 Service 层处理，这里记录关键操作
            ipAddress: ip,
            userAgent: headers['user-agent'],
          });

          await this.logRepository.save(log);
        } catch (error: any) {
          this.logger.error('Failed to save audit log:', error?.stack);
        }
      }),
    );
  }

  private mapMethodToAction(method: string): LogAction {
    switch (method) {
      case 'POST':
        return LogAction.CREATE;
      case 'PUT':
      case 'PATCH':
        return LogAction.UPDATE;
      case 'DELETE':
        return LogAction.DELETE;
      default:
        return LogAction.UPDATE;
    }
  }

  private parseEntityInfo(url: string): { type: EntityType; id?: string } | null {
    const parts = url.split('/').filter((p) => p && p !== 'api' && p !== 'v1');
    if (parts.length === 0) return null;

    const entityName = parts[0];
    const id = parts[1];

    let type: EntityType;
    switch (entityName) {
      case 'transactions':
        type = EntityType.TRANSACTION;
        break;
      case 'categories':
        type = EntityType.CATEGORY;
        break;
      case 'debts':
        type = EntityType.DEBT;
        break;
      case 'settings':
        type = EntityType.SETTINGS;
        break;
      case 'users':
        type = EntityType.USER;
        break;
      case 'budgets':
        type = EntityType.BUDGET;
        break;
      default:
        return null;
    }

    return { type, id };
  }
}
