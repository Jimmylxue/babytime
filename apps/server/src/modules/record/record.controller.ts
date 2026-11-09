import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  Request,
  HttpCode,
} from '@nestjs/common';
import { RecordService } from './record.service';
import { CreateRecordDto } from './dto/create-record.dto';
import { UpdateRecordDto } from './dto/update-record.dto';
import { RecordType } from './entities/record.entity';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';

@Controller('record')
@UseGuards(JwtAuthGuard)
export class RecordController {
  constructor(private readonly recordService: RecordService) {}

  @Post()
  @HttpCode(200)
  async create(@Request() req, @Body() createRecordDto: CreateRecordDto) {
    const record = await this.recordService.create(req.user.id, createRecordDto);
    return record;
  }

  @Get('baby/:babyId')
  async findByBaby(
    @Param('babyId') babyId: string,
    @Query('date') date: string,
    @Request() req,
  ) {
    const records = await this.recordService.findAllByBaby(req.user.id, babyId, date);
    return records;
  }

  @Get('summary/:babyId')
  async getSummary(@Param('babyId') babyId: string, @Request() req) {
    const summary = await this.recordService.getTodaySummary(req.user.id, babyId);
    return summary;
  }

  @Get('stats/:babyId')
  async getStats(
    @Param('babyId') babyId: string,
    @Query('days') days: string,
    @Request() req,
  ) {
    const stats = await this.recordService.getStats(
      req.user.id,
      babyId,
      days ? parseInt(days) : 7,
    );
    return stats;
  }

  // 身高体重全量历史：统计页的 WHO 曲线/英雄卡专用，替代原先的 getStats(days=1100)
  @Get('growth/:babyId')
  async getGrowthTrend(@Param('babyId') babyId: string, @Request() req) {
    const trend = await this.recordService.getGrowthTrend(req.user.id, babyId);
    return trend;
  }

  @Get('vaccines/:babyId')
  async getVaccines(@Param('babyId') babyId: string, @Request() req) {
    const records = await this.recordService.findVaccinesByBaby(req.user.id, babyId);
    return records;
  }

  /**
   * 健康分析原始数据：体温点 + 尿布点。
   * 聚合（病程切分、排便规律）在前端用 @baby-time/shared 的纯函数算。
   */
  @Get('health/:babyId')
  async getHealthPoints(
    @Param('babyId') babyId: string,
    @Query('days') days: string,
    @Request() req,
  ) {
    return this.recordService.getHealthPoints(
      req.user.id,
      babyId,
      days ? parseInt(days) : undefined,
    );
  }

  /**
   * 导出记录为 Excel（.xlsx，base64）。小程序拿到 content 后本地写文件再 openDocument 打开。
   * 用 GET + JSON 而不是文件流：省掉 downloadFile 域名白名单与 header 鉴权的坑。
   */
  @Get('export/:babyId')
  async exportExcel(
    @Param('babyId') babyId: string,
    @Query('startDate') startDate: string,
    @Query('endDate') endDate: string,
    @Request() req,
  ) {
    return this.recordService.exportRecordsExcel(req.user.id, babyId, {
      startDate,
      endDate,
    });
  }

  @Get('detail/:babyId')
  async getRecordDetail(
    @Param('babyId') babyId: string,
    @Query('type') type: RecordType,
    @Query('date') date: string,
    @Query('days') days: string,
    @Query('page') page: string,
    @Query('pageSize') pageSize: string,
    @Query('metric') metric: string,
    @Request() req,
  ) {
    const detail = await this.recordService.getRecordDetail(req.user.id, babyId, type, {
      date,
      days: days ? parseInt(days) : undefined,
      page: page ? parseInt(page) : undefined,
      pageSize: pageSize ? parseInt(pageSize) : undefined,
      metric,
    });
    return detail;
  }

  @Get('detail-summary/:babyId')
  async getRecordDetailSummary(
    @Param('babyId') babyId: string,
    @Query('type') type: RecordType,
    @Query('date') date: string,
    @Query('days') days: string,
    @Query('metric') metric: string,
    @Request() req,
  ) {
    const summary = await this.recordService.getRecordDetailSummary(req.user.id, babyId, type, {
      date,
      days: days ? parseInt(days) : undefined,
      metric,
    });
    return summary;
  }

  @Get(':id')
  async findOne(@Param('id') id: string, @Request() req) {
    const record = await this.recordService.findOne(id, req.user.id);
    return record;
  }

  @Delete(':id')
  @HttpCode(200)
  async remove(@Param('id') id: string, @Request() req) {
    await this.recordService.remove(id, req.user.id);
  }

  @Put(':id')
  @HttpCode(200)
  async update(
    @Param('id') id: string,
    @Request() req,
    @Body() updateRecordDto: UpdateRecordDto,
  ) {
    const record = await this.recordService.update(id, req.user.id, updateRecordDto);
    return record;
  }
}
