import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { AppService } from './app.service';
import { SkipTransform } from './common/interceptors/transform.interceptor';

@Controller()
export class AppController {
  constructor(
    private readonly appService: AppService,
    @InjectDataSource() private readonly dataSource: DataSource,
  ) {}

  @Get()
  getHello(): string {
    return this.appService.getHello();
  }

  /**
   * 必须真查库。之前无条件返回 ok，MySQL 挂了它照样说健康 ——
   * 任何拿这个端点做验收的脚本（部署前探活、部署后自动回滚）都会误判为正常，
   * 所以「查库」是这个端点存在的唯一理由。
   */
  @SkipTransform()
  @Get('health')
  async healthCheck() {
    try {
      await this.dataSource.query('SELECT 1');
    } catch (error: any) {
      throw new ServiceUnavailableException(
        `数据库不可用：${error?.message ?? '未知错误'}`,
      );
    }
    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
    };
  }
}
