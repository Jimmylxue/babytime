import { Controller, Body, Get, Param, Post, Put, Query, UseGuards } from '@nestjs/common';
import { AdminAnnouncementService } from './admin-announcement.service';
import { AdminAuthService } from './admin-auth.service';
import { AdminBabyService } from './admin-baby.service';
import { AdminStatsService } from './admin-stats.service';
import { AdminLoginDto } from './dto/admin-login.dto';
import { CreateAnnouncementDto } from './dto/create-announcement.dto';
import { UpdateAnnouncementDto } from './dto/update-announcement.dto';
import { AdminJwtGuard } from './guards/admin-jwt.guard';

@Controller('admin')
export class AdminController {
  constructor(
    private readonly adminAuthService: AdminAuthService,
    private readonly adminStatsService: AdminStatsService,
    private readonly adminAnnouncementService: AdminAnnouncementService,
    private readonly adminBabyService: AdminBabyService,
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
}
