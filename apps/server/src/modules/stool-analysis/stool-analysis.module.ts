import { Module } from '@nestjs/common';
import { BabyModule } from '../baby/baby.module';
import { StoolAnalysisController } from './stool-analysis.controller';
import { StoolAnalysisService } from './stool-analysis.service';

@Module({
  imports: [BabyModule],
  controllers: [StoolAnalysisController],
  providers: [StoolAnalysisService],
})
export class StoolAnalysisModule {}
