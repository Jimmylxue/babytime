import {
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator'
import { EXPENSE_CATEGORY_CODES, ExpenseCategoryCode } from '@baby-time/shared'

/** 编辑时不允许改 babyId；其余字段全部可选 */
export class UpdateExpenseDto {
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  @Max(999999.99)
  amount?: number

  @IsOptional()
  @IsIn(EXPENSE_CATEGORY_CODES)
  category?: ExpenseCategoryCode

  @IsOptional()
  @IsString()
  @MaxLength(50)
  itemName?: string

  @IsOptional()
  @IsString()
  @MaxLength(200)
  note?: string

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  @Max(999999)
  quantity?: number | null

  @IsOptional()
  @IsString()
  @MaxLength(10)
  unit?: string | null

  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  expenseDate?: string
}