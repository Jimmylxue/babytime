import { IsNumber, IsOptional, Max, Min } from 'class-validator'

/**
 * 设置每月预算。
 * amount 传 null 表示清除预算；不传/空对象也按清除处理（服务端兜底）。
 */
export class SetBudgetDto {
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  @Max(9999999.99)
  amount?: number | null
}