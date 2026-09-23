import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Post,
  Put,
  Request,
  UseGuards,
} from '@nestjs/common';
import { MilestoneService } from './milestone.service';
import {
  CreateMilestoneDto,
  UpdateMilestoneDto,
} from './dto/create-milestone.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';

@Controller('milestone')
@UseGuards(JwtAuthGuard)
export class MilestoneController {
  constructor(private readonly milestoneService: MilestoneService) {}

  @Post()
  @HttpCode(200)
  async create(@Request() req, @Body() dto: CreateMilestoneDto) {
    const milestone = await this.milestoneService.create(req.user.id, dto);
    return milestone;
  }

  @Get('baby/:babyId')
  async findByBaby(@Param('babyId') babyId: string, @Request() req) {
    const list = await this.milestoneService.findAllByBaby(req.user.id, babyId);
    return list;
  }

  @Put(':id')
  @HttpCode(200)
  async update(
    @Param('id') id: string,
    @Request() req,
    @Body() dto: UpdateMilestoneDto,
  ) {
    const milestone = await this.milestoneService.update(id, req.user.id, dto);
    return milestone;
  }

  @Delete(':id')
  @HttpCode(200)
  async remove(@Param('id') id: string, @Request() req) {
    await this.milestoneService.remove(id, req.user.id);
  }
}
