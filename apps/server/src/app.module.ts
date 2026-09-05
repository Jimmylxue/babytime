import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PassportModule } from '@nestjs/passport';
import { ServeStaticModule } from '@nestjs/serve-static';
import { join } from 'path';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { UserModule } from './modules/user/user.module';
import { BabyModule } from './modules/baby/baby.module';
import { RecordModule } from './modules/record/record.module';
import { PhotoModule } from './modules/photo/photo.module';
import { UploadModule } from './modules/upload/upload.module';
import { FamilyModule } from './modules/family/family.module';
import { StoolAnalysisModule } from './modules/stool-analysis/stool-analysis.module';
import { AnnouncementModule } from './modules/announcement/announcement.module';
import { AdminModule } from './modules/admin/admin.module';
import { NotificationModule } from './modules/notification/notification.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: join(__dirname, '..', '..', '..', '.env'),
    }),
    // 静态文件服务 - uploads 目录
    ServeStaticModule.forRoot({
      rootPath: join(process.cwd(), 'uploads'),
      serveRoot: '/uploads',
    }),
    PassportModule.register({ defaultStrategy: 'jwt' }),
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        type: 'mysql',
        host: configService.get('DB_HOST', 'localhost'),
        port: configService.get<number>('DB_PORT', 3306),
        username: configService.get('DB_USERNAME', 'root'),
        password: configService.get('DB_PASSWORD', ''),
        database: configService.get('DB_DATABASE', 'baby_time'),
        entities: [__dirname + '/**/*.entity{.ts,.js}'],
        // 生产默认关闭自动同步：改字段名/删字段时自动 ALTER 会直接丢数据。
        // 表结构变更需手写 SQL（见 docs/db-backup-and-migration.md）。
        // DB_SYNCHRONIZE=true 可显式开启（非生产环境默认开启）。
        synchronize:
          configService.get(
            'DB_SYNCHRONIZE',
            process.env.NODE_ENV === 'production' ? 'false' : 'true',
          ) === 'true',
        charset: 'utf8mb4',
      }),
    }),
    UserModule,
    BabyModule,
    RecordModule,
    PhotoModule,
    UploadModule,
    FamilyModule,
    StoolAnalysisModule,
    AnnouncementModule,
    AdminModule,
    NotificationModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
