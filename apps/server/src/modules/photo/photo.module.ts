import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Photo } from './entities/photo.entity';
import { PhotoService } from './photo.service';
import { PhotoController } from './photo.controller';
import { BabyModule } from '../baby/baby.module';
import { ContentSecurityModule } from '../content-security/content-security.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Photo]),
    BabyModule,
    ContentSecurityModule,
  ],
  controllers: [PhotoController],
  providers: [PhotoService],
  exports: [PhotoService],
})
export class PhotoModule {}
