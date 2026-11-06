import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Post,
  Query,
  Request,
  UseGuards,
} from '@nestjs/common';
import { CommunityService } from './community.service';
import { CreateMomentCommentDto } from './dto/create-comment.dto';
import { ReportCommunityContentDto } from './dto/report-community-content.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';

@Controller('community')
@UseGuards(JwtAuthGuard)
export class CommunityController {
  constructor(private readonly communityService: CommunityService) {}

  @Get('feed')
  async getFeed(
    @Query('page') page: string,
    @Query('pageSize') pageSize: string,
    @Request() req,
  ) {
    return this.communityService.getFeed(
      req.user.id,
      page ? parseInt(page) : 1,
      pageSize ? parseInt(pageSize) : 10,
    );
  }

  @Get('posts/:id')
  async getPost(@Param('id') id: string, @Request() req) {
    return this.communityService.getPost(req.user.id, id);
  }

  @Post('posts/:id/like')
  @HttpCode(200)
  async like(@Param('id') id: string, @Request() req) {
    return this.communityService.setLike(req.user.id, id, true);
  }

  @Delete('posts/:id/like')
  @HttpCode(200)
  async unlike(@Param('id') id: string, @Request() req) {
    return this.communityService.setLike(req.user.id, id, false);
  }

  @Post('posts/:id/comments')
  @HttpCode(200)
  async addComment(
    @Param('id') id: string,
    @Body() dto: CreateMomentCommentDto,
    @Request() req,
  ) {
    return this.communityService.addComment(req.user.id, id, dto);
  }

  @Delete('comments/:id')
  @HttpCode(200)
  async hideComment(@Param('id') id: string, @Request() req) {
    return this.communityService.hideComment(req.user.id, id);
  }

  @Post('reports')
  @HttpCode(200)
  async report(@Body() dto: ReportCommunityContentDto, @Request() req) {
    return this.communityService.report(req.user.id, dto);
  }
}
