import {
  Controller,
  Get,
  Post,
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
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';

@Controller('record')
@UseGuards(JwtAuthGuard)
export class RecordController {
  constructor(private readonly recordService: RecordService) {}

  @Post()
  @HttpCode(200)
  async create(@Request() req, @Body() createRecordDto: CreateRecordDto) {
    const record = await this.recordService.create(req.user.id, createRecordDto);
    return {
      code: 0,
      message: '记录成功',
      data: record,
    };
  }

  @Get('baby/:babyId')
  async findByBaby(
    @Param('babyId') babyId: string,
    @Query('date') date: string,
    @Request() req,
  ) {
    const records = await this.recordService.findAllByBaby(req.user.id, babyId, date);
    return {
      code: 0,
      message: 'success',
      data: records,
    };
  }

  @Get('summary/:babyId')
  async getSummary(@Param('babyId') babyId: string, @Request() req) {
    const summary = await this.recordService.getTodaySummary(req.user.id, babyId);
    return {
      code: 0,
      message: 'success',
      data: summary,
    };
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
    return {
      code: 0,
      message: 'success',
      data: stats,
    };
  }

  @Get(':id')
  async findOne(@Param('id') id: string, @Request() req) {
    const record = await this.recordService.findOne(id, req.user.id);
    return {
      code: 0,
      message: 'success',
      data: record,
    };
  }

  @Delete(':id')
  @HttpCode(200)
  async remove(@Param('id') id: string, @Request() req) {
    await this.recordService.remove(id, req.user.id);
    return {
      code: 0,
      message: '删除成功',
    };
  }
}
