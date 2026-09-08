import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User } from '../user/entities/user.entity';
import { ContentSecurityService } from './content-security.service';

@Module({
  imports: [HttpModule, TypeOrmModule.forFeature([User])],
  providers: [ContentSecurityService],
  exports: [ContentSecurityService],
})
export class ContentSecurityModule {}
