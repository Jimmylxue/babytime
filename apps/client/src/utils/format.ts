/**
 * 测量值展示：最多两位小数，去掉末尾多余的 0。
 *
 * 体重列是 decimal(5,2)（能录到 6.75kg），统一 toFixed(1) 会把 6.75 显示成 6.8，
 * 与记录页/首页展示的原始值对不上。身高列是 decimal(5,1)，走同一函数只是顺手去掉 "68.0" 的尾零。
 */
export function formatMeasurement(value: number): string {
	return String(+value.toFixed(2))
}
