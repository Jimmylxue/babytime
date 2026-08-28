import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { Card, Col, Row, Segmented, Statistic, Spin, Typography } from 'antd';
import {
	CameraOutlined,
	FileTextOutlined,
	RobotOutlined,
	RiseOutlined,
	SmileOutlined,
	TeamOutlined,
	UserAddOutlined,
	UserOutlined,
} from '@ant-design/icons';
import ReactECharts from 'echarts-for-react';
import { apiGet } from '../api/client';
import { GENDER_LABELS, RECORD_TYPE_LABELS } from '../constants';
import type { Distribution, Overview, Trends } from '../types';

const DAYS_OPTIONS = [
	{ label: '近 7 天', value: 7 },
	{ label: '近 30 天', value: 30 },
	{ label: '近 90 天', value: 90 },
];

const CHART_HEIGHT = 320;

function KpiCard({
	title,
	value,
	sub,
	icon,
	tone = 'blue',
}: {
	title: string;
	value: number;
	sub?: string;
	icon: ReactNode;
	tone?: 'blue' | 'cyan' | 'green' | 'gold' | 'purple' | 'coral' | 'rose' | 'indigo';
}) {
	return (
		<Card className={`dashboard-kpi dashboard-kpi-${tone}`} bordered={false}>
			<div className="dashboard-kpi-header">
				<Typography.Text className="dashboard-kpi-title">{title}</Typography.Text>
				<span className="dashboard-kpi-icon" aria-hidden="true">
					{icon}
				</span>
			</div>
			<Statistic value={value} />
			<div className="dashboard-kpi-sub">{sub || '\u00a0'}</div>
		</Card>
	);
}

