import { IsDateString, IsNotEmpty } from 'class-validator';

export class SetVaccinePlanDto {
  @IsNotEmpty()
  @IsDateString({ strict: true })
  scheduledDate: string;
}
