/**
 * 环境配置
 *
 * API_BASE_URL 通过环境变量 API_BASE_URL 注入，构建时由 webpack DefinePlugin 替换。
 * - 开发环境默认: http://localhost:3000（可通过 .env 覆盖）
 * - 生产环境: 必须通过 .env 或 CI 环境变量设置 API_BASE_URL
 *
 * 使用方式: 复制 .env.example 为 .env 并填写实际地址
 */

declare const API_BASE_URL: string

/** 后端根地址，末尾不含斜杠 */
export const API_BASE: string =
  typeof API_BASE_URL !== 'undefined' ? API_BASE_URL : 'http://localhost:3000'

/** 后端 API 接口地址 */
export const API_PREFIX: string = `${API_BASE}/api`