export default function Dashboard() {
	const [overview, setOverview] = useState<Overview>();
	const [trends, setTrends] = useState<Trends>();
	const [distribution, setDistribution] = useState<Distribution>();
	const [days, setDays] = useState(30);

	const loadOverview = useCallback(async () => {
		const data = await apiGet<Overview>('/stats/overview');
		setOverview(data);
	}, []);

	const loadTrends = useCallback(async (rangeDays: number) => {
		const data = await apiGet<Trends>('/stats/trends', { days: rangeDays });
		setTrends(data);
	}, []);

	const loadDistribution = useCallback(async () => {
		const data = await apiGet<Distribution>('/stats/distribution');
		setDistribution(data);
	}, []);

	useEffect(() => {
		loadOverview();
		loadDistribution();
	}, [loadOverview, loadDistribution]);

	useEffect(() => {
		loadTrends(days);
	}, [days, loadTrends]);

	const dates = trends?.newUsers.map((point) => point.date.slice(5)) ?? [];

	const newUserOption = {
		tooltip: { trigger: 'axis' },
		grid: { left: 40, right: 24, top: 40, bottom: 32 },
		xAxis: { type: 'category', data: dates },
		yAxis: { type: 'value', minInterval: 1 },
		series: [
			{
				name: '每日新增用户',
				type: 'line',
				smooth: true,
				data: trends?.newUsers.map((point) => point.count) ?? [],
				areaStyle: { opacity: 0.15 },
				itemStyle: { color: '#1677ff' },
			},
		],
	};

	const recordActiveOption = {
		tooltip: { trigger: 'axis' },
		legend: { data: ['每日新增记录', '每日活跃用户'] },
		grid: { left: 40, right: 24, top: 48, bottom: 32 },
		xAxis: { type: 'category', data: dates },
		yAxis: { type: 'value', minInterval: 1 },
		series: [
			{
				name: '每日新增记录',
				type: 'line',
				smooth: true,
				data: trends?.newRecords.map((point) => point.count) ?? [],
				itemStyle: { color: '#52c41a' },
			},
			{
				name: '每日活跃用户',
				type: 'line',
				smooth: true,
				data: trends?.activeUsers.map((point) => point.count) ?? [],
				itemStyle: { color: '#faad14' },
			},
		],
	};

	const recordTypeOption = {
		tooltip: { trigger: 'item', formatter: '{b}: {c} 条 ({d}%)' },
		legend: { orient: 'vertical', right: 8, top: 'middle', type: 'scroll' },
		series: [
			{
				name: '记录类型',
				type: 'pie',
				radius: ['40%', '68%'],
				center: ['40%', '50%'],
				data:
					distribution?.recordTypes.map((item) => ({
						name: RECORD_TYPE_LABELS[item.type] ?? item.type,
						value: item.count,
					})) ?? [],
			},
		],
	};

	const genderOption = {
		tooltip: { trigger: 'item', formatter: '{b}: {c} 个 ({d}%)' },
		legend: { bottom: 0 },
		series: [
			{
				name: '宝宝性别',
				type: 'pie',
				radius: '62%',
				data:
					distribution?.babyGenders.map((item) => ({
						name: GENDER_LABELS[item.gender] ?? item.gender,
						value: item.count,
					})) ?? [],
			},
		],
	};

	return (
		<Spin spinning={!overview}>
			<Row gutter={[16, 16]} className="dashboard-kpis">
				<Col xs={24} sm={12} lg={6}>
					<KpiCard title="累计用户" value={overview?.totalUsers ?? 0} sub={`近 7 日新增 ${overview?.weekNewUsers ?? 0}`} icon={<UserOutlined />} />
				</Col>
				<Col xs={24} sm={12} lg={6}>
					<KpiCard title="累计宝宝" value={overview?.totalBabies ?? 0} sub="已创建的宝宝档案" icon={<SmileOutlined />} tone="cyan" />
				</Col>
				<Col xs={24} sm={12} lg={6}>
					<KpiCard title="累计记录" value={overview?.totalRecords ?? 0} sub={`今日新增 ${overview?.todayRecords ?? 0}`} icon={<FileTextOutlined />} tone="green" />
				</Col>
				<Col xs={24} sm={12} lg={6}>
					<KpiCard title="今日活跃用户" value={overview?.todayActiveUsers ?? 0} sub={`近 7 日活跃 ${overview?.weekActiveUsers ?? 0}`} icon={<TeamOutlined />} tone="gold" />
				</Col>
				<Col xs={24} sm={12} lg={6}>
					<KpiCard title="AI 便便分析" value={overview?.aiAnalysisTotal ?? 0} sub={`今日新增 ${overview?.aiAnalysisToday ?? 0}`} icon={<RobotOutlined />} tone="purple" />
				</Col>
				<Col xs={24} sm={12} lg={6}>
					<KpiCard title="累计照片" value={overview?.totalPhotos ?? 0} sub={`家庭成员 ${overview?.familyMembers ?? 0}`} icon={<CameraOutlined />} tone="coral" />
				</Col>
				<Col xs={24} sm={12} lg={6}>
					<KpiCard title="今日新增用户" value={overview?.todayUsers ?? 0} sub="今日完成注册的用户" icon={<UserAddOutlined />} tone="rose" />
				</Col>
				<Col xs={24} sm={12} lg={6}>
					<KpiCard title="今日新增宝宝" value={overview?.todayBabies ?? 0} sub="今日新建的宝宝档案" icon={<RiseOutlined />} tone="indigo" />
				</Col>
			</Row>

			<Card
				title="趋势"
				className="chart-card"
				style={{ marginBottom: 16 }}
				extra={<Segmented options={DAYS_OPTIONS} value={days} onChange={(value) => setDays(value as number)} />}
			>
				<Row gutter={16}>
					<Col xs={24} lg={12}>
						<ReactECharts option={newUserOption} style={{ height: CHART_HEIGHT }} notMerge />
					</Col>
					<Col xs={24} lg={12}>
						<ReactECharts option={recordActiveOption} style={{ height: CHART_HEIGHT }} notMerge />
					</Col>
				</Row>
			</Card>

			<Row gutter={16}>
				<Col xs={24} lg={14}>
					<Card title="记录类型分布" className="chart-card">
						<ReactECharts option={recordTypeOption} style={{ height: CHART_HEIGHT }} notMerge />
					</Card>
				</Col>
				<Col xs={24} lg={10}>
					<Card title="宝宝性别分布" className="chart-card">
						<ReactECharts option={genderOption} style={{ height: CHART_HEIGHT }} notMerge />
					</Card>
				</Col>
			</Row>
		</Spin>
	);
}
