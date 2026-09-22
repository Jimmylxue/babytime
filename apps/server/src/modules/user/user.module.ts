import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { HttpModule } from '@nestjs/axios';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { User } from './entities/user.entity';
import { UserEvent } from './entities/user-event.entity';
import { SubscriptionGrant } from './entities/subscription-grant.entity';
import { UserService } from './user.service';
import { UserController } from './user.controller';
import { JwtStrategy } from '../../common/strategies/jwt.strategy';
import { ContentSecurityModule } from '../content-security/content-security.module';
import { UploadModule } from '../upload/upload.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([User, UserEvent, SubscriptionGrant]),
    HttpModule,
    ContentSecurityModule,
    UploadModule,
    PassportModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        secret: configService.getOrThrow<string>(
          'JWT_SECRET',
          'JWT_SECRET 未配置（应写在仓库根目录 .env），拒绝以默认密钥签发 token',
        ),
        signOptions: { expiresIn: '7d' },
      }),
    }),
  ],
  controllers: [UserController],
  providers: [UserService, JwtStrategy],
  exports: [UserService],
})
export class UserModule {}
