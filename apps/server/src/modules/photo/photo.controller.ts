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

  /**
   * 家庭时光流互动：点赞 / 评论 / 评论列表 / 删评论。
   * 与育娃圈共用 moment_likes / moment_comments 表，但**不要求瞬间公开** ——
   * 只要是自己能访问的家庭瞬间就能互动。
   */
  @Post('moment/:id/like')
  @HttpCode(200)
  async setMomentLike(
    @Param('id') id: string,
    @Body() body: { liked?: boolean },
    @Request() req,
  ) {
    return this.photoService.setMomentLike(
      req.user.id,
      id,
      body?.liked !== false,
    );
  }

  @Get('moment/:id/comments')
  async getMomentComments(@Param('id') id: string, @Request() req) {
    return this.photoService.getMomentComments(req.user.id, id);
  }

  @Post('moment/:id/comments')
  @HttpCode(200)
  async addMomentComment(
    @Param('id') id: string,
    @Body() body: { content?: string },
    @Request() req,
  ) {
    return this.photoService.addMomentComment(
      req.user.id,
      id,
      body?.content || '',
    );
  }

  @Delete('moment/:id/comments/:commentId')
  @HttpCode(200)
  async removeMomentComment(
    @Param('id') id: string,
    @Param('commentId') commentId: string,
    @Request() req,
  ) {
    return this.photoService.removeMomentComment(req.user.id, id, commentId);
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
