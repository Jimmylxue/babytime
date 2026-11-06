import { useCallback, useEffect, useState } from 'react';
import { Card, Space, Spin, Switch, Typography, message } from 'antd';
import dayjs from 'dayjs';
import { apiGet, apiPut } from '../api/client';
import type { SystemSettingGroup, SystemSettingItem, SystemSettingsResponse } from '../types';

export default function Settings() {
	const [groups, setGroups] = useState<SystemSettingGroup[]>([]);
	const [loading, setLoading] = useState(false);
	const [savingKey, setSavingKey] = useState<string | null>(null);

	const load = useCallback(async () => {
		setLoading(true);
		try {
			const data = await apiGet<SystemSettingsResponse>('/system/settings');
			setGroups(data.groups || []);
		} finally {
			setLoading(false);
		}
	}, []);

	useEffect(() => {
		load();
	}, [load]);

	const update = async (setting: SystemSettingItem, checked: boolean) => {
		setSavingKey(setting.key);
		try {
			const data = await apiPut<SystemSettingsResponse>('/system/settings', {
				settings: { [setting.key]: checked },
			});
			setGroups(data.groups || []);
			message.success(`已${checked ? '开启' : '关闭'}「${setting.label}」`);
		} catch (error) {
			message.error((error as Error).message || '保存失败');
		} finally {
			setSavingKey(null);
		}
	};

	return (
		<Spin spinning={loading}>
			<Card title="系统设置" className="chart-card">
				<Typography.Paragraph type="secondary">
					这里的开关会立即影响新版本小程序；每次修改都会记入后台审计日志。
					新增配置项时会在对应分组下自动出现。
				</Typography.Paragraph>

				{groups.length === 0 && !loading && (
					<Typography.Text type="secondary">暂无配置项</Typography.Text>
				)}

				{groups.map((group) => (
					<Card
						key={group.key}
						type="inner"
						title={group.label}
						style={{ marginBottom: 16 }}
					>
						{group.settings.map((setting, index) => (
							<div
								key={setting.key}
								style={{
									display: 'flex',
									alignItems: 'flex-start',
									justifyContent: 'space-between',
									gap: 24,
									padding: '14px 0',
									borderTop: index === 0 ? 'none' : '1px solid #f0f0f0',
								}}
							>
								<div style={{ flex: 1, minWidth: 0 }}>
									<Space size={8} align="center" wrap>
										<Typography.Text strong>{setting.label}</Typography.Text>
										<Typography.Text type="secondary" style={{ fontSize: 12 }}>
											{setting.key}
										</Typography.Text>
									</Space>
									<div style={{ marginTop: 6 }}>
										<Typography.Text type="secondary" style={{ fontSize: 12, lineHeight: 1.7 }}>
											{setting.description}
										</Typography.Text>
									</div>
									<div style={{ marginTop: 6 }}>
										<Typography.Text type="secondary" style={{ fontSize: 12 }}>
											{setting.updatedAt
												? `最近修改：${dayjs(setting.updatedAt).format('YYYY-MM-DD HH:mm')}${
														setting.updatedBy ? ` · ${setting.updatedBy}` : ''
												  }`
												: '尚未修改，使用默认值'}
										</Typography.Text>
									</div>
								</div>
								<Switch
									checked={setting.value}
									loading={savingKey === setting.key}
									disabled={savingKey !== null && savingKey !== setting.key}
									onChange={(checked) => update(setting, checked)}
								/>
							</div>
						))}
					</Card>
				))}
			</Card>
		</Spin>
	);
}
