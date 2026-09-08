// 记录页共用时间工具：日期字符串按当天 12 点取值（避开时区与跨天边界），
// 睡眠按 入睡/起床 推算起止时间与时长（跨天入睡则按次日起床计算）
export const buildRecordDate = (date: string) => {
	const [year, month, day] = date.split('-').map(Number)
	return new Date(year, month - 1, day, 12, 0, 0, 0)
}

export const buildTimeOnDate = (baseDate: Date, time: string) => {
	const [hours, minutes] = time.split(':')
	const d = new Date(baseDate)
	d.setHours(parseInt(hours), parseInt(minutes), 0, 0)
	return d
}

export const getSleepRange = (
	recordDate: string,
	startTime: string,
	sleepEndTime: string,
) => {
	const start = buildTimeOnDate(buildRecordDate(recordDate), startTime)
	let end = buildTimeOnDate(buildRecordDate(recordDate), sleepEndTime)
	if (end <= start) {
		end = new Date(end.getTime() + 24 * 60 * 60 * 1000)
	}
	const durationMinutes = Math.round(
		(end.getTime() - start.getTime()) / 60000,
	)
	return { start, end, durationMinutes }
}
