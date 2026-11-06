import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Photo } from './entities/photo.entity';
import { Moment } from './entities/moment.entity';
import { PhotoService } from './photo.service';
import { PhotoController } from './photo.controller';
import { BabyModule } from '../baby/baby.module';
import { ContentSecurityModule } from '../content-security/content-security.module';
import { UploadModule } from '../upload/upload.module';
import { SystemSettingsModule } from '../system-settings/system-settings.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Photo, Moment]),
    BabyModule,
    ContentSecurityModule,
    UploadModule,
    SystemSettingsModule,
  ],
  controllers: [PhotoController],
  providers: [PhotoService],
  exports: [PhotoService],
})
export class PhotoModule {}
