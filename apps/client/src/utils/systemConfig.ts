import { systemApi, SystemClientConfig } from './request';

const DEFAULT_CONFIG: SystemClientConfig = {
	momentOriginalUpload: false,
	communityEnabled: false,
};

let cached: { at: number; data: SystemClientConfig } | null = null;
let inflight: Promise<SystemClientConfig> | null = null;

/**
 * 公开配置统一走这里：60 秒内存缓存，失败时返回安全默认值。
 * 发布页/首页/发现页都会读，避免每次进页面都打一次配置接口。
 */
export async function getSystemConfig(force = false): Promise<SystemClientConfig> {
	if (!force && cached && Date.now() - cached.at < 60_000) {
		return cached.data;
	}
	if (inflight) return inflight;

	inflight = systemApi
		.getConfig()
		.then((res) => {
			const data = { ...DEFAULT_CONFIG, ...(res.data || {}) };
			cached = { at: Date.now(), data };
			return data;
		})
		.catch(() => DEFAULT_CONFIG)
		.finally(() => {
			inflight = null;
		});
	return inflight;
}
