import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Photo } from './entities/photo.entity';
import { PhotoService } from './photo.service';
import { PhotoController } from './photo.controller';
import { BabyModule } from '../baby/baby.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Photo]),
    BabyModule,
  ],
  controllers: [PhotoController],
  providers: [PhotoService],
  exports: [PhotoService],
})
export class PhotoModule {}
