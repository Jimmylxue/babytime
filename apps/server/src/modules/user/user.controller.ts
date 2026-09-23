import { Controller, Post, Get, Body, UseGuards, Request, HttpCode } from '@nestjs/common';
import { UserService } from './user.service';
import { LoginDto, UpdateUserDto } from './dto/login.dto';
import { TrackEventDto } from './dto/track-event.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';

@Controller('user')
export class UserController {
  constructor(private readonly userService: UserService) {}

  @Post('login')
  @HttpCode(200)
  async login(@Body() loginDto: LoginDto) {
    const result = await this.userService.login(loginDto);
    return result;
  }

  @UseGuards(JwtAuthGuard)
  @Get('profile')
  async getProfile(@Request() req) {
    const user = await this.userService.findById(req.user.id);
    return user;
  }

  @UseGuards(JwtAuthGuard)
  @Post('update')
  @HttpCode(200)
  async update(@Request() req, @Body() updateUserDto: UpdateUserDto) {
    const user = await this.userService.update(req.user.id, updateUserDto);
    return user;
  }

  @UseGuards(JwtAuthGuard)
  @Post('events')
  @HttpCode(200)
  async trackEvent(@Request() req, @Body() trackEventDto: TrackEventDto) {
    const data = await this.userService.trackEvent(
      req.user.id,
      trackEventDto.name,
      trackEventDto.properties,
    );
    return data;
  }
}
