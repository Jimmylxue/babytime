import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  UseGuards,
  Request,
  HttpCode,
} from '@nestjs/common';
import { BabyService } from './baby.service';
import { CreateBabyDto, UpdateBabyDto } from './dto/create-baby.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';

@Controller('baby')
@UseGuards(JwtAuthGuard)
export class BabyController {
  constructor(private readonly babyService: BabyService) {}

  @Post()
  @HttpCode(200)
  async create(@Request() req, @Body() createBabyDto: CreateBabyDto) {
    const baby = await this.babyService.create(req.user.id, createBabyDto);
    return {
      code: 0,
      message: '创建成功',
      data: baby,
    };
  }

  @Get()
  async findAll(@Request() req) {
    const babies = await this.babyService.findAllByUser(req.user.id);
    return {
      code: 0,
      message: 'success',
      data: babies,
    };
  }

  @Get(':id')
  async findOne(@Param('id') id: string, @Request() req) {
    const baby = await this.babyService.findOne(id, req.user.id);
    return {
      code: 0,
      message: 'success',
      data: baby,
    };
  }

  @Put(':id')
  @HttpCode(200)
  async update(
    @Param('id') id: string,
    @Request() req,
    @Body() updateBabyDto: UpdateBabyDto,
  ) {
    const baby = await this.babyService.update(id, req.user.id, updateBabyDto);
    return {
      code: 0,
      message: '更新成功',
      data: baby,
    };
  }

  @Delete(':id')
  @HttpCode(200)
  async remove(@Param('id') id: string, @Request() req) {
    await this.babyService.remove(id, req.user.id);
    return {
      code: 0,
      message: '删除成功',
    };
  }
}
