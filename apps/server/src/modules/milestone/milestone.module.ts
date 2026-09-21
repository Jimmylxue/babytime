import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Milestone } from './entities/milestone.entity';
import { MilestoneService } from './milestone.service';
import { MilestoneController } from './milestone.controller';
import { BabyModule } from '../baby/baby.module';
import { ContentSecurityModule } from '../content-security/content-security.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Milestone]),
    BabyModule,
    ContentSecurityModule,
  ],
  controllers: [MilestoneController],
  providers: [MilestoneService],
  exports: [MilestoneService],
})
export class MilestoneModule {}
