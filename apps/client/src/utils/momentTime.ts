const pad2 = (n: number) => String(n).padStart(2, '0');

/** 朋友圈式时间：今天 / 昨天 / 本年 / 更早 */
export const formatMomentTime = (iso: string) => {
	const date = new Date(iso);
	if (Number.isNaN(date.getTime())) return '';
	const now = new Date();
	const startOfDay = (d: Date) =>
		new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
	const diffDays = Math.round((startOfDay(now) - startOfDay(date)) / 86400000);
	const hm = `${pad2(date.getHours())}:${pad2(date.getMinutes())}`;
	if (diffDays === 0) return `今天 ${hm}`;
	if (diffDays === 1) return `昨天 ${hm}`;
	const md = `${date.getMonth() + 1}月${date.getDate()}日`;
	if (date.getFullYear() === now.getFullYear()) return `${md} ${hm}`;
	return `${date.getFullYear()}年${md}`;
};
