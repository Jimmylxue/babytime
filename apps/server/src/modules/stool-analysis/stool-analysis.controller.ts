import { Body, Controller, HttpCode, Post, Request, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { BabyService } from '../baby/baby.service';
import { AnalyzeStoolDto } from './dto/analyze-stool.dto';
import { StoolAnalysisService } from './stool-analysis.service';

@Controller('stool-analysis')
@UseGuards(JwtAuthGuard)
export class StoolAnalysisController {
  constructor(
    private readonly stoolAnalysisService: StoolAnalysisService,
    private readonly babyService: BabyService,
  ) {}

  @Post()
  @HttpCode(200)
  async analyze(@Request() req, @Body() dto: AnalyzeStoolDto) {
    const baby = await this.babyService.findOne(dto.babyId, req.user.id);
    const result = await this.stoolAnalysisService.analyze(baby, dto);
    return { code: 0, message: '分析完成', data: result };
  }
}
