import { Controller, Get } from '@nestjs/common';
import { AnnouncementService } from './announcement.service';

@Controller('announcement')
export class AnnouncementController {
  constructor(private readonly announcementService: AnnouncementService) {}

  @Get('current')
  async findCurrent() {
    const announcement = await this.announcementService.findCurrent();
    return { code: 0, message: 'success', data: announcement };
  }
}
