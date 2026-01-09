import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  StreamableFile,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { Response as ExpressResponse } from 'express';

/**
 * 响应数据封装接口
 */
export interface Response<T> {
  success: boolean;
  data: T;
  message?: string;
}

/**
 * 统一响应格式拦截器
 * 将返回的数据封装为 { success: true, data: result } 格式
 * 排除 StreamableFile 和已经设置了响应头的请求
 */
@Injectable()
export class TransformInterceptor<T> implements NestInterceptor<T, Response<T> | T> {
  intercept(context: ExecutionContext, next: CallHandler): Observable<Response<T> | T> {
    const response = context.switchToHttp().getResponse<ExpressResponse>();

    return next.handle().pipe(
      map((data) => {
        // 如果是 StreamableFile，直接返回
        if (data instanceof StreamableFile) {
          return data;
        }

        // 如果已经发送了响应头或这是下载请求，则不进行封装
        if (response.headersSent || response.getHeader('Content-Disposition')) {
          return data;
        }

        return {
          success: true,
          data: data,
        };
      }),
    );
  }
}
