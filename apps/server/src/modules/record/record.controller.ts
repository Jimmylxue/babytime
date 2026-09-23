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

  @Get('vaccines/:babyId')
  async getVaccines(@Param('babyId') babyId: string, @Request() req) {
    const records = await this.recordService.findVaccinesByBaby(req.user.id, babyId);
    return records;
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
