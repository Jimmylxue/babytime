import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { NestExpressApplication } from '@nestjs/platform-express';
import type { NextFunction, Request, Response } from 'express';
import { existsSync } from 'fs';
import { join } from 'path';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);

  // 启用 CORS
  app.enableCors({
    origin: '*',
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE',
    credentials: true,
  });

  // 413 诊断：JSON 请求体超过 body-parser 默认的 100KB 会被拒成 413，
  // 而 pm2 日志里只有一串 stack、没有路径，看不出是谁发的。
  // Nest 要到 listen() 里才注册 body-parser，所以这里的 app.use 排在它前面；
  // 用 res 的 finish 事件而不是请求时判断，是因为分块传输没有 content-length，只有状态码不会漏。
  app.use((req: Request, res: Response, next: NextFunction) => {
    if (!/application\/json/i.test(String(req.headers['content-type'] ?? ''))) {
      return next();
    }
    res.on('finish', () => {
      if (res.statusCode !== 413) return;
      const ua = String(req.headers['user-agent'] ?? '-').slice(0, 120);
      console.warn(
        `[413] ${req.method} ${req.originalUrl} content-length=${req.headers['content-length'] ?? '-'}` +
          ` ip=${req.ip} x-forwarded-for=${req.headers['x-forwarded-for'] ?? '-'} ua=${ua}`,
      );
    });
    next();
  });

  // 全局验证管道
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  // API 前缀
  app.setGlobalPrefix('api');

  // 管理后台静态资源（apps/admin 构建产物），未构建时跳过，不影响本地开发
  const adminDistPath = process.env.ADMIN_DIST_PATH || join(__dirname, '..', '..', 'admin', 'dist');
  if (existsSync(join(adminDistPath, 'index.html'))) {
    app.useStaticAssets(adminDistPath, { prefix: '/admin', index: 'index.html' });
  }

  const port = process.env.PORT || 3000;
  // LISTEN_HOST 只在显式设置时才绑单个网卡（探活临时实例用 127.0.0.1，
  // 免得那几秒钟在 0.0.0.0 上多开一个可达端口）。
  // 不设时保持原样调用 listen(port) —— 不预先写死 '0.0.0.0'，否则会丢掉
  // Node 默认的双栈监听（::），nginx 反代若按 ::1 回源就会直接连不上。
  const host = process.env.LISTEN_HOST;

  // 优雅排空：Node 在没有信号监听器时收到 SIGINT/SIGTERM 是「立刻终止」的
  // （实测 6ms 退出），正在写记录的请求、正在传的图、最长 20s 的便便 AI 会被当场砍断。
  // 注册 shutdown hooks 后 Nest 会先停止接收新连接、等在途请求跑完，再走 onModuleDestroy
  // 清掉订阅消息定时器（不清的话事件循环有常驻句柄，进程退不干净、最后被 PM2 SIGKILL）。
  // 必须在 listen 之前注册。
  app.enableShutdownHooks();
  for (const signal of ['SIGTERM', 'SIGINT'] as const) {
    process.once(signal, () => console.log(`[shutdown] 收到 ${signal}，停止接新连接并排空在途请求`));
  }

  await (host ? app.listen(port, host) : app.listen(port));
  console.log(`🚀 服务运行在: http://${host || 'localhost'}:${port}`);

  // 排空只该花在「真正的在途请求」上，不该花在空闲 socket 上。
  // @nestjs/platform-express 的 close() 就是 `new Promise(r => httpServer.close(r))`，
  // 里面没有 closeIdleConnections() —— 已建立的 keep-alive 空闲连接要等 Node 默认
  // keepAliveTimeout(5s) 才释放。实测每次重启因此白等约 6.1s，而 PM2 默认 kill_timeout
  // 只有 1600ms：不主动断空闲连接，就得一直靠调大 kill_timeout 硬扛，而且上传一慢就被砍。
  // 小程序侧连接是复用的，这条一定会撞上。
  // 注：字段名是 httpServer（不是 server），由 adapter 源码核对过。
  const httpServer = (app.getHttpAdapter() as unknown as {
    httpServer?: import('http').Server;
  }).httpServer;

  if (httpServer && typeof httpServer.closeIdleConnections === 'function') {
    const releaseIdle = () => {
      // 信号到达时在途请求还没跑完，那个 socket 此刻**不算**空闲，只调
      // closeIdleConnections() 会漏掉它 —— 实测它响应完成后仍按默认 5s 挂在那里。
      // 所以同时把空闲超时压低：响应一结束就按这个时长回收，排空只等真正在途的请求。
      httpServer.keepAliveTimeout = 300;
      httpServer.closeIdleConnections();
    };
    for (const signal of ['SIGTERM', 'SIGINT'] as const) {
      process.once(signal, releaseIdle);
    }
    console.log('退出时会主动回收空闲 keep-alive 连接（避免排空白等 5s）');
  } else {
    console.warn('⚠️ 拿不到 http.Server 或不支持 closeIdleConnections，退出将只靠 PM2 的 kill_timeout 兜底');
  }
}
bootstrap();
