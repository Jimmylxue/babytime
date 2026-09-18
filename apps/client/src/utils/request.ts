import Taro from '@tarojs/taro'
import { useAuthStore } from '../stores/authStore'
import { API_PREFIX } from '../config/env'

interface RequestOptions {
	url: string
	method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'
	data?: any
	header?: Record<string, string>
	/** 是否需要 token，默认 true */
	needToken?: boolean
	/**
	 * 静默请求：失败不弹 toast，也不因 401 清除登录态。
	 * 用于「有兜底、失败也无所谓」的后台调用（如海报场景码），
	 * 否则服务端未部署时会凭空弹一个「请求失败」。
	 */
	silent?: boolean
}

interface ApiResponse<T = any> {
	code: number
	message: string
	data: T
}

// ── token 静默续期 ──
// token 7 天过期原本会强制用户回登录页；但微信登录本身无密码、可静默完成，
// 所以 401 时用新 code 换新 token 并重放原请求，用户无感。单飞：并发 401 只续期一次。
let refreshPromise: Promise<string> | null = null

function refreshToken(): Promise<string> {
	if (!refreshPromise) {
		refreshPromise = doRefreshToken().finally(() => {
			refreshPromise = null
		})
	}
	return refreshPromise
}

async function doRefreshToken(): Promise<string> {
	const loginRes = await Taro.login()
	// 不走 request()：登录接口失败（如 code 无效）不得递归触发续期
	const res = await new Promise<any>((resolve, reject) => {
		Taro.request({
			url: `${API_PREFIX}/user/login`,
			method: 'POST',
			data: { code: loginRes.code },
			header: { 'Content-Type': 'application/json' },
			success: r =>
				r.statusCode === 200 ? resolve(r.data) : reject(new Error('token-refresh-failed')),
			fail: reject,
		})
	})
	const token = res?.data?.token
	if (res?.code !== 0 || !token) {
		throw new Error('token-refresh-bad-payload')
	}
	const user = res.data.user
	Taro.setStorageSync('token', token)
	Taro.setStorageSync('userInfo', user)
	useAuthStore.setState({ token, userInfo: user, isLoggedIn: true })
	return token
}

// 续期也失败（如微信侧登录不可用）：退回原行为，清登录态并提示
function forceRelogin() {
	Taro.removeStorageSync('token')
	Taro.removeStorageSync('userInfo')
	useAuthStore.setState({
		token: null,
		userInfo: null,
		isLoggedIn: false,
	})
	Taro.showToast({ title: '请重新登录', icon: 'none' })
}

const requestInternal = <T = any>(
	options: RequestOptions,
	isRetry: boolean,
): Promise<ApiResponse<T>> => {
	const { needToken = true, silent = false, ...restOptions } = options
	// 直接从 storage 获取 token，确保是最新的（续期成功后重放时能拿到新 token）
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
					// 静默请求与免登录请求不动全局登录态（维持原行为）
					if (!needToken || silent) {
						reject(new Error(res.data?.message || '未授权'))
						return
					}
					if (!isRetry) {
						refreshToken()
							.then(() =>
								requestInternal<T>(options, true).then(resolve, reject),
							)
							.catch(() => {
								forceRelogin()
								reject(new Error(res.data?.message || '未授权'))
							})
						return
					}
					// 续期后仍 401：说明确实不是过期问题，走清登录态
					forceRelogin()
					reject(new Error(res.data?.message || '未授权'))
				} else {
					if (!silent) {
						Taro.showToast({
							title: res.data?.message || '请求失败',
							icon: 'none',
						})
					}
					reject(new Error(res.data?.message))
				}
			},
			fail: err => {
				if (!silent) {
					Taro.showToast({ title: '网络错误', icon: 'none' })
				}
				reject(err)
			},
		})
	})
}

export const request = <T = any>(
	options: RequestOptions,
): Promise<ApiResponse<T>> => requestInternal<T>(options, false)

// 用户相关 API
export const userApi = {
	login: (code: string, source?: string | null) =>
		request<{ token: string; user: any }>({
			url: '/user/login',
			method: 'POST',
			// source：扫码场景值，服务端只在新用户创建时落库（获客归因）
			data: source ? { code, source } : { code },
			needToken: false, // 登录接口不需要 token
		}),
	getProfile: () => request<any>({ url: '/user/profile' }),
	updateProfile: (data: { nickname?: string; avatar?: string; role?: string }) =>
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
	getVaccines: (babyId: string) =>
		request<any[]>({ url: `/record/vaccines/${babyId}` }),
	getStats: (babyId: string, days?: number) =>
		request<any>({
			url: `/record/stats/${babyId}${days ? `?days=${days}` : ''}`,
		}),
	// 明细查询：传 date 取当天明细，传 days 取最近 N 天明细，均含与上一条的间隔
	getDetail: (babyId: string, type: string, params: { date?: string; days?: number; page?: number; pageSize?: number; metric?: 'height' | 'weight' }) => {
		const query = new URLSearchParams({ type })
		if (params.date) query.set('date', params.date)
		if (params.days) query.set('days', String(params.days))
		if (params.page) query.set('page', String(params.page))
		if (params.pageSize) query.set('pageSize', String(params.pageSize))
		if (params.metric) query.set('metric', params.metric)
		return request<{ items: any[]; page: number; pageSize: number; total: number; totalPages: number }>({
			url: `/record/detail/${babyId}?${query.toString()}`,
		})
	},
	getDetailSummary: (babyId: string, type: string, params: { date?: string; days?: number; metric?: 'height' | 'weight' }) => {
		const query = new URLSearchParams({ type })
		if (params.date) query.set('date', params.date)
		if (params.days) query.set('days', String(params.days))
		if (params.metric) query.set('metric', params.metric)
		return request<any>({ url: `/record/detail-summary/${babyId}?${query.toString()}` })
	},
	delete: (id: string) =>
		request<any>({ url: `/record/${id}`, method: 'DELETE' }),
}

