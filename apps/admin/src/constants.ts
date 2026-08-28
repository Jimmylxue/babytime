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

// 按出生日期计算月龄文案，如 "5个月" / "1岁3个月"
export function formatAge(birthday: string | null | undefined): string {
	if (!birthday) return '-';
	const birth = new Date(birthday);
	if (Number.isNaN(birth.getTime())) return '-';
	const now = new Date();
	let months = (now.getFullYear() - birth.getFullYear()) * 12 + (now.getMonth() - birth.getMonth());
	if (now.getDate() < birth.getDate()) months -= 1;
	if (months < 0) return '未出生';
	if (months === 0) return '不满1个月';
	if (months < 12) return `${months}个月`;
	const years = Math.floor(months / 12);
	const rest = months % 12;
	return rest === 0 ? `${years}岁` : `${years}岁${rest}个月`;
}
