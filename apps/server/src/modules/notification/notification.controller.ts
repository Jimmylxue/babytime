import { Controller, Get, Post, Put, Delete, Body, Param, Request, UseGuards, HttpCode } from '@nestjs/common';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { NotificationService } from './notification.service';
import { SetVaccinePlanDto } from './dto/set-vaccine-plan.dto';

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

  @UseGuards(JwtAuthGuard)
  @Get('status')
  async getStatus(@Request() req) {
    const data = await this.service.getUserVaccineStatus(req.user.id);
    return { code: 0, message: 'success', data };
  }

  @UseGuards(JwtAuthGuard)
  @Get('vaccine-plans/:babyId')
  async getVaccinePlans(@Param('babyId') babyId: string, @Request() req) {
    const data = await this.service.getVaccinePlans(req.user.id, babyId);
    return { code: 0, message: 'success', data };
  }

  @UseGuards(JwtAuthGuard)
  @Put('vaccine-plans/:babyId/:scheduleItemId')
  @HttpCode(200)
  async setVaccinePlan(
    @Param('babyId') babyId: string,
    @Param('scheduleItemId') scheduleItemId: string,
    @Request() req,
    @Body() body: SetVaccinePlanDto,
  ) {
    const data = await this.service.setVaccinePlan(req.user.id, babyId, scheduleItemId, body.scheduledDate);
    return { code: 0, message: '设置成功', data };
  }

  @UseGuards(JwtAuthGuard)
  @Delete('vaccine-plans/:babyId/:scheduleItemId')
  @HttpCode(200)
  async removeVaccinePlan(
    @Param('babyId') babyId: string,
    @Param('scheduleItemId') scheduleItemId: string,
    @Request() req,
  ) {
    const data = await this.service.removeVaccinePlan(req.user.id, babyId, scheduleItemId);
    return { code: 0, message: '已恢复参考日期', data };
  }
}
