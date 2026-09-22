import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Baby } from './entities/baby.entity';
import { FamilyMember } from '../family/entities/family-member.entity';
import { BabyService } from './baby.service';
import { BabyController } from './baby.controller';
import { UserModule } from '../user/user.module';
import { ContentSecurityModule } from '../content-security/content-security.module';
import { UploadModule } from '../upload/upload.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Baby, FamilyMember]),
    UserModule,
    ContentSecurityModule,
    UploadModule,
  ],
  controllers: [BabyController],
  providers: [BabyService],
  exports: [BabyService],
})
export class BabyModule {}
