import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { NestExpressApplication } from '@nestjs/platform-express';
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
