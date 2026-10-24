// 各月龄「一次清醒能撑多久」的常见参考区间（分钟）。
// 只用于首页的温和提示（可能快困了 / 可能有点闹觉），不做发育判断；
// 宝宝之间差异很大，提示语里始终带「可能」。
const WAKE_WINDOWS: { monthsBelow: number; minMinutes: number; maxMinutes: number }[] = [
	{ monthsBelow: 1, minMinutes: 45, maxMinutes: 60 },
	{ monthsBelow: 2, minMinutes: 60, maxMinutes: 90 },
	{ monthsBelow: 3, minMinutes: 75, maxMinutes: 105 },
	{ monthsBelow: 4, minMinutes: 90, maxMinutes: 120 },
	{ monthsBelow: 5, minMinutes: 105, maxMinutes: 150 },
	{ monthsBelow: 6, minMinutes: 120, maxMinutes: 165 },
	{ monthsBelow: 8, minMinutes: 135, maxMinutes: 195 },
	{ monthsBelow: 10, minMinutes: 150, maxMinutes: 210 },
	{ monthsBelow: 12, minMinutes: 180, maxMinutes: 240 },
	{ monthsBelow: 15, minMinutes: 210, maxMinutes: 300 },
	{ monthsBelow: 18, minMinutes: 240, maxMinutes: 330 },
]

export interface WakeWindow {
	minMinutes: number
	maxMinutes: number
}

export function getWakeWindow(months: number): WakeWindow | null {
	const row = WAKE_WINDOWS.find(item => months < item.monthsBelow)
	return row ? { minMinutes: row.minMinutes, maxMinutes: row.maxMinutes } : null
}
