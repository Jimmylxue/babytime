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
