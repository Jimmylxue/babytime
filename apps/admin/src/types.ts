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
	totalPhotos: number;
	familyMembers: number;
	vaccineSubscribedUsers: number;
	vaccineAvailableUsers: number;
	vaccineConfigured: boolean;
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

// 疫苗提醒漏斗
export interface VaccineFunnel {
	configured: boolean;
	totalUsers: number;
	subscribedUsers: number;
	rejectedUsers: number;
	authRate: number;
	planBabies: number;
	deliveries: number;
	sent: number;
	failed: number;
	sendSuccessRate: number;
	clicks: number;
	clickUsers: number;
	clickRate: number;
	errorCodes: { code: string; count: number }[];
	weekTrend: { date: string; sent: number; failed: number }[];
}

// 相册模块指标
export interface AlbumMetrics {
	totalPhotos: number;
	usersWithPhotos: number;
	avgPerUser: number;
	photos7: number;
	photos30: number;
	daily7: { date: string; count: number }[];
	entryClicks7: number;
	entryClicks7FromHome: number;
	uploadSuccess7: number;
	uploadFail7: number;
	uploadSuccessRate: number;
}

// 小应用（应用 tab）使用情况
export interface ToolsAppMetrics {
	key: string;
	label: string;
	clicks7: number;
	clickUsers7: number;
	opens7: number;
	openUsers7: number;
	users30: number;
	openRate: number;
}

export interface ToolsMetrics {
	hubViews7: number;
	hubUsers7: number;
	toolUsers7: number;
	activeUsers7: number;
	usageRate: number;
	apps: ToolsAppMetrics[];
	daily14: { date: string; hubViews: number; opens: number }[];
}

// 用户列表
export interface AdminUser {
	id: string;
	nickname: string;
	avatar: string | null;
	openId: string | null;
	/** 获客来源（扫码场景值）；null = 自然流入 */
	acquisitionSource?: string | null;
	babyCount: number;
	recordCount: number;
	createdAt: string;
}

export interface UserSourceCount {
	/** null 表示自然流入（没带场景值注册的） */
	source: string | null;
	count: number;
}

export interface UserListResult {
	list: AdminUser[];
	/** 按来源汇总的用户数（全量，不受分页影响） */
	sourceCounts?: UserSourceCount[];
	total: number;
	page: number;
	pageSize: number;
}

// 用户名下的宝宝（用户列表「宝宝数」弹窗）
export interface UserBabyItem {
	id: string;
	name: string;
	gender: string;
	birthday: string | null;
	avatar: string | null;
	createdAt: string;
}

export interface UserBabiesResult {
	list: UserBabyItem[];
}

// 账号注销预览（不可逆，删前先看清楚会动到哪些数据）
export interface UserDeletionCounts {
	babies: number;
	records: number;
	photos: number;
	milestones: number;
	vaccinePlans: number;
	invites: number;
	/** 他创建的家庭里已加入的家人数 */
	familyMembers: number;
	/** 他作为成员加入的他人家庭数 */
	joinedFamilies: number;
	aliases: number;
	deliveries: number;
	grants: number;
	events: number;
	/** 记在别人家宝宝上、注销后只清空作者不删除的行数 */
	externalActorRows: number;
	images: number;
}

export interface UserDeletionPlan {
	/** 服务端要求的确认词，输入框按它校验 */
	confirmWord: string;
	user: { id: string; nickname: string; openId: string | null; createdAt: string };
	babies: { id: string; name: string; birthday: string | null }[];
	counts: UserDeletionCounts;
	impact: {
		sharedMemberUsers: number;
		joinedFamilies: { babyName: string; ownerNickname: string }[];
	};
}

export interface UserDeletionResult {
	success: boolean;
	nickname: string;
	counts: UserDeletionCounts;
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
}

// 宝宝详情 · 照片（按 ID 排障查看，服务端落审计日志）
export interface AdminBabyPhoto {
	id: string;
	url: string;
	thumbnail: string | null;
	photoDate: string;
	createdAt: string;
}

export interface BabyPhotoListResult {
	list: AdminBabyPhoto[];
	total: number;
	page: number;
	pageSize: number;
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
	eligibleIn1Day: number;
	eligibleIn7Day: number;
	eligibleIn30Day: number;
}

