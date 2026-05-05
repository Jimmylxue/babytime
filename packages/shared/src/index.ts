// 记录类型枚举
export enum RecordType {
  FEEDING = 'feeding',        // 喂奶
  DIAPER = 'diaper',          // 换尿布
  SLEEP = 'sleep',            // 睡觉
  GROWTH = 'growth',          // 成长记录
  VACCINE = 'vaccine',        // 疫苗接种
  OTHER = 'other',            // 其他
}

// 喂奶方式
export enum FeedingMethod {
  BREAST = 'breast',          // 母乳
  FORMULA = 'formula',        // 奶粉
  MIXED = 'mixed',            // 混合
}

// 尿布状态
export enum DiaperStatus {
  WET = 'wet',                // 尿了
  DIRTY = 'dirty',            // 拉了
  BOTH = 'both',              // 都有
}

// 通用记录接口
export interface IRecord {
  id: string;
  babyId: string;
  type: RecordType;
  startTime: string;
  endTime?: string;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

// 喂奶记录
export interface IFeedingRecord extends IRecord {
  type: RecordType.FEEDING;
  method: FeedingMethod;
  amount?: number;            // 奶量 (ml)
  duration?: number;          // 时长 (分钟)
}

// 尿布记录
export interface IDiaperRecord extends IRecord {
  type: RecordType.DIAPER;
  status: DiaperStatus;
}

// 睡眠记录
export interface ISleepRecord extends IRecord {
  type: RecordType.SLEEP;
  duration?: number;          // 时长 (分钟)
}

// 宝宝信息
export interface IBaby {
  id: string;
  name: string;
  birthday: string;
  gender: 'male' | 'female';
  avatar?: string;
}

// 用户信息
export interface IUser {
  id: string;
  openId?: string;
  nickname: string;
  avatar?: string;
  babies: IBaby[];
}

// API 响应格式
export interface ApiResponse<T = any> {
  code: number;
  message: string;
  data: T;
}

// 分页参数
export interface PaginationParams {
  page: number;
  pageSize: number;
}

// 分页响应
export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}