// 照片相关 API
export interface PhotoTimelineGroup {
	date: string
	photos: {
		id: string
		url: string
		thumbnail?: string
		photoDate: string
		note?: string
	}[]
}

export interface PhotoTimelinePage {
	items: PhotoTimelineGroup[]
	total: number
	page: number
	pageSize: number
	hasMore: boolean
}

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
	getTimeline: (babyId: string, page = 1, pageSize = 30) =>
		request<PhotoTimelinePage>({
			url: `/photo/timeline/${babyId}?page=${page}&pageSize=${pageSize}`,
		}),
	delete: (id: string) =>
		request<any>({ url: `/photo/${id}`, method: 'DELETE' }),
	deleteBatch: (ids: string[]) =>
		request<any>({ url: '/photo/batch-delete', method: 'POST', data: { ids } }),
}

// 便便图片观察：密钥仅在服务端使用，客户端只提交已上传的图片 URL。
export const stoolAnalysisApi = {
	analyze: (data: { babyId: string; imageUrl: string; symptoms?: string }) =>
		request<any>({ url: '/stool-analysis', method: 'POST', data }),
}

export const announcementApi = {
	getCurrent: () => request<{ id: string; title: string; content: string } | null>({
		url: '/announcement/current',
		needToken: false,
	}),
}

export interface VaccinePlanItem {
	scheduleItemId: string
	label: string
	referenceDate: string
	scheduledDate: string | null
	effectiveDate: string
	completed: boolean
	actualDate: string | null
}

export const notificationApi = {
	getConfig: () => request<{
		vaccineTemplateId: string
		reviewTemplateId: string
		vaccineEnabled: boolean
		reviewEnabled: boolean
	}>({ url: '/notification/config', needToken: false }),
	getStatus: () => request<{
		configured: boolean
		state: 'never' | 'active' | 'exhausted'
		availableCount: number
		acceptedCount: number
		sentCount: number
	}>({ url: '/notification/status' }),
	getVaccinePlans: (babyId: string) =>
		request<VaccinePlanItem[]>({ url: `/notification/vaccine-plans/${babyId}` }),
	setVaccinePlan: (babyId: string, scheduleItemId: string, scheduledDate: string) =>
		request<{ scheduleItemId: string; scheduledDate: string }>({
			url: `/notification/vaccine-plans/${babyId}/${scheduleItemId}`,
			method: 'PUT',
			data: { scheduledDate },
		}),
	removeVaccinePlan: (babyId: string, scheduleItemId: string) =>
		request<{ scheduleItemId: string; scheduledDate: null }>({
			url: `/notification/vaccine-plans/${babyId}/${scheduleItemId}`,
			method: 'DELETE',
		}),
	saveSubscriptions: (statuses: Record<string, string>) =>
		request<any>({ url: '/notification/subscriptions', method: 'POST', data: { statuses } }),
}

export const trackEvent = (name: string, properties?: Record<string, any>) =>
	request<any>({ url: '/user/events', method: 'POST', data: { name, properties } }).catch(() => undefined)

// 文件上传
const uploadInternal = (filePath: string, isRetry: boolean): Promise<{ url: string }> => {
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
					if (res.statusCode === 401 && !isRetry) {
						// token 过期：静默续期后重传一次
						refreshToken()
							.then(() => uploadInternal(filePath, true).then(resolve, reject))
							.catch(() => reject(new Error('未授权')))
						return
					}
					if (res.statusCode === 401) {
						forceRelogin()
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

export const uploadFile = (filePath: string): Promise<{ url: string }> =>
	uploadInternal(filePath, false)

// 家庭成员 API
export const familyApi = {
	createInvite: (babyId: string, force = false) =>
		request<{ inviteCode: string; expiresAt: string }>({
			url: '/family/invite',
			method: 'POST',
			data: { babyId, force },
		}),
	acceptInvite: (inviteCode: string, role?: string) =>
		request<any>({ url: `/family/accept/${inviteCode}`, method: 'POST', data: { role } }),
	getInviteInfo: (inviteCode: string) =>
		request<{
			valid: boolean
			reason: 'invalid' | 'expired' | 'own' | 'already_member' | 'bound_other' | 'full' | null
			inviterNickname: string
			babyName: string
			babyGender?: 'male' | 'female'
		}>({ url: `/family/invite/info/${inviteCode}` }),
	getMembers: () =>
		request<any[]>({ url: '/family/members' }),
	getMyFamilies: () =>
		request<any[]>({ url: '/family/my-families' }),
	getBindingStatus: () =>
		request<{ isBound: boolean; reason: 'owner' | 'member' | null }>({ url: '/family/binding-status' }),
	// 修改成员在本家庭内的昵称（备注名）；nickname 传空串表示恢复默认
	updateMemberNickname: (targetUserId: string, nickname: string) =>
		request<{ success: boolean; nickname: string | null; restored?: boolean }>({
			url: '/family/member/nickname',
			method: 'PATCH',
			data: { targetUserId, nickname },
		}),
	removeMember: (memberId: string) =>
		request<any>({ url: `/family/member/${memberId}`, method: 'DELETE' }),
	leaveFamily: () =>
		request<any>({ url: '/family/leave', method: 'POST' }),
}
