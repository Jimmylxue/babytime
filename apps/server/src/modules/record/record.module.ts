import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Record } from './entities/record.entity';
import { RecordService } from './record.service';
import { RecordController } from './record.controller';
import { BabyModule } from '../baby/baby.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Record]),
    BabyModule,
  ],
  controllers: [RecordController],
  providers: [RecordService],
  exports: [RecordService],
})
export class RecordModule {}
