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
  await app.listen(port);
  console.log(`🚀 服务运行在: http://localhost:${port}`);
}
bootstrap();
