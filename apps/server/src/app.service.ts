import { Injectable } from '@nestjs/common';

@Injectable()
export class AppService {
  getHello(): string {
    return '小宝贝日记 API 服务运行中 🍼';
  }
}
