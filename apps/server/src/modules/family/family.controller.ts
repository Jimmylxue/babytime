import {
  Controller,
  Get,
  Post,
  Delete,
  Body,
  Param,
  UseGuards,
  Request,
  HttpCode,
} from '@nestjs/common';
import { FamilyService } from './family.service';
import { CreateInviteDto, AcceptInviteDto } from './dto/create-invite.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';

@Controller('family')
@UseGuards(JwtAuthGuard)
export class FamilyController {
  constructor(private readonly familyService: FamilyService) {}

  @Post('invite')
  @HttpCode(200)
  async createInvite(@Request() req, @Body() createInviteDto: CreateInviteDto) {
    const result = await this.familyService.createInvite(req.user.id, createInviteDto);
    return {
      code: 0,
      message: '邀请码已生成',
      data: result,
    };
  }

  @Post('accept/:inviteCode')
  @HttpCode(200)
  async acceptInvite(
    @Request() req,
    @Param('inviteCode') inviteCode: string,
    @Body() acceptInviteDto: AcceptInviteDto,
  ) {
    const result = await this.familyService.acceptInvite(
      req.user.id,
      inviteCode,
      acceptInviteDto.role,
    );
    return {
      code: 0,
      message: '已成功加入家庭',
      data: result,
    };
  }

  @Get('members')
  async getFamilyMembers(@Request() req) {
    const members = await this.familyService.getFamilyMembers(req.user.id);
    return {
      code: 0,
      message: 'success',
      data: members,
    };
  }

  @Get('my-families')
  async getUserFamilies(@Request() req) {
    const families = await this.familyService.getUserFamilies(req.user.id);
    return {
      code: 0,
      message: 'success',
      data: families,
    };
  }

  @Get('binding-status')
  async getBindingStatus(@Request() req) {
    const status = await this.familyService.checkFamilyBinding(req.user.id);
    return {
      code: 0,
      message: 'success',
      data: status,
    };
  }

  @Delete('member/:memberId')
  @HttpCode(200)
  async removeMember(@Request() req, @Param('memberId') memberId: string) {
    await this.familyService.removeMember(req.user.id, memberId);
    return {
      code: 0,
      message: '已移除成员',
    };
  }

  @Post('leave')
  @HttpCode(200)
  async leaveFamily(@Request() req) {
    await this.familyService.leaveFamily(req.user.id);
    return {
      code: 0,
      message: '已退出家庭',
    };
  }
}
