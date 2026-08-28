// 每次 App 启动最多自动跳转一次引导页（跳过/创建后置位，避免反复弹）
let autoRedirected = false

export function hasAutoRedirectedToOnboarding(): boolean {
	return autoRedirected
}

export function markAutoRedirectedToOnboarding(): void {
	autoRedirected = true
}
