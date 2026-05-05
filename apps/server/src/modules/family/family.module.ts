import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { FamilyMember } from './entities/family-member.entity';
import { FamilyService } from './family.service';
import { FamilyController } from './family.controller';
import { BabyModule } from '../baby/baby.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([FamilyMember]),
    BabyModule,
  ],
  controllers: [FamilyController],
  providers: [FamilyService],
  exports: [FamilyService],
})
export class FamilyModule {}
