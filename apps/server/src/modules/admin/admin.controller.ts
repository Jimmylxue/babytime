import { Controller, Body, Get, Param, Post, Put, Query, Request, UseGuards } from '@nestjs/common';
import { AdminAnnouncementService } from './admin-announcement.service';
import { AdminAuthService } from './admin-auth.service';
import { AdminBabyService } from './admin-baby.service';
import { AdminStatsService } from './admin-stats.service';
import { AdminLoginDto } from './dto/admin-login.dto';
import { CreateAnnouncementDto } from './dto/create-announcement.dto';
import { UpdateAnnouncementDto } from './dto/update-announcement.dto';
import { AdminJwtGuard } from './guards/admin-jwt.guard';
import { NotificationService } from '../notification/notification.service';

@Controller('admin')
export class AdminController {
  constructor(
    private readonly adminAuthService: AdminAuthService,
    private readonly adminStatsService: AdminStatsService,
    private readonly adminAnnouncementService: AdminAnnouncementService,
    private readonly adminBabyService: AdminBabyService,
    private readonly notificationService: NotificationService,
  ) {}

  @Post('auth/login')
  async login(@Body() dto: AdminLoginDto) {
    const data = await this.adminAuthService.login(dto.username, dto.password);
    return { code: 0, message: 'success', data };
  }

  @UseGuards(AdminJwtGuard)
  @Get('stats/overview')
  async getOverview() {
    const data = await this.adminStatsService.getOverview();
    return { code: 0, message: 'success', data };
  }

  @UseGuards(AdminJwtGuard)
  @Get('stats/trends')
  async getTrends(@Query('days') days?: string) {
    const data = await this.adminStatsService.getTrends(Number(days) || 30);
    return { code: 0, message: 'success', data };
  }

  @UseGuards(AdminJwtGuard)
  @Get('stats/distribution')
  async getDistribution() {
    const data = await this.adminStatsService.getDistribution();
    return { code: 0, message: 'success', data };
  }

  @UseGuards(AdminJwtGuard)
  @Get('stats/funnel')
  async getFunnel() {
    const data = await this.adminStatsService.getFunnel();
    return { code: 0, message: 'success', data };
  }

  @UseGuards(AdminJwtGuard)
  @Get('stats/retention')
  async getRetention(@Query('days') days?: string) {
    const data = await this.adminStatsService.getRetention(Number(days) || 90);
    return { code: 0, message: 'success', data };
  }

  @UseGuards(AdminJwtGuard)
  @Get('stats/engagement')
  async getEngagement() {
    const data = await this.adminStatsService.getEngagement();
    return { code: 0, message: 'success', data };
  }

  @UseGuards(AdminJwtGuard)
  @Get('babies')
  async getBabies(
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
    @Query('keyword') keyword?: string,
    @Query('sort') sort?: string,
  ) {
    const data = await this.adminBabyService.getBabies(
      Number(page) || 1,
      Number(pageSize) || 20,
      keyword?.trim() || undefined,
      sort || 'active',
    );
    return { code: 0, message: 'success', data };
  }

  @UseGuards(AdminJwtGuard)
  @Get('babies/:id')
  async getBabyDetail(@Param('id') id: string) {
    const data = await this.adminBabyService.getBabyDetail(id);
    return { code: 0, message: 'success', data };
  }

  @UseGuards(AdminJwtGuard)
  @Get('users')
  async getUsers(
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
    @Query('keyword') keyword?: string,
  ) {
    const data = await this.adminStatsService.getUsers(
      Number(page) || 1,
      Number(pageSize) || 20,
      keyword?.trim() || undefined,
    );
    return { code: 0, message: 'success', data };
  }

  @UseGuards(AdminJwtGuard)
  @Get('announcements')
  async listAnnouncements() {
    const data = await this.adminAnnouncementService.list();
    return { code: 0, message: 'success', data };
  }

  @UseGuards(AdminJwtGuard)
  @Post('announcements')
  async createAnnouncement(@Body() dto: CreateAnnouncementDto) {
    const data = await this.adminAnnouncementService.create(dto);
    return { code: 0, message: 'success', data };
  }

  @UseGuards(AdminJwtGuard)
  @Put('announcements/:id')
  async updateAnnouncement(@Param('id') id: string, @Body() dto: UpdateAnnouncementDto) {
    const data = await this.adminAnnouncementService.update(id, dto);
    return { code: 0, message: 'success', data };
  }

  @UseGuards(AdminJwtGuard)
  @Get('notifications/subscriptions')
  async listNotificationSubscriptions(
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
    @Query('keyword') keyword?: string,
  ) {
    const data = await this.notificationService.listSubscribedUsers(Number(page) || 1, Number(pageSize) || 20, keyword?.trim() || undefined);
    return { code: 0, message: 'success', data };
  }

  @UseGuards(AdminJwtGuard)
  @Post('notifications/test')
  async sendNotificationTest(@Request() req, @Body() body: { userId?: string; babyId?: string }) {
    if (!body?.userId) return { code: 400, message: '请选择已订阅用户' };
    const data = await this.notificationService.sendManualVaccine(body.userId, body.babyId, req.user?.username || 'admin');
    return { code: 0, message: 'success', data };
  }
}
