import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';

/**
 * 兜住所有抛到路由层的异常，让错误响应与成功响应同构：{code, message, data}。
 * 之前错误走的是 Nest 默认的 {statusCode, message, error}，客户端只能靠
 * `res.data?.message` 猜，而 class-validator 的 message 是数组、toast 出来是乱码。
 *
 * HTTP 状态码保持不动：小程序侧的 request() 用 statusCode 判断成败（401 才触发
 * 静默续期），部署脚本用 `curl -sf` 判断健康，全部依赖非 2xx 语义。
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger('AllExceptions');

  catch(exception: unknown, host: ArgumentsHost) {
    if (host.getType() !== 'http') {
      throw exception;
    }

    const ctx = host.switchToHttp();
    const res = ctx.getResponse<Response>();
    const req = ctx.getRequest<Request>();
    const { status, message } = describe(exception);

    // 4xx 是预期内的业务拒绝，不进 error；5xx 与未知异常才需要留栈
    if (status >= 500) {
      this.logger.error(`${req.method} ${req.url} → ${status}`, stackOf(exception));
    }

    res.status(status).json({ code: status, message, data: null });
  }
}

function describe(exception: unknown): { status: number; message: string } {
  if (!(exception instanceof HttpException)) {
    return { status: 500, message: '服务器出错了，请稍后重试' };
  }

  const status = exception.getStatus();
  const body = exception.getResponse();
  const raw = typeof body === 'string' ? body : (body as { message?: unknown })?.message;
  return { status, message: flatten(raw) || exception.message || '请求失败' };
}

/** ValidationPipe 抛的是英文句子数组，拼成一句中文 toast 读得下去 */
function flatten(message: unknown): string {
  if (Array.isArray(message)) {
    return message.map((item) => String(item)).join('；');
  }
  return typeof message === 'string' ? message : '';
}

function stackOf(exception: unknown): string {
  return exception instanceof Error ? (exception.stack ?? exception.message) : String(exception);
}
