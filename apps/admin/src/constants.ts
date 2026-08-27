// 与 apps/server/src/modules/record/entities/record.entity.ts 的 RecordType 保持一致
export const RECORD_TYPE_LABELS: Record<string, string> = {
	feeding: '喂奶',
	diaper: '尿布',
	sleep: '睡觉',
	food: '辅食',
	water: '喝水',
	temperature: '体温',
	height_weight: '身高体重',
	medicine: '用药',
	vaccine: '疫苗',
	bath: '洗澡',
	outdoor: '户外活动',
	other: '其他',
};

export const GENDER_LABELS: Record<string, string> = {
	male: '男宝宝',
	female: '女宝宝',
};
