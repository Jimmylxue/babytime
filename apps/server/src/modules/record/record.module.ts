import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Record } from './entities/record.entity';
import { RecordService } from './record.service';
import { RecordQueryService } from './record-query.service';
import { RecordController } from './record.controller';
import { BabyModule } from '../baby/baby.module';
import { ContentSecurityModule } from '../content-security/content-security.module';
import { UploadModule } from '../upload/upload.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Record]),
    BabyModule,
    ContentSecurityModule,
    UploadModule,
  ],
  controllers: [RecordController],
  providers: [RecordService, RecordQueryService],
  exports: [RecordService],
})
export class RecordModule {}
