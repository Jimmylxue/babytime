import { ValueTransformer } from 'typeorm';

// mysql2 默认把 decimal 列返回成字符串（曾导致纪念册海报 toFixed 崩溃），
// 在实体层统一转成 number，所有接口出口不再出现「数字形状的字符串」。
export const decimalTransformer: ValueTransformer = {
  to: (value?: number | null) => value,
  from: (value?: string | number | null) => (value == null ? value : Number(value)),
};
