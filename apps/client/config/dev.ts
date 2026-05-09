import type { UserConfigExport } from '@tarojs/cli'
import { loadRootEnv } from './loadEnv'

loadRootEnv()

export default {
  logger: {
    quiet: false,
    stats: true,
  },
  defineConstants: {
    API_BASE_URL: JSON.stringify(process.env.API_BASE_URL || 'http://localhost:3000'),
  },
  mini: {},
  h5: {},
} satisfies UserConfigExport
