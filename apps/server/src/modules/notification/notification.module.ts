import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { HttpModule } from '@nestjs/axios';
import { User } from '../user/entities/user.entity';
import { Baby } from '../baby/entities/baby.entity';
import { Record as BabyRecord } from '../record/entities/record.entity';
import { SubscriptionGrant } from '../user/entities/subscription-grant.entity';
import { NotificationDelivery } from './entities/notification-delivery.entity';
import { NotificationService } from './notification.service';
import { NotificationController } from './notification.controller';
import { FamilyMember } from '../family/entities/family-member.entity';
import { VaccinePlan } from './entities/vaccine-plan.entity';

@Module({
  imports: [HttpModule, TypeOrmModule.forFeature([User, Baby, BabyRecord, FamilyMember, SubscriptionGrant, NotificationDelivery, VaccinePlan])],
  controllers: [NotificationController],
  providers: [NotificationService],
  exports: [NotificationService],
})
export class NotificationModule {}
