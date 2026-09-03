import { Controller, Get, Post, Body, Request, UseGuards, HttpCode } from '@nestjs/common';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { NotificationService } from './notification.service';

@Controller('notification')
export class NotificationController {
  constructor(private readonly service: NotificationService) {}

  @Get('config')
  getConfig() { return { code: 0, message: 'success', data: this.service.getConfig() }; }

  @UseGuards(JwtAuthGuard)
  @Post('subscriptions')
  @HttpCode(200)
  async saveSubscriptions(@Request() req, @Body() body: { statuses: Record<string, string> }) {
    const data = await this.service.saveGrants(req.user.id, body?.statuses || {});
    return { code: 0, message: 'success', data };
  }
}
