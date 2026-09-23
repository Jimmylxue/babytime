import { Body, Controller, HttpCode, Post, Request, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RateLimitService } from '../../common/rate-limit.service';
import { BabyService } from '../baby/baby.service';
import { AnalyzeStoolDto } from './dto/analyze-stool.dto';
import { StoolAnalysisService } from './stool-analysis.service';

@Controller('stool-analysis')
@UseGuards(JwtAuthGuard)
export class StoolAnalysisController {
  constructor(
    private readonly stoolAnalysisService: StoolAnalysisService,
    private readonly babyService: BabyService,
    private readonly rateLimit: RateLimitService,
  ) {}

  @Post()
  @HttpCode(200)
  async analyze(@Request() req, @Body() dto: AnalyzeStoolDto) {
    // 每次调用都是一发智谱请求，直接对应额度与费用
    this.rateLimit.assert('stool-analysis', req.user.id);
    const baby = await this.babyService.findOne(dto.babyId, req.user.id);
    const result = await this.stoolAnalysisService.analyze(baby, dto);
    return result;
  }
}