export interface Engagement {
	subscribedUsers: number;
	acceptedGrants: number;
	rejectedGrants: number;
	sentMessages: number;
	failedMessages: number;
	weekOpens: number;
	weekOpenUsers: number;
	notificationOpens: number;
	notificationOpenUsers: number;
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

export interface NotificationSubscription {
	userId: string;
	nickname: string | null;
	avatar: string | null;
	templateId: string;
	status: string;
	availableCount: number;
	acceptedCount: number;
	rejectedCount: number;
	sentCount: number;
	babyId: string | null;
	babyName: string | null;
	grantedAt: string | null;
	lastSentAt: string | null;
}

export interface NotificationSubscriptionResult {
	list: NotificationSubscription[];
	total: number;
	page: number;
	pageSize: number;
}

// 运维看板：HTTPS 证书与域名到期
export interface OpsEndpointStatus {
	host: string;
	purpose: string;
	managedBy: string;
	reachable: boolean;
	trusted: boolean;
	issuer: string;
	validTo: string;
	daysLeft: number | null;
	latencyMs: number | null;
	error: string | null;
}

export interface OpsHttpsStatus {
	checkedAt: string;
	cached: boolean;
	endpoints: OpsEndpointStatus[];
	domain: {
		name: string;
		expiresAt: string | null;
		daysLeft: number | null;
	};
}

// 成长里程碑分析
export interface MilestoneDailyPoint {
	date: string;
	count: number;
	users: number;
}

export interface MilestoneCategoryStat {
	key: string;
	count: number;
	users: number;
}

export interface MilestoneTopItem {
	code: string;
	title: string;
	count: number;
	users: number;
	photoCount: number;
}

export interface MilestoneFunnel {
	views7: number;
	viewUsers7: number;
	posterShares7: number;
	posterUsers7: number;
	deletes7: number;
	checkIns7: number;
	checkInUsers7: number;
	conversionRate7: number;
}

export interface MilestoneMetrics {
	total: number;
	users: number;
	babies: number;
	today: number;
	weekNew: number;
	monthNew: number;
	customCount: number;
	photoCount: number;
	deletedActorCount: number;
	users7: number;
	users30: number;
	totalUsers: number;
	totalBabies: number;
	userCoverageRate: number;
	babyCoverageRate: number;
	avgPerBaby: number;
	customRate: number;
	photoRate: number;
	daily: MilestoneDailyPoint[];
	categories: MilestoneCategoryStat[];
	top: MilestoneTopItem[];
	funnel: MilestoneFunnel;
}

export interface MilestoneUsageBaby {
	id: string;
	name: string;
	count: number;
}

export interface MilestoneUsageUser {
	userId: string | null;
	nickname: string | null;
	openId: string | null;
	count: number;
	customCount: number;
	babyCount: number;
	firstAt: string;
	lastAt: string;
	babies: MilestoneUsageBaby[];
}

export interface MilestoneUsageResult {
	list: MilestoneUsageUser[];
	total: number;
	page: number;
	pageSize: number;
}

// 系统设置
export interface SystemSettingItem {
	key: string;
	label: string;
	description: string;
	type: 'boolean';
	value: boolean;
	updatedAt: string | null;
	updatedBy: string | null;
}

export interface SystemSettingGroup {
	key: string;
	label: string;
	settings: SystemSettingItem[];
}

export interface SystemSettingsResponse {
	groups: SystemSettingGroup[];
}

// 育娃圈后台管理
export interface CommunityAuthor {
	nickname: string;
	avatar: string | null;
}

export interface CommunityPhoto {
	id: string;
	url: string;
	thumbnail: string | null;
	photoDate: string;
}

export interface CommunityPost {
	id: string;
	content: string | null;
	createdAt: string;
	author: CommunityAuthor;
	photos: CommunityPhoto[];
	likeCount: number;
	commentCount: number;
}

export interface CommunityPostList {
	list: CommunityPost[];
	total: number;
	page: number;
	pageSize: number;
}

export interface CommunityReportMoment {
	type: 'moment';
	id: string;
	content: string | null;
	createdAt: string;
	visibility: string;
	author: CommunityAuthor;
	photos: CommunityPhoto[];
}

export interface CommunityReportComment {
	type: 'comment';
	id: string;
	content: string;
	status: string;
	createdAt: string;
	author: CommunityAuthor;
	moment: {
		id: string;
		content: string | null;
		createdAt: string;
		visibility: string;
		author: CommunityAuthor;
		photos: CommunityPhoto[];
	} | null;
}

export type CommunityReportTarget =
	| CommunityReportMoment
	| CommunityReportComment
	| null;

export interface CommunityReport {
	id: string;
	targetType: 'moment' | 'comment';
	targetId: string;
	reason: string;
	detail: string | null;
	status: 'pending' | 'handled' | 'dismissed';
	createdAt: string;
	reporter: CommunityAuthor;
	target: CommunityReportTarget;
}

export interface CommunityReportList {
	list: CommunityReport[];
	total: number;
	page: number;
	pageSize: number;
}

// 后台点击点赞/评论数后懒加载的互动明细
export interface CommunityLikeUser {
	userId: string;
	createdAt: string;
	author: CommunityAuthor;
}

export interface CommunityInteractionComment {
	id: string;
	content: string;
	status: 'visible' | 'hidden';
	createdAt: string;
	author: CommunityAuthor;
	canDelete?: boolean;
	parentId: string | null;
	replyToNickname: string | null;
	replies: CommunityInteractionComment[];
}

export interface CommunityInteractions {
	post: {
		id: string;
		content: string | null;
		visibility: string;
		author: CommunityAuthor;
	};
	likes: CommunityLikeUser[];
	comments: CommunityInteractionComment[];
}
