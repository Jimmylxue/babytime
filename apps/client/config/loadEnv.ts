import { readFileSync } from 'fs'
import { resolve } from 'path'

/**
 * 加载根目录 .env 文件到 process.env（仅设置尚未存在的变量）
 */
export function loadRootEnv() {
  try {
    const envPath = resolve(__dirname, '../../../.env')
    const content = readFileSync(envPath, 'utf-8')
    for (const line of content.split('\n')) {
      const trimmed = line.trim()
      if (!trimmed || trimmed.startsWith('#')) continue
      const idx = trimmed.indexOf('=')
      if (idx === -1) continue
      const key = trimmed.slice(0, idx).trim()
      const value = trimmed.slice(idx + 1).trim()
      if (!(key in process.env)) {
        process.env[key] = value
      }
    }
  } catch {
    // .env 不存在时静默跳过
  }
}
