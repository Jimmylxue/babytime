import { Controller, Post, Get, Body, UseGuards, Request, HttpCode } from '@nestjs/common';
import { UserService } from './user.service';
import { LoginDto, UpdateUserDto } from './dto/login.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';

@Controller('user')
export class UserController {
  constructor(private readonly userService: UserService) {}

  @Post('login')
  @HttpCode(200)
  async login(@Body() loginDto: LoginDto) {
    const result = await this.userService.login(loginDto);
    return {
      code: 0,
      message: '登录成功',
      data: result,
    };
  }

  @UseGuards(JwtAuthGuard)
  @Get('profile')
  async getProfile(@Request() req) {
    const user = await this.userService.findById(req.user.id);
    return {
      code: 0,
      message: 'success',
      data: user,
    };
  }

  @UseGuards(JwtAuthGuard)
  @Post('update')
  @HttpCode(200)
  async update(@Request() req, @Body() updateUserDto: UpdateUserDto) {
    const user = await this.userService.update(req.user.id, updateUserDto);
    return {
      code: 0,
      message: '更新成功',
      data: user,
    };
  }
}
