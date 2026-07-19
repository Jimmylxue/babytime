import Taro from '@tarojs/taro'
import { useAuthStore } from '../stores/authStore'
import { API_PREFIX } from '../config/env'

interface RequestOptions {
	url: string
	method?: 'GET' | 'POST' | 'PUT' | 'DELETE'
	data?: any
	header?: Record<string, string>
	/** 是否需要 token，默认 true */
	needToken?: boolean
}

interface ApiResponse<T = any> {
	code: number
	message: string
	data: T
}

export const request = <T = any>(
	options: RequestOptions,
): Promise<ApiResponse<T>> => {
	const { needToken = true, ...restOptions } = options
	// 直接从 storage 获取 token，确保是最新的
	const token = Taro.getStorageSync('token')

	const header: Record<string, string> = {
		'Content-Type': 'application/json',
		...restOptions.header,
	}

	// 只在需要 token 且 token 存在时才添加 Authorization
	if (needToken && token) {
		header['Authorization'] = `Bearer ${token}`
	}

	return new Promise((resolve, reject) => {
		Taro.request({
			url: `${API_PREFIX}${restOptions.url}`,
			method: restOptions.method || 'GET',
			data: restOptions.data,
			header,
			success: res => {
				if (res.statusCode === 200) {
					resolve(res.data as ApiResponse<T>)
				} else if (res.statusCode === 401) {
					// token 过期，清除登录状态
					if (needToken) {
						Taro.removeStorageSync('token')
						Taro.removeStorageSync('userInfo')
						useAuthStore.setState({
							token: null,
							userInfo: null,
							isLoggedIn: false,
						})
						Taro.showToast({ title: '请重新登录', icon: 'none' })
					}
					reject(new Error(res.data?.message || '未授权'))
				} else {
					Taro.showToast({
						title: res.data?.message || '请求失败',
						icon: 'none',
					})
					reject(new Error(res.data?.message))
				}
			},
			fail: err => {
				Taro.showToast({ title: '网络错误', icon: 'none' })
				reject(err)
			},
		})
	})
}

// 用户相关 API
export const userApi = {
	login: (code: string) =>
		request<{ token: string; user: any }>({
			url: '/user/login',
			method: 'POST',
			data: { code },
			needToken: false, // 登录接口不需要 token
		}),
	getProfile: () => request<any>({ url: '/user/profile' }),
	updateProfile: (data: { nickname?: string; avatar?: string }) =>
		request<any>({ url: '/user/update', method: 'POST', data }),
}

// 宝贝相关 API
export const babyApi = {
	create: (data: {
		name: string
		gender: 'male' | 'female'
		birthday: string
	}) => request<any>({ url: '/baby', method: 'POST', data }),
	getAll: () => request<any[]>({ url: '/baby' }),
	getOne: (id: string) => request<any>({ url: `/baby/${id}` }),
	update: (id: string, data: any) =>
		request<any>({ url: `/baby/${id}`, method: 'PUT', data }),
	delete: (id: string) =>
		request<any>({ url: `/baby/${id}`, method: 'DELETE' }),
}

// 记录相关 API
export const recordApi = {
	create: (data: any) => request<any>({ url: '/record', method: 'POST', data }),
	update: (id: string, data: any) =>
		request<any>({ url: `/record/${id}`, method: 'PUT', data }),
	getOne: (id: string) => request<any>({ url: `/record/${id}` }),
	getByBaby: (babyId: string, date?: string) =>
		request<any[]>({
			url: `/record/baby/${babyId}${date ? `?date=${date}` : ''}`,
		}),
	getSummary: (babyId: string) =>
		request<any>({ url: `/record/summary/${babyId}` }),
	getStats: (babyId: string, days?: number) =>
		request<any>({
			url: `/record/stats/${babyId}${days ? `?days=${days}` : ''}`,
		}),
	// 明细查询：传 date 取当天明细，传 days 取最近 N 天明细，均含与上一条的间隔
	getDetail: (babyId: string, type: string, params: { date?: string; days?: number }) => {
		const query = new URLSearchParams({ type })
		if (params.date) query.set('date', params.date)
		if (params.days) query.set('days', String(params.days))
		return request<{ items: any[]; summary: any }>({
			url: `/record/detail/${babyId}?${query.toString()}`,
		})
	},
	delete: (id: string) =>
		request<any>({ url: `/record/${id}`, method: 'DELETE' }),
}

// 照片相关 API
export const photoApi = {
	create: (data: {
		babyId: string
		url: string
		thumbnail?: string
		photoDate: string
		note?: string
	}) => request<any>({ url: '/photo', method: 'POST', data }),
	getByBaby: (babyId: string, page?: number, pageSize?: number) =>
		request<any>({
			url: `/photo/baby/${babyId}?page=${page || 1}&pageSize=${pageSize || 20}`,
		}),
	getTimeline: (babyId: string) =>
		request<any[]>({ url: `/photo/timeline/${babyId}` }),
	delete: (id: string) =>
		request<any>({ url: `/photo/${id}`, method: 'DELETE' }),
}

// 文件上传
export const uploadFile = (filePath: string): Promise<{ url: string }> => {
	const token = Taro.getStorageSync('token')
	return new Promise((resolve, reject) => {
		Taro.uploadFile({
			url: `${API_PREFIX}/upload`,
			filePath,
			name: 'file',
			formData: {
				source: 'miniapp',
			},
			header: {
				...(token ? { Authorization: `Bearer ${token}` } : {}),
			},
			success: res => {
				try {
					const data =
						typeof res.data === 'string' ? JSON.parse(res.data) : res.data
					if (res.statusCode === 200) {
						resolve(data.data || data)
						return
					}
					reject(new Error(data?.message || '上传失败'))
				} catch (error) {
					reject(new Error('上传响应解析失败'))
				}
			},
			fail: err => {
				console.error('uploadFile fail', { filePath, err })
				reject(err)
			},
		})
	})
}

// 家庭成员 API
export const familyApi = {
	createInvite: (babyId: string, role?: string) =>
		request<any>({ url: '/family/invite', method: 'POST', data: { babyId, role } }),
	acceptInvite: (inviteCode: string, role?: string) =>
		request<any>({ url: `/family/accept/${inviteCode}`, method: 'POST', data: { role } }),
	getMembers: () =>
		request<any[]>({ url: '/family/members' }),
	getMyFamilies: () =>
		request<any[]>({ url: '/family/my-families' }),
	getBindingStatus: () =>
		request<{ isBound: boolean; reason: 'owner' | 'member' | null }>({ url: '/family/binding-status' }),
	removeMember: (memberId: string) =>
		request<any>({ url: `/family/member/${memberId}`, method: 'DELETE' }),
	leaveFamily: () =>
		request<any>({ url: '/family/leave', method: 'POST' }),
}
