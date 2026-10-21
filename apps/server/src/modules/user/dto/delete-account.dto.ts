import { IsString, IsNotEmpty, MaxLength } from 'class-validator';

export class DeleteAccountDto {
  @IsString()
  @IsNotEmpty({ message: '请输入注销确认词' })
  @MaxLength(8)
  confirm: string;
}
