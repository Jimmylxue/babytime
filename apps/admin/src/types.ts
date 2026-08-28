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

// 宝宝列表
export interface BabyParent {
	id: string;
	nickname: string | null;
	avatar: string | null;
}

export interface BabyListItem {
	id: string;
	name: string;
	gender: 'male' | 'female';
	birthday: string;
	avatar: string | null;
	parent: BabyParent | null;
	recordCount: number;
	photoCount: number;
	familyCount: number;
	lastRecordAt: string | null;
	createdAt: string;
}

export interface BabyListResult {
	list: BabyListItem[];
	total: number;
	page: number;
	pageSize: number;
}

export interface FamilyMemberInfo {
	userId: string | null;
	nickname: string | null;
	avatar: string | null;
	role: string;
	status: string;
	createdAt: string;
}

export interface RecentRecord {
	id: string;
	type: string;
	startTime: string;
	endTime: string | null;
	duration: number | null;
	amount: number | null;
	note: string | null;
}

export interface AiAnalysisRecord {
	id: string;
	startTime: string;
	analysis: {
		riskLevel?: string;
		summary?: string;
		observedFeatures?: { color?: string; consistency?: string; visibleFindings?: string[] };
		guidance?: string[];
		concerns?: string[];
	};
}

export interface BabyDetail {
	baby: {
		id: string;
		name: string;
		gender: 'male' | 'female';
		birthday: string;
		avatar: string | null;
		createdAt: string;
		parent: BabyParent | null;
	};
	stats: {
		recordCount: number;
		photoCount: number;
		familyCount: number;
		firstRecordAt: string | null;
		lastRecordAt: string | null;
	};
	recordTypes: RecordTypeDistribution[];
	familyMembers: FamilyMemberInfo[];
	recentRecords: RecentRecord[];
	aiAnalyses: AiAnalysisRecord[];
}

// 漏斗与留存
export interface Funnel {
	totalUsers: number;
	usersWithBaby: number;
	usersWithRecord: number;
}

export interface Retention {
	days: number;
	cohortSize: number;
	activeIn1Day: number;
	activeIn7Day: number;
	activeIn30Day: number;
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
