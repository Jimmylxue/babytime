// 统计接口类型
export interface Overview {
	totalUsers: number;
	todayUsers: number;
	weekNewUsers: number;
	totalBabies: number;
	todayBabies: number;
	totalRecords: number;
	todayRecords: number;
	todayActiveUsers: number;
	weekActiveUsers: number;
	aiAnalysisTotal: number;
	aiAnalysisToday: number;
	totalPhotos: number;
	familyMembers: number;
}

export interface TrendPoint {
	date: string;
	count: number;
}

export interface Trends {
	days: number;
	newUsers: TrendPoint[];
	newRecords: TrendPoint[];
	activeUsers: TrendPoint[];
}

export interface RecordTypeDistribution {
	type: string;
	count: number;
}

export interface BabyGenderDistribution {
	gender: string;
	count: number;
}

export interface Distribution {
	recordTypes: RecordTypeDistribution[];
	babyGenders: BabyGenderDistribution[];
}

// 用户列表
export interface AdminUser {
	id: string;
	nickname: string;
	avatar: string | null;
	openId: string | null;
	babyCount: number;
	recordCount: number;
	createdAt: string;
}

export interface UserListResult {
	list: AdminUser[];
	total: number;
	page: number;
	pageSize: number;
}

// 公告
export interface Announcement {
	id: string;
	title: string;
	content: string;
	isActive: boolean;
	publishedAt: string;
	createdAt: string;
	updatedAt: string;
}

export interface AnnouncementPayload {
	title: string;
	content: string;
	isActive: boolean;
}
