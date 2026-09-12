import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { FamilyMember } from './entities/family-member.entity';
import { FamilyInvite } from './entities/family-invite.entity';
import { FamilyMemberAlias } from './entities/family-member-alias.entity';
import { FamilyService } from './family.service';
import { FamilyController } from './family.controller';
import { BabyModule } from '../baby/baby.module';
import { ContentSecurityModule } from '../content-security/content-security.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([FamilyMember, FamilyInvite, FamilyMemberAlias]),
    BabyModule,
    ContentSecurityModule,
  ],
  controllers: [FamilyController],
  providers: [FamilyService],
  exports: [FamilyService],
})
export class FamilyModule {}
