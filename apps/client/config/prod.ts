import type { UserConfigExport } from '@tarojs/cli'
import { loadRootEnv } from './loadEnv'

loadRootEnv()

export default {
	defineConstants: {
		API_BASE_URL: JSON.stringify(process.env.API_BASE_URL || ''),
	},
	mini: {},
	h5: {
		/**
		 * WebpackChain 签名参考：https://github.com/neutrinojs/webpack-chain
		 * 一般情况下，不需要修改
		 */
	},
} satisfies UserConfigExport
