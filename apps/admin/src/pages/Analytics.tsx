import { useCallback, useEffect, useState } from 'react';
import { Card, Col, Progress, Row, Segmented, Statistic, Table, Typography } from 'antd';
import ReactECharts from 'echarts-for-react';
import { apiGet } from '../api/client';
import type { AlbumMetrics, Engagement, Funnel, Retention, VaccineFunnel } from '../types';

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
	const [vaccine, setVaccine] = useState<VaccineFunnel>();
	const [album, setAlbum] = useState<AlbumMetrics>();

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
		apiGet<VaccineFunnel>('/stats/vaccine-funnel').then(setVaccine);
		apiGet<AlbumMetrics>('/stats/album').then(setAlbum);
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
				left: '6%',
				width: '58%',
				top: 20,
				bottom: 20,
				minSize: '30%',
				label: { formatter: '{b}: {c}', fontSize: 12 },
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

			<Card
				title="疫苗提醒漏斗"
				className="chart-card"
				style={{ marginTop: 16 }}
				extra={<Typography.Text type="secondary">授权 → 发送 → 点击</Typography.Text>}
			>
				{vaccine && !vaccine.configured ? (
					<Typography.Paragraph type="secondary">
						未配置疫苗订阅消息模板（WECHAT_SUBSCRIBE_VACCINE_TEMPLATE_ID），暂无数据。
					</Typography.Paragraph>
				) : (
					<>
						<Row gutter={[16, 16]}>
							<Col xs={12} md={4}><Statistic title="全部用户" value={vaccine?.totalUsers ?? 0} /></Col>
							<Col xs={12} md={4}>
								<Statistic title="消息授权" value={vaccine?.subscribedUsers ?? 0} suffix={` (${vaccine?.authRate ?? 0}%)`} />
							</Col>
							<Col xs={12} md={4}><Statistic title="设置接种计划的宝宝" value={vaccine?.planBabies ?? 0} /></Col>
							<Col xs={12} md={4}>
								<Statistic title="发送成功 / 失败" value={`${vaccine?.sent ?? 0} / ${vaccine?.failed ?? 0}`} suffix={` (${vaccine?.sendSuccessRate ?? 0}%)`} />
							</Col>
							<Col xs={12} md={4}>
								<Statistic title="消息点击" value={vaccine?.clicks ?? 0} suffix={` (${vaccine?.clickRate ?? 0}%)`} />
							</Col>
							<Col xs={12} md={4}><Statistic title="拒绝过授权用户" value={vaccine?.rejectedUsers ?? 0} /></Col>
						</Row>

						<Row gutter={16} style={{ marginTop: 16 }}>
							<Col xs={24} md={14}>
								<ReactECharts
									option={{
										tooltip: { trigger: 'axis' },
										legend: { data: ['发送成功', '发送失败'] },
										grid: { left: 40, right: 16, top: 36, bottom: 28 },
										xAxis: { type: 'category', data: (vaccine?.weekTrend ?? []).map((d) => d.date.slice(5)) },
										yAxis: { type: 'value', minInterval: 1 },
										series: [
											{ name: '发送成功', type: 'bar', stack: 'total', data: (vaccine?.weekTrend ?? []).map((d) => d.sent), itemStyle: { color: '#73d13d' } },
											{ name: '发送失败', type: 'bar', stack: 'total', data: (vaccine?.weekTrend ?? []).map((d) => d.failed), itemStyle: { color: '#ff7875' } },
										],
									}}
									style={{ height: 240 }}
									notMerge
								/>
							</Col>
							<Col xs={24} md={10}>
								<Typography.Text type="secondary">发送失败原因分布（微信错误码）</Typography.Text>
								<Table
									size="small"
									style={{ marginTop: 8 }}
									pagination={false}
									rowKey="code"
									dataSource={(vaccine?.errorCodes ?? []).map((item) => ({ ...item, key: item.code }))}
									columns={[
										{
											title: '错误码',
											dataIndex: 'code',
											render: (code: string) =>
												code === '43101' ? '43101（用户拒收/次数用尽）' : code === 'unknown' ? '未知' : code,
										},
										{ title: '次数', dataIndex: 'count', width: 80 },
									]}
									locale={{ emptyText: '暂无失败记录 🎉' }}
								/>
							</Col>
						</Row>
					</>
				)}
			</Card>

			<Card
				title="相册模块指标"
				className="chart-card"
				style={{ marginTop: 16 }}
				extra={<Typography.Text type="secondary">近 7 天新增照片与上传质量</Typography.Text>}
			>
				<Row gutter={[16, 16]}>
					<Col xs={12} md={4}><Statistic title="照片总量" value={album?.totalPhotos ?? 0} /></Col>
					<Col xs={12} md={4}><Statistic title="用过相册的用户" value={album?.usersWithPhotos ?? 0} /></Col>
					<Col xs={12} md={4}><Statistic title="人均照片" value={album?.avgPerUser ?? 0} suffix="张" /></Col>
					<Col xs={12} md={4}><Statistic title="近 7 天新增" value={album?.photos7 ?? 0} suffix={`/ 近30天 ${album?.photos30 ?? 0}`} /></Col>
					<Col xs={12} md={4}>
						<Statistic title="拍照入口点击（7天）" value={album?.entryClicks7 ?? 0} suffix={` / 首页 ${album?.entryClicks7FromHome ?? 0}`} />
					</Col>
					<Col xs={12} md={4}>
						<Statistic
							title="上传成功率（7天）"
							value={album?.uploadSuccessRate ?? 0}
							suffix="%"
						/>
					</Col>
				</Row>
				<ReactECharts
					option={{
						tooltip: { trigger: 'axis' },
						grid: { left: 40, right: 16, top: 24, bottom: 28 },
						xAxis: { type: 'category', data: (album?.daily7 ?? []).map((d) => d.date.slice(5)) },
						yAxis: { type: 'value', minInterval: 1 },
						series: [
							{
								name: '新增照片',
								type: 'bar',
								data: (album?.daily7 ?? []).map((d) => d.count),
								itemStyle: { color: '#ff85c0' },
							},
						],
					}}
					style={{ height: 240, marginTop: 8 }}
					notMerge
				/>
				<Typography.Text type="secondary" style={{ fontSize: 12 }}>
					入口点击与上传成功率为新版客户端（含埋点）发布后开始累计；上传失败不含用户主动取消。
				</Typography.Text>
			</Card>
		</div>
	);
}
