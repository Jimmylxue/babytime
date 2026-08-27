import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Announcement } from '../announcement/entities/announcement.entity';
import { AdminAnnouncementService } from './admin-announcement.service';
import { AdminAuthService } from './admin-auth.service';
import { AdminStatsService } from './admin-stats.service';
import { AdminController } from './admin.controller';
import { AdminJwtGuard } from './guards/admin-jwt.guard';
import { AdminJwtStrategy } from './strategies/admin-jwt.strategy';

@Module({
  imports: [
    PassportModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        secret: configService.get<string>('ADMIN_JWT_SECRET', 'baby-time-admin-secret'),
        signOptions: { expiresIn: '7d' },
      }),
    }),
    TypeOrmModule.forFeature([Announcement]),
  ],
  controllers: [AdminController],
  providers: [AdminAuthService, AdminStatsService, AdminAnnouncementService, AdminJwtStrategy, AdminJwtGuard],
})
export class AdminModule {}
