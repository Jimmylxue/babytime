import { useCallback, useEffect, useState } from 'react';
import { Card, Col, Progress, Row, Segmented, Statistic, Typography } from 'antd';
import ReactECharts from 'echarts-for-react';
import { apiGet } from '../api/client';
import type { Engagement, Funnel, Retention } from '../types';

const COHORT_OPTIONS = [
	{ label: '近 90 天注册', value: 90 },
	{ label: '近 180 天注册', value: 180 },
	{ label: '近 365 天注册', value: 365 },
];

const pct = (part: number, whole: number) => (whole > 0 ? Math.round((part / whole) * 1000) / 10 : 0);

export default function Analytics() {
	const [funnel, setFunnel] = useState<Funnel>();
	const [retention, setRetention] = useState<Retention>();
	const [days, setDays] = useState(90);
	const [engagement, setEngagement] = useState<Engagement>();

	const loadFunnel = useCallback(async () => {
		const data = await apiGet<Funnel>('/stats/funnel');
		setFunnel(data);
	}, []);

	const loadRetention = useCallback(async (rangeDays: number) => {
		const data = await apiGet<Retention>('/stats/retention', { days: rangeDays });
		setRetention(data);
	}, []);

	useEffect(() => {
		loadFunnel();
		apiGet<Engagement>('/stats/engagement').then(setEngagement);
	}, [loadFunnel]);

	useEffect(() => {
		loadRetention(days);
	}, [days, loadRetention]);

	const funnelOption = {
		tooltip: { trigger: 'item', formatter: '{b}: {c} 人' },
		series: [
			{
				name: '转化漏斗',
				type: 'funnel',
				left: '10%',
				width: '80%',
				top: 20,
				bottom: 20,
				minSize: '30%',
				label: { formatter: '{b}: {c}' },
				data: [
					{ name: '注册用户', value: funnel?.totalUsers ?? 0 },
					{ name: '创建宝宝档案', value: funnel?.usersWithBaby ?? 0 },
					{ name: '产生记录', value: funnel?.usersWithRecord ?? 0 },
				],
			},
		],
	};

	return (
		<div>
			<Card title="转化漏斗" className="chart-card" style={{ marginBottom: 16 }}>
				<Row gutter={16} align="middle">
					<Col xs={24} md={12}>
						<ReactECharts option={funnelOption} style={{ height: 300 }} notMerge />
					</Col>
					<Col xs={24} md={12}>
						<Row gutter={[16, 16]}>
							<Col span={24}>
								<Statistic
									title="注册 → 建档转化率"
									value={pct(funnel?.usersWithBaby ?? 0, funnel?.totalUsers ?? 0)}
									suffix="%"
								/>
								<Typography.Text type="secondary" style={{ fontSize: 12 }}>
									{funnel?.usersWithBaby ?? 0} / {funnel?.totalUsers ?? 0} 人创建了宝宝档案
								</Typography.Text>
							</Col>
							<Col span={24}>
								<Statistic
									title="建档 → 首条记录转化率"
									value={pct(funnel?.usersWithRecord ?? 0, funnel?.usersWithBaby ?? 0)}
									suffix="%"
								/>
								<Typography.Text type="secondary" style={{ fontSize: 12 }}>
									{funnel?.usersWithRecord ?? 0} / {funnel?.usersWithBaby ?? 0} 人产生了记录
								</Typography.Text>
							</Col>
							<Col span={24}>
								<Statistic
									title="注册 → 首条记录整体转化率"
									value={pct(funnel?.usersWithRecord ?? 0, funnel?.totalUsers ?? 0)}
									suffix="%"
								/>
							</Col>
						</Row>
					</Col>
				</Row>
			</Card>

			<Card
				title="新用户活跃情况"
				className="chart-card"
				extra={
					<Segmented options={COHORT_OPTIONS} value={days} onChange={(value) => setDays(value as number)} />
				}
			>
				<Typography.Paragraph type="secondary">
					统计最近 {days} 天注册且已走完观察周期的用户，在注册后的第 1 / 7 / 30 个自然日再次打开或记录的比例。
				</Typography.Paragraph>
				<Row gutter={16}>
					<Col xs={24} sm={8}>
						<Card>
							<Progress type="circle" percent={pct(retention?.activeIn1Day ?? 0, retention?.eligibleIn1Day ?? 0)} />
							<div style={{ marginTop: 12 }}>
								<Statistic title="D1 回访" value={retention?.activeIn1Day ?? 0} suffix={`/ ${retention?.eligibleIn1Day ?? 0} 人`} />
							</div>
						</Card>
					</Col>
					<Col xs={24} sm={8}>
						<Card>
							<Progress type="circle" percent={pct(retention?.activeIn7Day ?? 0, retention?.eligibleIn7Day ?? 0)} />
							<div style={{ marginTop: 12 }}>
								<Statistic title="D7 回访" value={retention?.activeIn7Day ?? 0} suffix={`/ ${retention?.eligibleIn7Day ?? 0} 人`} />
							</div>
						</Card>
					</Col>
					<Col xs={24} sm={8}>
						<Card>
							<Progress type="circle" percent={pct(retention?.activeIn30Day ?? 0, retention?.eligibleIn30Day ?? 0)} />
							<div style={{ marginTop: 12 }}>
								<Statistic title="D30 回访" value={retention?.activeIn30Day ?? 0} suffix={`/ ${retention?.eligibleIn30Day ?? 0} 人`} />
							</div>
						</Card>
					</Col>
				</Row>
			</Card>

			<Card title="订阅与唤回" className="chart-card" style={{ marginTop: 16 }}>
				<Row gutter={[16, 16]}>
					<Col xs={12} md={6}><Statistic title="已授权用户" value={engagement?.subscribedUsers ?? 0} /></Col>
					<Col xs={12} md={6}><Statistic title="剩余发送次数 / 拒绝次数" value={`${engagement?.acceptedGrants ?? 0} / ${engagement?.rejectedGrants ?? 0}`} /></Col>
					<Col xs={12} md={6}><Statistic title="发送成功 / 失败" value={`${engagement?.sentMessages ?? 0} / ${engagement?.failedMessages ?? 0}`} /></Col>
					<Col xs={12} md={6}><Statistic title="消息点击用户" value={engagement?.notificationOpenUsers ?? 0} suffix={` / ${engagement?.notificationOpens ?? 0} 次`} /></Col>
				</Row>
			</Card>
		</div>
	);
}
