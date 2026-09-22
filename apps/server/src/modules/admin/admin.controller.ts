import {
  Controller,
  Body,
  Get,
  Param,
  Post,
  Put,
  Query,
  Request,
  ServiceUnavailableException,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { AdminAnnouncementService } from './admin-announcement.service';
import { AdminAuthService } from './admin-auth.service';
import { AdminBabyService } from './admin-baby.service';
import { AdminStatsService } from './admin-stats.service';
import { OpsHealthService } from './ops-health.service';
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
    private readonly opsHealthService: OpsHealthService,
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
  @Get('stats/vaccine-funnel')
  async getVaccineFunnel() {
    const data = await this.adminStatsService.getVaccineFunnel();
    return { code: 0, message: 'success', data };
  }

  @UseGuards(AdminJwtGuard)
  @Get('stats/album')
  async getAlbumMetrics() {
    const data = await this.adminStatsService.getAlbumMetrics();
    return { code: 0, message: 'success', data };
  }

  @UseGuards(AdminJwtGuard)
  @Get('stats/tools')
  async getToolsMetrics() {
    const data = await this.adminStatsService.getToolsMetrics();
    return { code: 0, message: 'success', data };
  }

  @UseGuards(AdminJwtGuard)
  @Get('ops/https')
  async getHttpsHealth(@Query('refresh') refresh?: string) {
    const data = await this.opsHealthService.getHttpsStatus(refresh === '1');
    return { code: 0, message: 'success', data };
  }

  /**
   * 供服务器 crontab 每天调用，没有登录态所以不走 AdminJwtGuard，
   * 用 .env 里的 OPS_ALERT_TOKEN 做单一凭据；未配置时直接禁用（宁可漏报，不敞开一个公网写接口）。
   */
  @Post('ops/alert-check')
  async alertCheck(@Body() body: { token?: string }) {
    const expected = process.env.OPS_ALERT_TOKEN;
    if (!expected) throw new ServiceUnavailableException('OPS_ALERT_TOKEN 未配置，告警接口已禁用');
    if (body?.token !== expected) throw new UnauthorizedException('token 不正确');

    const data = await this.opsHealthService.runAlertCheck();
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
  @Get('babies/:id/photos')
  async getBabyPhotos(
    @Request() req,
    @Param('id') id: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    // 经 nginx 反代时 req.ip 是回环地址，优先取转发链里的真实来源 IP
    const forwarded = (req.headers?.['x-forwarded-for'] as string | undefined)?.split(',')[0]?.trim();
    const data = await this.adminBabyService.getBabyPhotos(
      id,
      Number(page) || 1,
      Number(pageSize) || 24,
      req.user?.username || 'admin',
      forwarded || req.ip || null,
    );
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
  @Get('users/:userId/babies')
  async getUserBabies(@Param('userId') userId: string) {
    const data = await this.adminStatsService.getUserBabies(userId);
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
    @Query('template') template?: string,
  ) {
    const kind = template === 'review' ? 'review' : 'vaccine';
    const data = await this.notificationService.listSubscribedUsers(
      Number(page) || 1,
      Number(pageSize) || 20,
      keyword?.trim() || undefined,
      kind,
    );
    return { code: 0, message: 'success', data };
  }

  @UseGuards(AdminJwtGuard)
  @Post('notifications/test')
  async sendNotificationTest(
    @Request() req,
    @Body() body: { userId?: string; babyId?: string; template?: 'vaccine' | 'review' },
  ) {
    if (!body?.userId) return { code: 400, message: '请选择已订阅用户' };
    const triggeredBy = req.user?.username || 'admin';
    // template=review 走每日回顾模板（字段格式与疫苗不同，各自独立的额度）
    const data = body.template === 'review'
      ? await this.notificationService.sendManualReview(body.userId, triggeredBy)
      : await this.notificationService.sendManualVaccine(body.userId, body.babyId, triggeredBy);
    return { code: 0, message: 'success', data };
  }
}
