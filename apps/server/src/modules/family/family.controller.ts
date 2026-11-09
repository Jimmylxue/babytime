import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  UseGuards,
  Request,
  HttpCode,
} from '@nestjs/common';
import { FamilyService } from './family.service';
import { CreateInviteDto, AcceptInviteDto } from './dto/create-invite.dto';
import { UpdateMemberNicknameDto } from './dto/update-member-nickname.dto';
import { UpdateMemberAccessDto } from './dto/update-member-access.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';

@Controller('family')
@UseGuards(JwtAuthGuard)
export class FamilyController {
  constructor(private readonly familyService: FamilyService) {}

  @Post('invite')
  @HttpCode(200)
  async createInvite(@Request() req, @Body() createInviteDto: CreateInviteDto) {
    const result = await this.familyService.createInvite(req.user.id, createInviteDto);
    return result;
  }

  @Get('invite/info/:inviteCode')
  async getInviteInfo(
    @Request() req,
    @Param('inviteCode') inviteCode: string,
  ) {
    const result = await this.familyService.getInviteInfo(
      req.user.id,
      inviteCode,
    );
    return result;
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
    return result;
  }

  @Get('members')
  async getFamilyMembers(@Request() req) {
    const members = await this.familyService.getFamilyMembers(req.user.id);
    return members;
  }

  @Get('my-families')
  async getUserFamilies(@Request() req) {
    const families = await this.familyService.getUserFamilies(req.user.id);
    return families;
  }

  @Get('binding-status')
  async getBindingStatus(@Request() req) {
    const status = await this.familyService.checkFamilyBinding(req.user.id);
    return status;
  }

  @Patch('member/nickname')
  async updateMemberNickname(
    @Request() req,
    @Body() updateMemberNicknameDto: UpdateMemberNicknameDto,
  ) {
    const result = await this.familyService.updateMemberNickname(
      req.user.id,
      updateMemberNicknameDto.targetUserId,
      updateMemberNicknameDto.nickname,
    );
    return result;
  }

  /**
   * 设置成员权限（只读 / 可记录）。只有家庭创建者能调。
   * 与 role（亲属称谓）分开，改这个不影响成员卡片上显示的「爸爸/奶奶」。
   */
  @Patch('member/:memberId/access')
  async updateMemberAccess(
    @Request() req,
    @Param('memberId') memberId: string,
    @Body() dto: UpdateMemberAccessDto,
  ) {
    return this.familyService.setMemberAccessLevel(
      req.user.id,
      memberId,
      dto.accessLevel,
    );
  }

  @Delete('member/:memberId')
  @HttpCode(200)
  async removeMember(@Request() req, @Param('memberId') memberId: string) {
    await this.familyService.removeMember(req.user.id, memberId);
  }

  @Post('leave')
  @HttpCode(200)
  async leaveFamily(@Request() req) {
    await this.familyService.leaveFamily(req.user.id);
  }
}
