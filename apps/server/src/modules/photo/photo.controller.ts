import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  Request,
  HttpCode,
} from '@nestjs/common';
import { PhotoService } from './photo.service';
import { CreatePhotoDto } from './dto/create-photo.dto';
import { CreateMomentDto } from './dto/create-moment.dto';
import { UpdateMomentVisibilityDto } from './dto/update-moment-visibility.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';

@Controller('photo')
@UseGuards(JwtAuthGuard)
export class PhotoController {
  constructor(private readonly photoService: PhotoService) {}

  @Post()
  @HttpCode(200)
  async create(@Request() req, @Body() createPhotoDto: CreatePhotoDto) {
    const photo = await this.photoService.create(req.user.id, createPhotoDto);
    return photo;
  }

  @Post('moment')
  @HttpCode(200)
  async createMoment(@Request() req, @Body() createMomentDto: CreateMomentDto) {
    return this.photoService.createMoment(req.user.id, createMomentDto);
  }

  @Get('moments/:babyId')
  async getFeed(
    @Param('babyId') babyId: string,
    @Query('page') page: string,
    @Query('pageSize') pageSize: string,
    @Request() req,
  ) {
    return this.photoService.getFeed(
      req.user.id,
      babyId,
      page ? Math.max(1, parseInt(page)) : 1,
      pageSize ? Math.min(50, Math.max(1, parseInt(pageSize))) : 20,
    );
  }

  @Delete('moment/:id')
  @HttpCode(200)
  async removeMoment(@Param('id') id: string, @Request() req) {
    return this.photoService.removeMoment(id, req.user.id);
  }

  @Patch('moment/:id/visibility')
  @HttpCode(200)
  async updateMomentVisibility(
    @Param('id') id: string,
    @Body() dto: UpdateMomentVisibilityDto,
    @Request() req,
  ) {
    return this.photoService.updateMomentVisibility(
      req.user.id,
      id,
      dto.visibility,
    );
  }

  @Get('baby/:babyId')
  async findByBaby(
    @Param('babyId') babyId: string,
    @Query('page') page: string,
    @Query('pageSize') pageSize: string,
    @Request() req,
  ) {
    const result = await this.photoService.findAllByBaby(
      req.user.id,
      babyId,
      page ? parseInt(page) : 1,
      pageSize ? parseInt(pageSize) : 20,
    );
    return result;
  }

  @Get('timeline/:babyId')
  async getTimeline(
    @Param('babyId') babyId: string,
    @Query('page') page: string,
    @Query('pageSize') pageSize: string,
    @Request() req,
  ) {
    const result = await this.photoService.getTimeline(
      req.user.id,
      babyId,
      page ? Math.max(1, parseInt(page)) : 1,
      pageSize ? Math.min(100, Math.max(1, parseInt(pageSize))) : 30,
    );
    return result;
  }

  @Delete(':id')
  @HttpCode(200)
  async remove(@Param('id') id: string, @Request() req) {
    await this.photoService.remove(id, req.user.id);
  }

  @Post('batch-delete')
  @HttpCode(200)
  async batchRemove(@Request() req, @Body() body: { ids?: string[] }) {
    const result = await this.photoService.batchRemove(body?.ids ?? [], req.user.id);
    return result;
  }
}
