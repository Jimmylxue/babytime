import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Announcement } from '../announcement/entities/announcement.entity';
import { AdminAnnouncementService } from './admin-announcement.service';
import { AdminAuthService } from './admin-auth.service';
import { AdminBabyService } from './admin-baby.service';
import { AdminStatsService } from './admin-stats.service';
import { OpsHealthService } from './ops-health.service';
import { AdminController } from './admin.controller';
import { AdminJwtGuard } from './guards/admin-jwt.guard';
import { AdminJwtStrategy } from './strategies/admin-jwt.strategy';
import { NotificationModule } from '../notification/notification.module';

@Module({
  imports: [
    PassportModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        secret: configService.getOrThrow<string>(
          'ADMIN_JWT_SECRET',
          'ADMIN_JWT_SECRET 未配置（应写在仓库根目录 .env），拒绝以默认密钥签发 token',
        ),
        signOptions: { expiresIn: '7d' },
      }),
    }),
    TypeOrmModule.forFeature([Announcement]),
    NotificationModule,
  ],
  controllers: [AdminController],
  providers: [AdminAuthService, AdminStatsService, AdminBabyService, AdminAnnouncementService, AdminJwtStrategy, AdminJwtGuard, OpsHealthService],
})
export class AdminModule {}
