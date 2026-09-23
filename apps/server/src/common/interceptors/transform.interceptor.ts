import { CallHandler, ExecutionContext, Injectable, NestInterceptor, SetMetadata } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Observable, map } from 'rxjs';

/**
 * 标记在 handler 上：响应原样发出，不套 {code, message, data} 信封。
 * 用在 /api/health —— 它的契约是「部署脚本 grep '"status":"ok"'」，
 * 套上信封后 JSON 路径从 .status 变成 .data.status，仓库外的探活与拨测会读空。
 */
export const SKIP_TRANSFORM_KEY = 'skipTransform';

export const SkipTransform = () => SetMetadata(SKIP_TRANSFORM_KEY, true);

export interface ApiResponse<T> {
  code: number;
  message: string;
  data: T | null;
}

@Injectable()
export class TransformInterceptor<T> implements NestInterceptor<T, ApiResponse<T>> {
  constructor(private readonly reflector: Reflector) {}

  intercept(context: ExecutionContext, next: CallHandler<T>): Observable<ApiResponse<T>> {
    const skip = this.reflector.getAllAndOverride<boolean>(SKIP_TRANSFORM_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (skip) {
      // 断言只为复用同一条流；运行时原样透出，不做任何包装
      return next.handle() as unknown as Observable<ApiResponse<T>>;
    }
    return next.handle().pipe(map((data) => ({ code: 0, message: 'success', data: data ?? null })));
  }
}
