export interface WeekRange {
	start: Date
	end: Date
	startKey: string
	endKey: string
	label: string
}

const pad2 = (n: number) => String(n).padStart(2, '0')
const ymd = (d: Date) =>
	`${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`

function formatWeekRange(start: Date, end: Date): string {
	const sm = start.getMonth() + 1
	const sd = start.getDate()
	const em = end.getMonth() + 1
	const ed = end.getDate()
	const sy = start.getFullYear()
	const ey = end.getFullYear()
	if (sy !== ey) return `${sy}年${sm}月${sd}日 - ${ey}年${em}月${ed}日`
	if (sm === em) return `${sm}月${sd}日 - ${ed}日`
	return `${sm}月${sd}日 - ${em}月${ed}日`
}

/** 上一个完整自然周：周一 00:00 至周日 23:59:59（本地时区） */
export function getLastCompleteWeek(now = new Date()): WeekRange {
	const daysSinceMonday = (now.getDay() + 6) % 7
	const thisMonday = new Date(
		now.getFullYear(),
		now.getMonth(),
		now.getDate() - daysSinceMonday,
	)
	const start = new Date(thisMonday)
	start.setDate(start.getDate() - 7)
	const end = new Date(thisMonday)
	end.setDate(end.getDate() - 1)
	return {
		start,
		end,
		startKey: ymd(start),
		endKey: ymd(end),
		label: formatWeekRange(start, end),
	}
}
