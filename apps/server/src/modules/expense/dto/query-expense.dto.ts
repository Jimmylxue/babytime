import { Type } from 'class-transformer'
import {
  IsIn,
  IsInt,
  IsOptional,
  Matches,
  Max,
  Min,
} from 'class-validator'
import { EXPENSE_CATEGORY_CODES, ExpenseCategoryCode } from '@baby-time/shared'

export class QueryExpenseDto {
  /** YYYY-MM，默认当前月 */
  @IsOptional()
  @Matches(/^\d{4}-(0[1-9]|1[0-2])$/)
  month?: string

  @IsOptional()
  @IsIn(EXPENSE_CATEGORY_CODES)
  category?: ExpenseCategoryCode

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize?: number
}