import { Controller, Get } from '@nestjs/common';
import { SystemSettingsService } from './system-settings.service';

@Controller('system')
export class SystemConfigController {
  constructor(private readonly settingsService: SystemSettingsService) {}

  // 公开配置：小程序发布页用来决定是否展示「原图」选项
  @Get('config')
  async getConfig() {
    return this.settingsService.getClientConfig();
  }
}
