import axios from 'axios';
import { message } from 'antd';
import { clearAuth, getToken } from '../auth';

const client = axios.create({
	baseURL: '/api/admin',
	timeout: 15000,
});

client.interceptors.request.use((config) => {
	const token = getToken();
	if (token) {
		config.headers.Authorization = `Bearer ${token}`;
	}
	return config;
});

client.interceptors.response.use(
	(response) => {
		const body = response.data;
		if (body && typeof body === 'object' && 'code' in body) {
			if (body.code !== 0) {
				return Promise.reject(new Error(body.message || '请求失败'));
			}
			return body.data;
		}
		return body;
	},
	(error) => {
		const status = error.response?.status;
		const msg = error.response?.data?.message || error.message || '网络错误';

		// 登录态失效，回到登录页
		if (status === 401 && !location.hash.startsWith('#/login')) {
			clearAuth();
			location.hash = '#/login';
		}
		return Promise.reject(new Error(msg));
	},
);

// 供组件使用的便捷封装（拦截器已解包 data）
export async function apiGet<T>(url: string, params?: Record<string, any>): Promise<T> {
	message.destroy('request-error');
	try {
		return (await client.get(url, { params })) as T;
	} catch (e: any) {
		message.error({ content: e.message, key: 'request-error' });
		throw e;
	}
}

export async function apiPost<T>(url: string, data?: any): Promise<T> {
	return (await client.post(url, data)) as T;
}

export async function apiPut<T>(url: string, data?: any): Promise<T> {
	return (await client.put(url, data)) as T;
}

export default client;
