import { Module } from '@nestjs/common';
import { UploadModule } from '../upload/upload.module';
import { UserDeletionService } from './user-deletion.service';

@Module({
  imports: [UploadModule],
  providers: [UserDeletionService],
  exports: [UserDeletionService],
})
export class UserDeletionModule {}
