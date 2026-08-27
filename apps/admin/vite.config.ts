import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// base 与 NestJS 服务托管路径一致（服务端将 apps/admin/dist 挂载到 /admin）
export default defineConfig({
	plugins: [react()],
	base: '/admin/',
	server: {
		port: 5174,
		proxy: {
			'/api': {
				target: 'http://localhost:3000',
				changeOrigin: true,
			},
		},
	},
});
