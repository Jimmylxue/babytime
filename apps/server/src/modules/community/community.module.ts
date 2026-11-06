import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Moment } from '../photo/entities/moment.entity';
import { Photo } from '../photo/entities/photo.entity';
import { User } from '../user/entities/user.entity';
import { MomentLike } from './entities/moment-like.entity';
import { MomentComment } from './entities/moment-comment.entity';
import { CommunityReport } from './entities/community-report.entity';
import { CommunityService } from './community.service';
import { CommunityController } from './community.controller';
import { SystemSettingsModule } from '../system-settings/system-settings.module';
import { ContentSecurityModule } from '../content-security/content-security.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Moment,
      Photo,
      User,
      MomentLike,
      MomentComment,
      CommunityReport,
    ]),
    SystemSettingsModule,
    ContentSecurityModule,
  ],
  controllers: [CommunityController],
  providers: [CommunityService],
  exports: [CommunityService],
})
export class CommunityModule {}
