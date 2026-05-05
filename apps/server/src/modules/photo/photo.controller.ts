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
import { PhotoService } from './photo.service';
import { CreatePhotoDto } from './dto/create-photo.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';

@Controller('photo')
@UseGuards(JwtAuthGuard)
export class PhotoController {
  constructor(private readonly photoService: PhotoService) {}

  @Post()
  @HttpCode(200)
  async create(@Request() req, @Body() createPhotoDto: CreatePhotoDto) {
    const photo = await this.photoService.create(req.user.id, createPhotoDto);
    return {
      code: 0,
      message: '上传成功',
      data: photo,
    };
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
    return {
      code: 0,
      message: 'success',
      data: result,
    };
  }

  @Get('timeline/:babyId')
  async getTimeline(@Param('babyId') babyId: string, @Request() req) {
    const timeline = await this.photoService.getTimeline(req.user.id, babyId);
    return {
      code: 0,
      message: 'success',
      data: timeline,
    };
  }

  @Delete(':id')
  @HttpCode(200)
  async remove(@Param('id') id: string, @Request() req) {
    await this.photoService.remove(id, req.user.id);
    return {
      code: 0,
      message: '删除成功',
    };
  }
}
