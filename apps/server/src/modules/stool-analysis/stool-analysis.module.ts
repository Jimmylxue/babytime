// 已下线（2026-10-19）：未在 AppModule 注册，POST /stool-analysis 不再暴露。
// AI 生成内容涉及服务类目/算法备案与医疗健康内容风险，恢复前先评估合规要求。
import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { BabyModule } from '../baby/baby.module';
import { StoolAnalysisController } from './stool-analysis.controller';
import { StoolAnalysisService } from './stool-analysis.service';

@Module({
  imports: [HttpModule, BabyModule],
  controllers: [StoolAnalysisController],
  providers: [StoolAnalysisService],
})
export class StoolAnalysisModule {}
